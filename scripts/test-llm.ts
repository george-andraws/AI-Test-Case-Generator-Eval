/**
 * Smoke-test all three LLM adapters and verify traces appear in Langfuse.
 * Run with:  npm run test:llm
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

// initTracing must be called before any callLLM invocation
import { initTracing, callLLM, flushTracing } from "../src/lib/llm";
import type { LLMRequest } from "../src/lib/llm";

const SYSTEM_PROMPT = "You are a concise assistant. Always reply in one sentence.";
const USER_PROMPT = "Reply with exactly one sentence: what is 3 + 2 and why?";

const requests: LLMRequest[] = [
  {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001", // dev model
    //model: "claude-sonnet-4-20250514", // production latest
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: USER_PROMPT,
    maxTokens: 128,
    temperature: 0.3,
    traceContext: {
      traceName: "smoke-test: anthropic",
      role: "generator",
      url: "http://localhost:3000",
      revision: 1,
      tags: ["smoke-test"],
    },
  },
  {
    provider: "openai",
    model: "gpt-4.1",
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: USER_PROMPT,
    maxTokens: 128,
    temperature: 0.3,
    traceContext: {
      traceName: "smoke-test: openai",
      role: "generator",
      url: "http://localhost:3000",
      revision: 1,
      tags: ["smoke-test"],
    },
  },
  {
    provider: "google",
    model: "gemini-3.1-flash-lite-preview",
    //model: "gemini-3-flash-preview",    // next best fallback option
    //model: "gemini-2.0-flash-lite-001", // unavailable? cheap for dev and testing
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: USER_PROMPT,
    maxTokens: 128,
    temperature: 0.3,
    traceContext: {
      traceName: "smoke-test: google",
      role: "generator",
      url: "http://localhost:3000",
      revision: 1,
      tags: ["smoke-test"],
    },
  },
];

async function main() {
  initTracing();
  console.log("Testing LLM adapters with Langfuse tracing...\n");

  for (const req of requests) {
    process.stdout.write(`[${req.provider}/${req.model}] ... `);
    try {
      const res = await callLLM(req);
      console.log("OK");
      console.log(`  text     : ${res.text.trim()}`);
      console.log(`  tokens   : ${res.tokenUsage.input} in / ${res.tokenUsage.output} out`);
      console.log(`  latency  : ${res.latencyMs}ms`);
      console.log(`  traceId  : ${res.traceId}`);
      console.log(`  langfuse : https://us.cloud.langfuse.com/trace/${res.traceId}\n`);
    } catch (err) {
      console.log("FAILED");
      console.error(`  error    : ${err instanceof Error ? err.message : err}\n`);
    }
  }

  process.stdout.write("Flushing traces to Langfuse... ");
  await flushTracing();
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
