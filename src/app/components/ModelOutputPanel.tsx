import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

function ClipboardIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function ModelOutputPanel({ panel, judgeModels, judgeResults, onScoreChange }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!panel.output) return;
    navigator.clipboard.writeText(panel.output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const totalTokens =
    panel.tokenUsage
      ? (panel.tokenUsage.input + panel.tokenUsage.output).toLocaleString()
      : null;
  const latency = panel.latencyMs
    ? `${(panel.latencyMs / 1000).toFixed(1)}s`
    : null;

  return (
    <div className="flex flex-col border border-gray-200 rounded-lg bg-white flex-1 min-w-0 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        <StatusDot status={panel.status} />
        <span className="text-sm font-semibold text-gray-800 truncate">{panel.name}</span>
        {panel.status === "loading" && (
          <span className="ml-auto text-xs text-gray-400">Generating…</span>
        )}
        {panel.status === "success" && panel.output && (
          <button
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy output"}
            className={`ml-auto flex items-center justify-center rounded p-1 transition-colors ${
              copied
                ? "text-green-600 hover:text-green-700"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {copied ? <CheckIcon /> : <ClipboardIcon />}
          </button>
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
          <div className="prose prose-sm max-w-none p-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{panel.output}</ReactMarkdown>
          </div>
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
