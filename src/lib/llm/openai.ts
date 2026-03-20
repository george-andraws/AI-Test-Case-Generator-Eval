import OpenAI from "openai";
import type { LLMRequest, LLMResponse } from "./types";

type AdapterResponse = Omit<LLMResponse, "traceId">;

export async function callOpenAI(req: LLMRequest): Promise<AdapterResponse> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const start = Date.now();

  const completion = await client.chat.completions.create({
    model: req.model,
    max_tokens: req.maxTokens,
    temperature: req.temperature,
    messages: [
      { role: "system", content: req.systemPrompt },
      { role: "user", content: req.userPrompt },
    ],
  });

  const latencyMs = Date.now() - start;

  const choice = completion.choices[0];
  if (!choice?.message.content) {
    throw new Error("OpenAI returned no content");
  }

  return {
    text: choice.message.content,
    model: completion.model,
    provider: "openai",
    tokenUsage: {
      input: completion.usage?.prompt_tokens ?? 0,
      output: completion.usage?.completion_tokens ?? 0,
    },
    latencyMs,
  };
}
