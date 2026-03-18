import OpenAI from "openai";
import {
  AISummaryOutputSchema,
  type AISummaryResult,
  type AITicket,
  type RuleEngineOutput,
  type FallbackReason,
  type GenerationMetadata,
} from "../domain/recommendation.js";
import type { AuditMetrics } from "../domain/audit.js";
import {
  SYSTEM_PROMPT_V1,
  PROMPT_VERSION,
  buildUserPrompt,
  computeHash,
} from "./prompt-library.js";
import { getOpenAIClient, MODEL_CONFIG, computeCostUsd } from "../lib/openai-client.js";

/** Valid CWV metric names that the rule engine can produce. */
const VALID_METRICS = new Set(["lcp", "cls", "tbt", "fcp", "ttfb"]);

/**
 * Build a fallback result when AI is unavailable per ADR-013 fallback strategy.
 * Returns rule engine output only — product always works without AI.
 */
function buildFallbackResult(
  auditId: string,
  ruleEngineOutput: RuleEngineOutput[],
  reason: FallbackReason
): AISummaryResult {
  return {
    auditId,
    executiveSummary: null,
    tickets: ruleEngineOutput,
    aiAvailable: false,
    fallbackReason: reason,
  };
}

/**
 * Validate AI output against rule engine output per ADR-013 §Validation.
 * 5-step post-processing validation:
 * 1. Schema validation (Zod parse) — done before this function
 * 2. Ticket count match
 * 3. Priority preservation
 * 4. Category preservation
 * 5. No hallucination check
 *
 * Returns corrected tickets (with overrides applied) or null if unrecoverable.
 */
function validateAndCorrectTickets(
  tickets: AITicket[],
  ruleEngineOutput: RuleEngineOutput[]
): AITicket[] | null {
  // Step 2: Ticket count match
  if (tickets.length !== ruleEngineOutput.length) {
    return null;
  }

  const correctedTickets: AITicket[] = [];

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i]!;
    const ruleItem = ruleEngineOutput[i]!;

    // Step 5: No hallucination check — metric must exist in valid set
    if (!VALID_METRICS.has(ticket.metric)) {
      return null;
    }

    // Step 3 & 4: Override priority and category with rule engine values
    correctedTickets.push({
      ...ticket,
      priority: ruleItem.severity,
      category: ruleItem.category,
    });
  }

  return correctedTickets;
}

/**
 * Call OpenAI Chat Completions API with the configured model and prompts.
 * Returns the raw API response or throws on network/API errors.
 */
async function callOpenAI(userPrompt: string): Promise<OpenAI.ChatCompletion> {
  const client = getOpenAIClient();

  return client.chat.completions.create({
    model: MODEL_CONFIG.model,
    temperature: MODEL_CONFIG.temperature,
    max_tokens: MODEL_CONFIG.maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT_V1 },
      { role: "user", content: userPrompt },
    ],
  });
}

/**
 * Parse and validate the OpenAI response content.
 * Returns validated AISummaryOutput or null if parsing/validation fails.
 */
function parseAIResponse(
  content: string | null,
  ruleEngineOutput: RuleEngineOutput[]
): { executiveSummary: string; tickets: AITicket[] } | null {
  if (!content) return null;

  // Step 1: JSON parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  // Step 1: Zod schema validation
  const zodResult = AISummaryOutputSchema.safeParse(parsed);
  if (!zodResult.success) return null;

  // Steps 2-5: Validate and correct tickets
  const correctedTickets = validateAndCorrectTickets(zodResult.data.tickets, ruleEngineOutput);
  if (!correctedTickets) return null;

  return {
    executiveSummary: zodResult.data.executiveSummary,
    tickets: correctedTickets,
  };
}

/**
 * Build generation metadata for Firestore storage per ADR-013 versioning strategy.
 */
function buildMetadata(
  userPrompt: string,
  completion: OpenAI.ChatCompletion,
  latencyMs: number
): GenerationMetadata {
  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;

  return {
    modelVersion: MODEL_CONFIG.model,
    promptHash: computeHash(SYSTEM_PROMPT_V1),
    promptVersion: PROMPT_VERSION,
    temperature: MODEL_CONFIG.temperature,
    inputHash: computeHash(userPrompt),
    generatedAt: new Date().toISOString(),
    latencyMs,
    inputTokens,
    outputTokens,
    costUsd: computeCostUsd(inputTokens, outputTokens),
  };
}

/**
 * Classify an OpenAI API error into a fallback reason per ADR-013 fallback strategy.
 */
function classifyError(error: unknown): FallbackReason {
  if (error instanceof OpenAI.APIConnectionTimeoutError) return "timeout";
  if (error instanceof OpenAI.RateLimitError) return "rate_limited";
  return "openai_unavailable";
}

/**
 * Generate an AI-enhanced summary with executive narrative and developer tickets.
 * Implements the full ADR-013 Layer 2 pipeline:
 *
 * 1. Build user prompt from audit data + rule engine output
 * 2. Call OpenAI GPT-4o with JSON mode
 * 3. Parse and validate response (Zod + 5-step post-processing)
 * 4. On validation failure: retry once, then fallback
 * 5. On API error: fallback to rule engine output only
 *
 * @param auditId - The audit job ID
 * @param url - The audited URL
 * @param strategy - Audit strategy (mobile/desktop)
 * @param metrics - CWV metrics from the audit
 * @param ruleEngineOutput - Deterministic recommendations from the rule engine
 * @returns AISummaryResult with AI content or fallback
 */
export async function generateAISummary(
  auditId: string,
  url: string,
  strategy: string,
  metrics: AuditMetrics,
  ruleEngineOutput: RuleEngineOutput[]
): Promise<AISummaryResult> {
  // No recommendations → no AI summary needed
  if (ruleEngineOutput.length === 0) {
    return {
      auditId,
      executiveSummary: null,
      tickets: [],
      aiAvailable: true,
    };
  }

  const userPrompt = buildUserPrompt(url, strategy, metrics, ruleEngineOutput);

  // Attempt 1
  let completion: OpenAI.ChatCompletion;
  let startTime: number;
  try {
    startTime = Date.now();
    completion = await callOpenAI(userPrompt);
  } catch (error: unknown) {
    return buildFallbackResult(auditId, ruleEngineOutput, classifyError(error));
  }

  const latencyMs = Date.now() - startTime;
  const responseContent = completion.choices[0]?.message?.content ?? null;
  const validated = parseAIResponse(responseContent, ruleEngineOutput);

  if (validated) {
    return {
      auditId,
      executiveSummary: validated.executiveSummary,
      tickets: validated.tickets,
      aiAvailable: true,
      metadata: buildMetadata(userPrompt, completion, latencyMs),
    };
  }

  // Attempt 2: Retry once with same prompt (per ADR-013 validation failure flow)
  try {
    startTime = Date.now();
    completion = await callOpenAI(userPrompt);
  } catch (error: unknown) {
    return buildFallbackResult(auditId, ruleEngineOutput, classifyError(error));
  }

  const retryLatencyMs = Date.now() - startTime;
  const retryContent = completion.choices[0]?.message?.content ?? null;
  const retryValidated = parseAIResponse(retryContent, ruleEngineOutput);

  if (retryValidated) {
    return {
      auditId,
      executiveSummary: retryValidated.executiveSummary,
      tickets: retryValidated.tickets,
      aiAvailable: true,
      metadata: buildMetadata(userPrompt, completion, retryLatencyMs),
    };
  }

  // Both attempts failed validation → fallback
  return buildFallbackResult(auditId, ruleEngineOutput, "validation_failed");
}
