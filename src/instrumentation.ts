/**
 * Next.js instrumentation file — runs once before the app starts.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Initializes OpenTelemetry with the LangfuseSpanProcessor only when
 * Langfuse is configured and enabled.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initTracing, shouldUseLangfuse } = await import("@/lib/llm/tracing");
    if (shouldUseLangfuse()) initTracing();
  }
}
