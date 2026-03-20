"use client";

import { Fragment } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ModelConfig } from "@/lib/config";
import type { RevisionData } from "@/lib/storage";

interface Props {
  revisions: RevisionData[];
  generatorModels: ModelConfig[];
  judgeModels: ModelConfig[];
}

// Fixed color palette — generators get solid, judges get lighter variants
const GEN_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
const JUDGE_COLORS = ["#a5b4fc", "#6ee7b7", "#fcd34d", "#fca5a5", "#c4b5fd"];
const HUMAN_COLOR = "#1d4ed8";

export function ScoringTrends({ revisions, generatorModels, judgeModels }: Props) {
  if (revisions.length < 2) return null;

  // ── Line chart data: human scores per revision ────────────────────────────
  const lineData = revisions.map((rev) => {
    const point: Record<string, number | string> = { revision: `Rev ${rev.revision}` };
    for (const gen of generatorModels) {
      const score = rev.scores?.human?.[gen.id];
      if (score !== null && score !== undefined) point[gen.id] = score;
    }
    return point;
  });

  // ── Bar chart data: human vs judge per revision ───────────────────────────
  const barData = revisions.map((rev) => {
    const point: Record<string, number | string> = { revision: `Rev ${rev.revision}` };
    for (const gen of generatorModels) {
      const humanScore = rev.scores?.human?.[gen.id];
      if (humanScore !== null && humanScore !== undefined) point[`human_${gen.id}`] = humanScore;
      for (const judge of judgeModels) {
        const judgeScore = rev.scores?.judges?.[judge.id]?.[gen.id]?.score;
        if (judgeScore !== undefined) point[`${judge.id}_${gen.id}`] = judgeScore;
      }
    }
    return point;
  });

  // ── Agreement metric ──────────────────────────────────────────────────────
  const agreements: Record<string, { pct: number; n: number }> = {};
  for (const judge of judgeModels) {
    let total = 0;
    let within1 = 0;
    for (const rev of revisions) {
      for (const gen of generatorModels) {
        const human = rev.scores?.human?.[gen.id];
        const judgeScore = rev.scores?.judges?.[judge.id]?.[gen.id]?.score;
        if (human !== null && human !== undefined && judgeScore !== undefined) {
          total++;
          if (Math.abs(human - judgeScore) <= 1) within1++;
        }
      }
    }
    agreements[judge.id] = {
      pct: total > 0 ? Math.round((within1 / total) * 100) : 0,
      n: total,
    };
  }

  const hasAgreementData = Object.values(agreements).some((a) => a.n > 0);

  return (
    <div className="mt-8 space-y-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        Scoring Trends
      </h2>

      {/* ── Agreement metrics ── */}
      {hasAgreementData && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-medium text-gray-700">
            Judge agreement with human scores (within ±1)
          </h3>
          <div className="flex flex-wrap gap-4">
            {judgeModels.map((judge, ji) => {
              const { pct, n } = agreements[judge.id] ?? { pct: 0, n: 0 };
              return (
                <div key={judge.id} className="flex items-center gap-2 text-sm">
                  <span
                    className="inline-block h-3 w-3 rounded-sm shrink-0"
                    style={{ backgroundColor: JUDGE_COLORS[ji % JUDGE_COLORS.length] }}
                  />
                  <span className="text-gray-600">{judge.name}:</span>
                  <span className="font-semibold text-gray-900">
                    {n > 0 ? `${pct}%` : "—"}
                  </span>
                  {n > 0 && (
                    <span className="text-gray-400 text-xs">({n} data points)</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Line chart: human scores over revisions ── */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-medium text-gray-700">
          Human scores over revisions
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={lineData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="revision" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            {generatorModels.map((gen, i) => (
              <Line
                key={gen.id}
                type="monotone"
                dataKey={gen.id}
                name={gen.name}
                stroke={GEN_COLORS[i % GEN_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 4 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Grouped bar chart: human vs judges ── */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-medium text-gray-700">
          Human vs judge scores by revision
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={barData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }} barCategoryGap="15%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="revision" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {generatorModels.map((gen, gi) => (
              <Fragment key={gen.id}>
                <Bar
                  key={`human_${gen.id}`}
                  dataKey={`human_${gen.id}`}
                  name={`Human: ${gen.name}`}
                  fill={HUMAN_COLOR}
                  opacity={0.9 - gi * 0.2}
                />
                {judgeModels.map((judge, ji) => (
                  <Bar
                    key={`${judge.id}_${gen.id}`}
                    dataKey={`${judge.id}_${gen.id}`}
                    name={`${judge.name}: ${gen.name}`}
                    fill={JUDGE_COLORS[ji % JUDGE_COLORS.length]}
                    opacity={0.9 - gi * 0.15}
                  />
                ))}
              </Fragment>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
