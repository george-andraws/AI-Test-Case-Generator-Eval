import { GoogleGenAI } from "@google/genai";
import type { LLMRequest, LLMResponse } from "./types";

type AdapterResponse = Omit<LLMResponse, "traceId">;

export async function callGoogle(req: LLMRequest): Promise<AdapterResponse> {
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

  const start = Date.now();

  const response = await ai.models.generateContent({
    model: req.model,
    config: {
      maxOutputTokens: req.maxTokens,
      temperature: req.temperature,
      systemInstruction: req.systemPrompt,
    },
    contents: req.userPrompt,
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
