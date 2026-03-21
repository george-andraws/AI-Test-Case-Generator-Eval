export interface JudgeScore {
  score: number;
  feedback: string;
}

/** Extract JSON from a string that may be wrapped in markdown code fences. */
export function parseJudgeResponse(text: string): JudgeScore | null {
  // Try raw parse first
  try {
    return JSON.parse(text) as JudgeScore;
  } catch {
    // Strip markdown code fences and retry
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        return JSON.parse(match[1]) as JudgeScore;
      } catch {
        // fall through
      }
    }
    // Last resort: find the first {...} block
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]) as JudgeScore;
      } catch {
        // fall through
      }
    }
    return null;
  }
}
