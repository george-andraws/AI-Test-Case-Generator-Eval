import type { Provider } from "@/lib/config";

export interface TraceContext {
  /** Human-readable name shown in the Langfuse trace list. */
  traceName?: string;
  /** Role of this call in the pipeline. Used as a tag. */
  role: "generator" | "judge";
  /** URL of the eval run / page, stored as trace metadata. */
  url?: string;
  /** Experiment / revision number, stored as trace metadata. */
  revision?: string | number;
  /** Any extra tags to attach to the trace. */
  tags?: string[];
}

export interface LLMRequest {
  provider: Provider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
  /** Optional tracing context — every field ends up in Langfuse. */
  traceContext?: TraceContext;
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface LLMResponse {
  text: string;
  model: string;
  provider: Provider;
  tokenUsage: TokenUsage;
  latencyMs: number;
  /** OTEL trace ID (hex) — use this to attach scores in Langfuse. */
  traceId: string;
}
