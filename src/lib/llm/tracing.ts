import { NodeSDK } from "@opentelemetry/sdk-node";
import { trace } from "@opentelemetry/api";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { LangfuseClient } from "@langfuse/client";
import config from "@/lib/config";

let _sdk: NodeSDK | null = null;
let _client: LangfuseClient | null = null;

export function initTracing(): void {
  if (_sdk) return;

  const { langfuse: lf } = config;
  const publicKey = process.env[lf.publicKeyEnvVar];
  const secretKey = process.env[lf.secretKeyEnvVar];

  if (!publicKey || !secretKey) {
    throw new Error(
      `Langfuse env vars not set: ${lf.publicKeyEnvVar}, ${lf.secretKeyEnvVar}`
    );
  }

  _sdk = new NodeSDK({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey,
        secretKey,
        baseUrl: lf.baseUrl,
        // "immediate" is better for scripts and serverless;
        // switch to "batched" for long-running server processes
        exportMode: "immediate",
      }),
    ],
  });

  _sdk.start();

  _client = new LangfuseClient({ publicKey, secretKey, baseUrl: lf.baseUrl });
}

export function getTracer() {
  return trace.getTracer("test-case-eval-tool");
}

export function getLangfuseClient(): LangfuseClient {
  if (!_client) {
    // Create a scoring-only client from env vars directly.
    // This works even in routes that never call callLLM (e.g. /api/scores).
    const { langfuse: lf } = config;
    const publicKey = process.env[lf.publicKeyEnvVar];
    const secretKey = process.env[lf.secretKeyEnvVar];
    if (!publicKey || !secretKey) {
      throw new Error(
        `Langfuse env vars not set: ${lf.publicKeyEnvVar}, ${lf.secretKeyEnvVar}`
      );
    }
    _client = new LangfuseClient({ publicKey, secretKey, baseUrl: lf.baseUrl });
  }
  return _client;
}

/** Flush all buffered spans and scores, then shut down the SDK. */
export async function flushTracing(): Promise<void> {
  if (_sdk) {
    await _sdk.shutdown();
    _sdk = null;
    _client = null;
  }
}
