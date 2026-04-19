export interface JudgeScore extends Record<string, unknown> {
  score: number;
  feedback: string;
}

/**
 * Extract and normalise a judge score from an LLM response.
 *
 * Handles: raw JSON, markdown code fences, prose with embedded JSON,
 * string-typed score fields, and score fields nested one level deep.
 * Returns null (rather than an object with score=undefined) when no
 * numeric score can be found, so callers can safely check for null.
 */
export function parseJudgeResponse(text: string): JudgeScore | null {
  const obj = tryExtractObject(text);
  if (obj === null) return null;

  const score = findScore(obj);
  if (score === null) {
    console.warn('[judge-parser] No numeric score found in parsed JSON.');
    return null;
  }

  return { ...obj, score } as JudgeScore;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function tryExtractObject(text: string): Record<string, unknown> | null {
  // 1. Direct parse
  try {
    const val = JSON.parse(text);
    if (isPlainObject(val)) return val;
  } catch {}

  // 2. Markdown code fences  (```json ... ``` or ``` ... ```)
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) {
    try {
      const val = JSON.parse(fence[1]);
      if (isPlainObject(val)) {
        console.warn('[judge-parser] Fallback: extracted JSON from markdown code fence.');
        return val;
      }
    } catch {}
  }

  // 3. First {...} block anywhere in the text
  const brace = text.match(/\{[\s\S]*\}/);
  if (brace) {
    try {
      const val = JSON.parse(brace[0]);
      if (isPlainObject(val)) {
        console.warn('[judge-parser] Fallback: extracted JSON via brace search.');
        return val;
      }
    } catch {}
  }

  return null;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/** Find a numeric score in obj, checking the top level then one level deep. */
function findScore(obj: Record<string, unknown>): number | null {
  // Top-level "score" field
  if ('score' in obj) {
    const n = toNumber(obj.score);
    if (n !== null) {
      if (typeof obj.score !== 'number') {
        console.warn(`[judge-parser] Coerced score from "${obj.score}" (${typeof obj.score}) to ${n}.`);
      }
      return n;
    }
  }

  // One level deep — e.g. { evaluation: { score: 3, ... } }
  for (const val of Object.values(obj)) {
    if (isPlainObject(val) && 'score' in val) {
      const n = toNumber(val.score);
      if (n !== null) {
        console.warn('[judge-parser] Extracted score from nested object.');
        return n;
      }
    }
  }

  return null;
}

function toNumber(val: unknown): number | null {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    if (!isNaN(n)) return n;
  }
  return null;
}
