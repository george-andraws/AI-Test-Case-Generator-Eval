"use client";

import { useState } from "react";
import type { ModelConfig } from "@/lib/config";

export interface JudgePanelEntry {
  status: "idle" | "loading" | "success" | "error";
  score?: number;
  feedback?: string;
  rawData?: Record<string, unknown>;
  selfEvaluation?: boolean;
  langfuseTraceId?: string;
  error?: string;
}

interface DimensionData {
  score: number | null;
  adjusted_weight: number;
  evidence?: string;
}

interface Props {
  judgeModels: ModelConfig[];
  /** judgeId → result for this generator panel */
  results: Record<string, JudgePanelEntry>;
}

function scoreColor(score: number | undefined): string {
  if (score === undefined) return "text-gray-500";
  if (score <= 1) return "text-red-600";
  if (score <= 3) return "text-orange-500";
  if (score === 4) return "text-blue-600";
  return "text-green-800";
}

function scoreBg(score: number | null): string {
  if (score === null) return "bg-gray-200";
  if (score <= 1) return "bg-red-400";
  if (score <= 3) return "bg-orange-400";
  if (score === 4) return "bg-blue-500";
  return "bg-green-700";
}

function Chevron({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <svg
      className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""} ${className ?? ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function hasDetailedData(rawData?: Record<string, unknown>): boolean {
  if (!rawData) return false;
  return !!(rawData.dimensions || rawData.strengths || rawData.critical_gaps);
}

export function formatAdjustedWeight(weight: number | null | undefined): string {
  if (weight == null || Number.isNaN(weight)) return "N/A";
  const normalized = weight > 1 ? weight : weight * 100;
  return `${normalized.toFixed(1)}%`;
}

export function JudgeScoreSection({ judgeModels, results }: Props): JSX.Element | null {
  const [tier2Expanded, setTier2Expanded] = useState<Record<string, boolean>>({});
  const [tier3Expanded, setTier3Expanded] = useState<Record<string, boolean>>({});
  const [evidenceExpanded, setEvidenceExpanded] = useState<Record<string, boolean>>({});

  if (judgeModels.length === 0) return null;

  return (
    <div className="border-t border-gray-100 px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-gray-500 mb-2">Judge scores</p>
      {judgeModels.map((judge) => {
        const entry = results[judge.id];
        const isT2Open = tier2Expanded[judge.id] ?? false;
        const isT3Open = tier3Expanded[judge.id] ?? false;
        const showT3Toggle = entry?.status === "success" && hasDetailedData(entry.rawData);

        const rawData = entry?.rawData;
        const weightedTotal = typeof rawData?.weighted_total === "number" ? rawData.weighted_total as number : undefined;
        const dimensions = rawData?.dimensions as Record<string, DimensionData> | undefined;
        const applicability = rawData?.applicability as
          | Record<string, string | { applicable?: boolean; reason?: string }>
          | undefined;
        const strengths = rawData?.strengths as string[] | undefined;
        const criticalGaps = rawData?.critical_gaps as string[] | undefined;
        const recommendations = rawData?.recommendations as string[] | undefined;
        const delta = typeof rawData?.overall_vs_weighted_delta === "string" && rawData.overall_vs_weighted_delta
          ? rawData.overall_vs_weighted_delta as string
          : undefined;

        return (
          <div key={judge.id} className="text-xs">

            {/* ── Tier 1: name + score (always visible) ── */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {entry?.status === "loading" && (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent shrink-0" />
                )}
                {entry?.status === "success" && (
                  <span className={`font-medium shrink-0 ${scoreColor(entry.score)}`}>
                    {entry.score ?? "—"}/5
                    {weightedTotal !== undefined && (
                      <span className="ml-1 font-normal text-gray-400">
                        (weighted: {weightedTotal.toFixed(1)})
                      </span>
                    )}
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
                    <span className="ml-1 text-red-500">(self)</span>
                  )}
                </span>
              </div>

              {/* Tier 2 expand toggle */}
              {entry?.status === "success" && entry.feedback && (
                <button
                  onClick={() => setTier2Expanded((prev) => ({ ...prev, [judge.id]: !prev[judge.id] }))}
                  className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                  title={isT2Open ? "Collapse feedback" : "Expand feedback"}
                >
                  <Chevron expanded={isT2Open} />
                </button>
              )}
              {entry?.status === "error" && (
                <span className="text-red-400 text-xs truncate" title={entry.error}>
                  unavailable
                </span>
              )}
            </div>

            {/* ── Tier 2: feedback (expandable) ── */}
            {isT2Open && entry?.feedback && (
              <div className="mt-1.5">
                <div className="rounded bg-gray-50 p-2 text-gray-600 leading-relaxed font-mono whitespace-pre-wrap">
                  {entry.feedback}
                </div>

                {/* Tier 3 toggle (nested inside Tier 2) */}
                {showT3Toggle && (
                  <div className="mt-2 ml-2">
                    <button
                      onClick={() => setTier3Expanded((prev) => ({ ...prev, [judge.id]: !prev[judge.id] }))}
                      className="flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <Chevron expanded={isT3Open} />
                      <span className="text-xs">Detailed evaluation</span>
                    </button>

                    {/* ── Tier 3: detailed evaluation (expandable, indented) ── */}
                    {isT3Open && (
                      <div className="mt-2 ml-2 rounded border border-gray-100 bg-white p-2.5 space-y-3">

                        {/* Dimension scores */}
                        {dimensions && Object.keys(dimensions).length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1.5">Dimensions</p>
                            <div className="space-y-1.5">
                              {Object.entries(dimensions).map(([dimName, dim]) => {
                                const evidenceKey = `${judge.id}:${dimName}`;
                                const showEvidence = evidenceExpanded[evidenceKey] ?? false;
                                const isNA = dim.score === null;
                                const appRaw = applicability?.[dimName];
                                const appReason = typeof appRaw === "string"
                                  ? appRaw
                                  : appRaw?.reason ?? undefined;

                                return (
                                  <div key={dimName}>
                                    <div className="flex items-center gap-2">
                                      {/* Score bar or N/A */}
                                      <div className="w-20 shrink-0">
                                        {isNA ? (
                                          <span className="text-xs text-gray-400 italic">N/A</span>
                                        ) : (
                                          <div className="flex items-center gap-1.5">
                                            <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                                              <div
                                                className={`h-1.5 rounded-full ${scoreBg(dim.score)}`}
                                                style={{ width: `${((dim.score ?? 0) / 5) * 100}%` }}
                                              />
                                            </div>
                                            <span className={`w-3 text-right text-xs font-medium shrink-0 ${scoreColor(dim.score ?? undefined)}`}>
                                              {dim.score}
                                            </span>
                                          </div>
                                        )}
                                      </div>

                                      {/* Dimension name */}
                                      <span className="flex-1 min-w-0 truncate text-gray-600" title={dimName}>
                                        {dimName}
                                      </span>

                                      {/* Weight */}
                                      <span className="shrink-0 text-gray-400">
                                        {formatAdjustedWeight(dim.adjusted_weight)}
                                      </span>

                                      {/* Evidence toggle */}
                                      {dim.evidence && (
                                        <button
                                          onClick={() =>
                                            setEvidenceExpanded((prev) => ({
                                              ...prev,
                                              [evidenceKey]: !prev[evidenceKey],
                                            }))
                                          }
                                          className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
                                          title={showEvidence ? "Hide evidence" : "Show evidence"}
                                        >
                                          <Chevron expanded={showEvidence} />
                                        </button>
                                      )}
                                    </div>

                                    {/* N/A applicability reason */}
                                    {isNA && appReason && (
                                      <p className="mt-0.5 pl-4 text-xs text-gray-400 italic">
                                        {appReason}
                                      </p>
                                    )}

                                    {/* Evidence */}
                                    {showEvidence && dim.evidence && (
                                      <div className="mt-1 rounded bg-gray-50 p-1.5 font-mono text-xs text-gray-500 leading-relaxed whitespace-pre-wrap">
                                        {dim.evidence}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Strengths + Critical gaps */}
                        {!!(strengths?.length || criticalGaps?.length) && (
                          <div className="grid grid-cols-2 gap-2">
                            {strengths && strengths.length > 0 && (
                              <div className="rounded bg-green-50 p-2">
                                <p className="text-xs font-medium text-green-700 mb-1">Strengths</p>
                                <ul className="space-y-0.5">
                                  {strengths.map((s, i) => (
                                    <li key={i} className="text-xs text-green-800 leading-relaxed">
                                      • {s}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {criticalGaps && criticalGaps.length > 0 && (
                              <div className="rounded bg-red-50 p-2">
                                <p className="text-xs font-medium text-red-700 mb-1">Critical gaps</p>
                                <ul className="space-y-0.5">
                                  {criticalGaps.map((g, i) => (
                                    <li key={i} className="text-xs text-red-800 leading-relaxed">
                                      • {g}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Recommendations */}
                        {recommendations && recommendations.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1">Recommendations</p>
                            <ul className="space-y-0.5">
                              {recommendations.map((r, i) => (
                                <li key={i} className="text-xs text-gray-600 leading-relaxed">
                                  • {r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Overall vs weighted delta */}
                        {delta && (
                          <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-2">
                            {delta}
                          </p>
                        )}

                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        );
      })}
    </div>
  );
}
