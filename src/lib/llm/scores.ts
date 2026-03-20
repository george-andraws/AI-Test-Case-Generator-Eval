import { getLangfuseClient } from "./tracing";

export type ScoreSource = "human" | "llm_judge";

export interface ScoreParams {
  traceId: string;
  name: string;
  /** Numeric score value. */
  value: number;
  comment?: string;
  source: ScoreSource;
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
export async function scoreTrace(params: ScoreParams): Promise<void> {
  const client = getLangfuseClient();
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
