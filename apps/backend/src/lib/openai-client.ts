import OpenAI from "openai";

/**
 * Model configuration per ADR-013.
 * Pinned version for reproducibility.
 */
export const MODEL_CONFIG = {
  model: "gpt-4o-2024-08-06",
  temperature: 0.3,
  maxTokens: 4096,
  timeoutMs: 60_000,
  maxRetries: 1,
} as const;

/**
 * Cost per token for GPT-4o (as of ADR-013 cost analysis).
 * Used to compute estimated cost per generation.
 */
export const TOKEN_COST = {
  inputPer1K: 0.005,
  outputPer1K: 0.015,
} as const;

let client: OpenAI | undefined;

/**
 * Get or create the OpenAI client singleton.
 * Reads OPENAI_API_KEY from environment.
 * Configured with 60s timeout and 1 retry per ADR-013.
 *
 * @throws Error if OPENAI_API_KEY is not set
 */
export function getOpenAIClient(): OpenAI {
  if (client) return client;

  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY env var is required for AI narrative generation.");
  }

  client = new OpenAI({
    apiKey,
    timeout: MODEL_CONFIG.timeoutMs,
    maxRetries: MODEL_CONFIG.maxRetries,
  });

  return client;
}

/**
 * Compute estimated cost in USD from token counts per ADR-013 cost analysis.
 */
export function computeCostUsd(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1000) * TOKEN_COST.inputPer1K;
  const outputCost = (outputTokens / 1000) * TOKEN_COST.outputPer1K;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

/**
 * Reset the client singleton. Used in tests to clear state between runs.
 */
export function resetOpenAIClient(): void {
  client = undefined;
}
