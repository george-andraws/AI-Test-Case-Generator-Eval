import OpenAI from "openai";
import type { LLMRequest, LLMResponse } from "./types";

type AdapterResponse = Omit<LLMResponse, "traceId">;

export async function callGrok(req: LLMRequest): Promise<AdapterResponse> {
  const client = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: "https://api.x.ai/v1",
  });

  const start = Date.now();

  const userContent: OpenAI.Chat.ChatCompletionUserMessageParam["content"] =
    req.images && req.images.length > 0
      ? [
          ...req.images.map(
            (img): OpenAI.Chat.ChatCompletionContentPartImage => ({
              type: "image_url",
              image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
            })
          ),
          { type: "text", text: req.userPrompt },
        ]
      : req.userPrompt;

  const completion = await client.chat.completions.create({
    model: req.model,
    max_tokens: req.maxTokens,
    temperature: req.temperature,
    messages: [
      { role: "system", content: req.systemPrompt },
      { role: "user", content: userContent },
    ],
  });

  const latencyMs = Date.now() - start;

  const choice = completion.choices[0];
  if (!choice?.message.content) {
    throw new Error("Grok returned no content");
  }

  return {
    text: choice.message.content,
    model: completion.model,
    provider: "grok",
    tokenUsage: {
      input: completion.usage?.prompt_tokens ?? 0,
      output: completion.usage?.completion_tokens ?? 0,
    },
    latencyMs,
  };
}
