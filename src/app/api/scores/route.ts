import { NextRequest, NextResponse } from "next/server";
import { scoreTrace } from "@/lib/llm";

interface ScoreEntry {
  score: number;
  langfuseTraceId: string;
}

interface ScoresRequestBody {
  scores: Record<string, ScoreEntry>;
}

export async function POST(req: NextRequest) {
  try {
    let body: ScoresRequestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const { scores } = body;
    if (!scores || typeof scores !== "object") {
      return NextResponse.json(
        { success: false, error: "Missing required field: scores" },
        { status: 400 }
      );
    }

    await Promise.all(
      Object.entries(scores).map(([modelId, entry]) =>
        scoreTrace({
          traceId: entry.langfuseTraceId,
          name: "human-score",
          value: entry.score,
          comment: `Human score for model: ${modelId}`,
          source: "human",
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
