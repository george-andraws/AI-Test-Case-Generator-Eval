/**
 * Next.js instrumentation file — runs once before the app starts.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Initializes OpenTelemetry with the LangfuseSpanProcessor so every
 * callLLM() call is automatically traced, regardless of which route
 * or server action triggers it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initTracing } = await import("@/lib/llm/tracing");
    initTracing();
  }
}
