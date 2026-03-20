import { NextRequest, NextResponse } from "next/server";
import config from "@/lib/config";
import { callLLM } from "@/lib/llm";

export const maxDuration = 120;

interface GenerateRequestBody {
  url: string;
  testMethodology: string;
  productRequirements: string;
  /** When provided, run only this single generator model. */
  modelId?: string;
}

interface ModelResult {
  success: boolean;
  output?: string;
  tokenUsage?: { input: number; output: number };
  latencyMs?: number;
  langfuseTraceId?: string;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    let body: GenerateRequestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { url, testMethodology, productRequirements, modelId } = body;
    if (!url || !testMethodology || !productRequirements) {
      return NextResponse.json(
        { error: "Missing required fields: url, testMethodology, productRequirements" },
        { status: 400 }
      );
    }

    const modelsToRun = modelId
      ? config.generators.filter((m) => m.id === modelId)
      : config.generators;

    if (modelsToRun.length === 0) {
      return NextResponse.json({ error: `Unknown modelId: ${modelId}` }, { status: 400 });
    }

    const userPrompt = `Application under test: ${url}

Product Requirements:
${productRequirements}

Based on the above requirements, generate comprehensive test cases for this application.`;

    const tasks = modelsToRun.map((model) =>
      callLLM({
        provider: model.provider,
        model: model.model,
        systemPrompt: testMethodology,
        userPrompt,
        maxTokens: model.maxTokens,
        temperature: model.temperature,
        traceContext: {
          traceName: `generate: ${model.id}`,
          role: "generator",
          url,
          tags: ["generate", model.id],
        },
      }).then(
        (res): [string, ModelResult] => [
          model.id,
          {
            success: true,
            output: res.text,
            tokenUsage: res.tokenUsage,
            latencyMs: res.latencyMs,
            langfuseTraceId: res.traceId,
          },
        ]
      )
    );

    const settled = await Promise.allSettled(tasks);

    const results: Record<string, ModelResult> = {};
    settled.forEach((outcome, i) => {
      const modelId = modelsToRun[i].id;
      if (outcome.status === "fulfilled") {
        const [id, result] = outcome.value;
        results[id] = result;
      } else {
        results[modelId] = {
          success: false,
          error:
            outcome.reason instanceof Error
              ? outcome.reason.message
              : String(outcome.reason),
        };
      }
    });

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
