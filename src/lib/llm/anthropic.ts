import Anthropic from "@anthropic-ai/sdk";
import type { LLMRequest, LLMResponse } from "./types";

type AdapterResponse = Omit<LLMResponse, "traceId">;

export async function callAnthropic(req: LLMRequest): Promise<AdapterResponse> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const start = Date.now();

  const userContent: Anthropic.MessageParam["content"] =
    req.images && req.images.length > 0
      ? [
          ...req.images.map(
            (img): Anthropic.ImageBlockParam => ({
              type: "image",
              source: {
                type: "base64",
                media_type: img.mimeType as Anthropic.Base64ImageSource["media_type"],
                data: img.base64,
              },
            })
          ),
          { type: "text", text: req.userPrompt },
        ]
      : req.userPrompt;

  const message = await client.messages.create({
    model: req.model,
    max_tokens: req.maxTokens,
    temperature: req.temperature,
    system: req.systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  const latencyMs = Date.now() - start;

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic returned no text content");
  }

  return {
    text: textBlock.text,
    model: message.model,
    provider: "anthropic",
    tokenUsage: {
      input: message.usage.input_tokens,
      output: message.usage.output_tokens,
    },
    latencyMs,
  };
}
