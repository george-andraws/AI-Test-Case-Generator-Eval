import type { ModelConfig } from "@/lib/config";
import { ScoreSelector } from "./ScoreSelector";
import { JudgeScoreSection, type JudgePanelEntry } from "./JudgeScoreSection";

export interface GeneratorPanel {
  id: string;
  name: string;
  model: string;
  status: "idle" | "loading" | "success" | "error";
  output?: string;
  tokenUsage?: { input: number; output: number };
  latencyMs?: number;
  langfuseTraceId?: string;
  error?: string;
  humanScore?: number;
}

interface Props {
  panel: GeneratorPanel;
  judgeModels: ModelConfig[];
  judgeResults: Record<string, JudgePanelEntry>;
  onScoreChange: (score: number) => void;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2 animate-pulse p-4">
      <div className="h-3 bg-gray-200 rounded w-full" />
      <div className="h-3 bg-gray-200 rounded w-5/6" />
      <div className="h-3 bg-gray-200 rounded w-4/6" />
      <div className="h-3 bg-gray-200 rounded w-full mt-3" />
      <div className="h-3 bg-gray-200 rounded w-3/4" />
      <div className="h-3 bg-gray-200 rounded w-5/6" />
    </div>
  );
}

function StatusDot({ status }: { status: GeneratorPanel["status"] }) {
  if (status === "loading")
    return (
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
    );
  if (status === "success")
    return <span className="inline-block h-2 w-2 rounded-full bg-green-500" />;
  if (status === "error")
    return <span className="inline-block h-2 w-2 rounded-full bg-red-400" />;
  return null;
}

export function ModelOutputPanel({ panel, judgeModels, judgeResults, onScoreChange }: Props) {
  const totalTokens =
    panel.tokenUsage
      ? (panel.tokenUsage.input + panel.tokenUsage.output).toLocaleString()
      : null;
  const latency = panel.latencyMs
    ? `${(panel.latencyMs / 1000).toFixed(1)}s`
    : null;

  return (
    <div className="flex flex-col border border-gray-200 rounded-lg bg-white min-w-80 w-80 shrink-0 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        <StatusDot status={panel.status} />
        <span className="text-sm font-semibold text-gray-800 truncate">{panel.name}</span>
        {panel.status === "loading" && (
          <span className="ml-auto text-xs text-gray-400">Generating…</span>
        )}
      </div>

      {/* ── Content area (scrollable) ── */}
      <div className="flex-1 overflow-y-auto" style={{ maxHeight: "22rem" }}>
        {panel.status === "loading" && <LoadingSkeleton />}

        {panel.status === "error" && (
          <div className="p-4 text-sm text-red-600">
            <p className="font-medium">API error</p>
            <p className="mt-1 text-red-500">{panel.error ?? "Unknown error"}</p>
          </div>
        )}

        {panel.status === "success" && panel.output && (
          <pre className="p-4 font-mono text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
            {panel.output}
          </pre>
        )}
      </div>

      {/* ── Footer: latency + tokens ── */}
      {panel.status === "success" && (latency || totalTokens) && (
        <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
          {[latency, totalTokens ? `${totalTokens} tokens` : null]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}

      {/* ── Human score selector ── */}
      {panel.status === "success" && (
        <div className="border-t border-gray-100 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-gray-500">Human score</p>
          <ScoreSelector value={panel.humanScore} onChange={onScoreChange} />
        </div>
      )}

      {/* ── Judge scores ── */}
      {panel.status === "success" && (
        <JudgeScoreSection judgeModels={judgeModels} results={judgeResults} />
      )}
    </div>
  );
}
