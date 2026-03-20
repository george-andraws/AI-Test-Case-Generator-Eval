const SCORES = [0, 1, 2, 3, 4, 5] as const;

const LABELS: Record<number, string> = {
  0: "Completely unusable",
  1: "Major gaps",
  2: "Significant gaps",
  3: "Decent, misses edge cases",
  4: "Good, includes edge cases",
  5: "Excellent, production-ready",
};

interface Props {
  value?: number;
  onChange: (score: number) => void;
  disabled?: boolean;
}

export function ScoreSelector({ value, onChange, disabled }: Props) {
  return (
    <div>
      <div className="flex gap-1">
        {SCORES.map((score) => {
          const selected = value === score;
          return (
            <button
              key={score}
              onClick={() => onChange(score)}
              disabled={disabled}
              title={LABELS[score]}
              className={[
                "h-8 w-8 rounded text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
                selected
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
              ].join(" ")}
            >
              {score}
            </button>
          );
        })}
      </div>
      {value !== undefined && (
        <p className="mt-1 text-xs text-gray-400">{LABELS[value]}</p>
      )}
    </div>
  );
}
