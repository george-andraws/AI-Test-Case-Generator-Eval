import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { getTracer } from "./tracing";
import { callAnthropic } from "./anthropic";
import { callOpenAI } from "./openai";
import { callGoogle } from "./google";
import type { LLMRequest, LLMResponse } from "./types";

export type { LLMRequest, LLMResponse, TokenUsage, TraceContext } from "./types";
export { initTracing, flushTracing, getLangfuseClient } from "./tracing";
export { scoreTrace } from "./scores";
export type { ScoreParams, ScoreSource } from "./scores";

/**
 * Provider-agnostic LLM call with automatic Langfuse tracing via OpenTelemetry.
 *
 * Every call creates a Langfuse trace tagged with model, provider, role, URL,
 * and revision. The returned `traceId` can be used later to attach scores.
 */
export async function callLLM(req: LLMRequest): Promise<LLMResponse> {
  const tracer = getTracer();
  const ctx = req.traceContext;
  const spanName = ctx?.traceName ?? `${req.provider}.chat`;

  const span = tracer.startSpan(spanName);
  const spanCtx = trace.setSpan(context.active(), span);

  // ── gen_ai semantic conventions ──────────────────────────────────────────
  span.setAttribute("gen_ai.system", req.provider);
  span.setAttribute("gen_ai.request.model", req.model);
  span.setAttribute("gen_ai.operation.name", "chat");
  span.setAttribute("gen_ai.request.max_tokens", req.maxTokens);
  span.setAttribute("gen_ai.request.temperature", req.temperature);

  // ── Langfuse observation (generation) ────────────────────────────────────
  span.setAttribute("langfuse.observation.model.name", req.model);
  span.setAttribute(
    "langfuse.observation.model.parameters",
    JSON.stringify({ maxTokens: req.maxTokens, temperature: req.temperature })
  );
  span.setAttribute(
    "langfuse.observation.input",
    JSON.stringify([
      { role: "system", content: req.systemPrompt },
      { role: "user", content: req.userPrompt },
    ])
  );

  // ── Langfuse trace-level metadata ─────────────────────────────────────────
  if (ctx) {
    const tags = [ctx.role, req.provider, req.model, ...(ctx.tags ?? [])];
    span.setAttribute("langfuse.trace.tags", JSON.stringify(tags));
    span.setAttribute(
      "langfuse.trace.metadata",
      JSON.stringify({
        role: ctx.role,
        model: req.model,
        provider: req.provider,
        ...(ctx.url !== undefined && { url: ctx.url }),
        ...(ctx.revision !== undefined && { revision: ctx.revision }),
      })
    );
  }

  let response: Omit<LLMResponse, "traceId">;

  try {
    response = await context.with(spanCtx, async () => {
      switch (req.provider) {
        case "anthropic":
          return callAnthropic(req);
        case "openai":
          return callOpenAI(req);
        case "google":
          return callGoogle(req);
        default:
          throw new Error(`Unknown provider: ${req.provider}`);
      }
    });
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    span.end();
    throw err;
  }

  // ── Record response attributes ────────────────────────────────────────────
  span.setAttribute("gen_ai.usage.input_tokens", response.tokenUsage.input);
  span.setAttribute("gen_ai.usage.output_tokens", response.tokenUsage.output);
  span.setAttribute("langfuse.observation.output", response.text);
  span.setAttribute(
    "langfuse.observation.usage_details",
    JSON.stringify({
      input: response.tokenUsage.input,
      output: response.tokenUsage.output,
    })
  );
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();

  const traceId = span.spanContext().traceId;
  return { ...response, traceId };
}
