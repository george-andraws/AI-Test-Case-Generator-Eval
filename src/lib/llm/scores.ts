import { getLangfuseClient, shouldUseLangfuse } from "./tracing";

export type ScoreSource = "human" | "llm_judge";

export interface ScoreParams {
  traceId: string;
  name: string;
  /** Numeric score value. */
  value: number;
  comment?: string;
  source: ScoreSource;
}

export interface ScoreOptions {
  enabled?: boolean;
}

/**
 * Send a score to Langfuse for a previously completed trace.
 *
 * Call this:
 * - From your "Submit scores" handler (source: "human")
 * - After a judge model finishes evaluation (source: "llm_judge")
 *
 * @example
 * await scoreTrace({ traceId, name: "correctness", value: 0.9, source: "llm_judge" });
 */
export async function scoreTrace(params: ScoreParams, options?: ScoreOptions): Promise<void> {
  if (!shouldUseLangfuse(options?.enabled)) return;
  const client = getLangfuseClient();
  if (!client) return;
  client.score.create({
    traceId: params.traceId,
    name: params.name,
    value: params.value,
    comment: params.comment,
    dataType: "NUMERIC",
    metadata: { source: params.source },
  });
  await client.score.flush();
}
