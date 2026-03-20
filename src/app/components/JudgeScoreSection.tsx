"use client";

import { useState } from "react";
import type { ModelConfig } from "@/lib/config";

export interface JudgePanelEntry {
  status: "idle" | "loading" | "success" | "error";
  score?: number;
  feedback?: string;
  selfEvaluation?: boolean;
  langfuseTraceId?: string;
  error?: string;
}

interface Props {
  judgeModels: ModelConfig[];
  /** judgeId → result for this generator panel */
  results: Record<string, JudgePanelEntry>;
}

export function JudgeScoreSection({ judgeModels, results }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function toggle(judgeId: string) {
    setExpanded((prev) => ({ ...prev, [judgeId]: !prev[judgeId] }));
  }

  if (judgeModels.length === 0) return null;

  return (
    <div className="border-t border-gray-100 px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-gray-500 mb-2">Judge scores</p>
      {judgeModels.map((judge) => {
        const entry = results[judge.id];
        const isExpanded = expanded[judge.id] ?? false;

        return (
          <div key={judge.id} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              {/* Judge name + score */}
              <div className="flex items-center gap-2 min-w-0">
                {entry?.status === "loading" && (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent shrink-0" />
                )}
                {entry?.status === "success" && (
                  <span className="font-medium text-gray-500 shrink-0">
                    {entry.score ?? "—"}/5
                  </span>
                )}
                {entry?.status === "error" && (
                  <span className="text-red-400 shrink-0">—</span>
                )}
                {(!entry || entry.status === "idle") && (
                  <span className="text-gray-300 shrink-0">—</span>
                )}

                <span className="text-gray-500 truncate">
                  {judge.name}
                  {entry?.selfEvaluation && (
                    <span className="ml-1 text-gray-400">(self)</span>
                  )}
                </span>
              </div>

              {/* Expand feedback toggle */}
              {entry?.status === "success" && entry.feedback && (
                <button
                  onClick={() => toggle(judge.id)}
                  className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                  title={isExpanded ? "Collapse feedback" : "Expand feedback"}
                >
                  <svg
                    className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}

              {/* Error message */}
              {entry?.status === "error" && (
                <span className="text-red-400 text-xs truncate" title={entry.error}>
                  unavailable
                </span>
              )}
            </div>

            {/* Expandable feedback */}
            {isExpanded && entry?.feedback && (
              <div className="mt-1.5 rounded bg-gray-50 p-2 text-gray-600 leading-relaxed font-mono whitespace-pre-wrap">
                {entry.feedback}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
