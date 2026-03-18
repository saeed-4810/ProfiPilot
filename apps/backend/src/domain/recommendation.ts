import { z } from "zod";

/**
 * Severity levels for rule engine recommendations per ADR-013.
 * Maps to priority in developer tickets.
 */
export const Severity = {
  P0: "P0",
  P1: "P1",
  P2: "P2",
  P3: "P3",
} as const;

export type Severity = (typeof Severity)[keyof typeof Severity];

/**
 * CWV metric rating per web.dev thresholds (ADR-013 Layer 1).
 */
export const MetricRating = {
  GOOD: "good",
  NEEDS_IMPROVEMENT: "needs-improvement",
  POOR: "poor",
} as const;

export type MetricRating = (typeof MetricRating)[keyof typeof MetricRating];

/**
 * Issue category per ADR-013.
 * Maps metrics to performance domains.
 */
export const IssueCategory = {
  LOADING: "loading",
  INTERACTIVITY: "interactivity",
  VISUAL_STABILITY: "visual-stability",
  SERVER: "server",
  RENDERING: "rendering",
} as const;

export type IssueCategory = (typeof IssueCategory)[keyof typeof IssueCategory];

/**
 * Zod schema for rule engine evidence — threshold vs actual comparison.
 */
export const RuleEngineEvidenceSchema = z.object({
  threshold: z.number(),
  actual: z.number(),
  delta: z.string(),
});

export type RuleEngineEvidence = z.infer<typeof RuleEngineEvidenceSchema>;

/**
 * Zod schema for a single rule engine output item per ADR-013 Layer 1.
 * Deterministic: same input always produces the same output.
 */
export const RuleEngineOutputSchema = z.object({
  ruleId: z.string(),
  metric: z.string(),
  value: z.number(),
  unit: z.string(),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  severity: z.enum(["P0", "P1", "P2", "P3"]),
  category: z.enum(["loading", "interactivity", "visual-stability", "server", "rendering"]),
  suggestedFix: z.string(),
  evidence: RuleEngineEvidenceSchema,
});

export type RuleEngineOutput = z.infer<typeof RuleEngineOutputSchema>;

/**
 * Zod schema for a single AI-generated developer ticket per ADR-013 Layer 2.
 */
export const AITicketSchema = z.object({
  title: z.string().min(10).max(200),
  description: z.string().min(50).max(1000),
  priority: z.enum(["P0", "P1", "P2", "P3"]),
  category: z.enum(["loading", "interactivity", "visual-stability", "server", "rendering"]),
  metric: z.string(),
  currentValue: z.string(),
  targetValue: z.string(),
  estimatedImpact: z.enum(["critical", "high", "medium", "low"]),
  suggestedFix: z.string().min(50).max(2000),
});

export type AITicket = z.infer<typeof AITicketSchema>;

/**
 * Zod schema for the full AI summary output per ADR-013.
 * Validated after GPT-4o response parsing.
 */
export const AISummaryOutputSchema = z.object({
  executiveSummary: z.string().min(100).max(3000),
  tickets: z.array(AITicketSchema),
});

export type AISummaryOutput = z.infer<typeof AISummaryOutputSchema>;

/**
 * Fallback reason when AI is unavailable per ADR-013 fallback strategy.
 */
export type FallbackReason =
  | "openai_unavailable"
  | "validation_failed"
  | "timeout"
  | "rate_limited";

/**
 * Generation metadata stored in Firestore summaries collection per ADR-013.
 * 10 fields tracked per generation for reproducibility and cost monitoring.
 */
export interface GenerationMetadata {
  modelVersion: string;
  promptHash: string;
  promptVersion: string;
  temperature: number;
  inputHash: string;
  generatedAt: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * Full AI summary result — includes content + metadata + fallback info.
 * This is the shape stored in Firestore and returned by the AI narrative service.
 */
export interface AISummaryResult {
  auditId: string;
  executiveSummary: string | null;
  tickets: AITicket[] | RuleEngineOutput[];
  aiAvailable: boolean;
  fallbackReason?: FallbackReason | undefined;
  metadata?: GenerationMetadata | undefined;
}

/**
 * Recommendation document shape for Firestore persistence per database-schema.md.
 */
export interface RecommendationDocument {
  auditId: string;
  ruleId: string;
  metric: string;
  currentValue: string;
  targetValue: string;
  severity: Severity;
  category: IssueCategory;
  suggestedFix: string;
  evidence: RuleEngineEvidence;
  createdAt: string;
}

/**
 * Summary document shape for Firestore persistence per database-schema.md.
 */
export interface SummaryDocument {
  auditId: string;
  modelVersion: string;
  promptHash: string;
  promptVersion: string;
  temperature: number;
  inputHash: string;
  content: AISummaryOutput;
  generatedAt: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}
