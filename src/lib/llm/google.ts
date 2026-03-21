import { GoogleGenAI } from "@google/genai";
import type { Part } from "@google/genai";
import type { LLMRequest, LLMResponse } from "./types";

type AdapterResponse = Omit<LLMResponse, "traceId">;

export async function callGoogle(req: LLMRequest): Promise<AdapterResponse> {
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

  const start = Date.now();

  const contents =
    req.images && req.images.length > 0
      ? [
          ...req.images.map(
            (img): Part => ({
              inlineData: { mimeType: img.mimeType, data: img.base64 },
            })
          ),
          { text: req.userPrompt } satisfies Part,
        ]
      : req.userPrompt;

  const response = await ai.models.generateContent({
    model: req.model,
    config: {
      maxOutputTokens: req.maxTokens,
      temperature: req.temperature,
      systemInstruction: req.systemPrompt,
    },
    contents,
  });

  const latencyMs = Date.now() - start;

  const text = response.text;
  if (!text) {
    throw new Error("Google returned no text content");
  }

  return {
    text,
    model: req.model,
    provider: "google",
    tokenUsage: {
      input: response.usageMetadata?.promptTokenCount ?? 0,
      output: response.usageMetadata?.candidatesTokenCount ?? 0,
    },
    latencyMs,
  };
}
