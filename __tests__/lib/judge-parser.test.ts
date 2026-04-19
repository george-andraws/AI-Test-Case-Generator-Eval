import { parseJudgeResponse } from '../../src/lib/judge-parser';

// Silence warn calls so test output is clean; spy to assert when needed.
let warnSpy: jest.SpyInstance;
beforeEach(() => { warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warnSpy.mockRestore(); });

// ── Happy-path parsing ─────────────────────────────────────────────────────────

describe('happy-path parsing', () => {
  test('raw JSON with numeric score → returns score and feedback', () => {
    const result = parseJudgeResponse('{"score": 4, "feedback": "Good coverage"}');
    expect(result).not.toBeNull();
    expect(result!.score).toBe(4);
    expect(result!.feedback).toBe('Good coverage');
  });

  test('JSON in ```json ... ``` fences → parses correctly', () => {
    const result = parseJudgeResponse('```json\n{"score": 3, "feedback": "Decent"}\n```');
    expect(result!.score).toBe(3);
    expect(result!.feedback).toBe('Decent');
  });

  test('JSON in bare ``` ... ``` fences → parses correctly', () => {
    const result = parseJudgeResponse('```\n{"score": 5, "feedback": "Excellent"}\n```');
    expect(result!.score).toBe(5);
    expect(result!.feedback).toBe('Excellent');
  });

  test('prose text before and after JSON block → brace-search fallback', () => {
    const input = 'Here is my evaluation:\n{"score": 2, "feedback": "Gaps found"}\nEnd.';
    const result = parseJudgeResponse(input);
    expect(result!.score).toBe(2);
    expect(result!.feedback).toBe('Gaps found');
  });

  test('score=0 (falsy value) → still returned correctly', () => {
    const result = parseJudgeResponse('{"score": 0, "feedback": "Unusable"}');
    expect(result!.score).toBe(0);
  });

  test('score as float → preserved', () => {
    const result = parseJudgeResponse('{"score": 3.5, "feedback": "Solid"}');
    expect(result!.score).toBe(3.5);
  });

  test('JSON with extra whitespace/newlines → parses correctly', () => {
    const result = parseJudgeResponse('  \n  {"score": 2, "feedback": "Some gaps"}  \n  ');
    expect(result!.score).toBe(2);
  });
});

// ── Score coercion ─────────────────────────────────────────────────────────────

describe('score coercion', () => {
  test('score as integer string "3" → coerced to number 3', () => {
    const result = parseJudgeResponse('{"score": "3", "feedback": "Decent"}');
    expect(result).not.toBeNull();
    expect(result!.score).toBe(3);
    expect(typeof result!.score).toBe('number');
  });

  test('score as float string "3.5" → coerced to 3.5', () => {
    const result = parseJudgeResponse('{"score": "3.5", "feedback": "Solid"}');
    expect(result!.score).toBe(3.5);
  });

  test('score as string "0" → coerced to 0', () => {
    const result = parseJudgeResponse('{"score": "0", "feedback": "Bad"}');
    expect(result!.score).toBe(0);
  });

  test('score coercion logs a warning', () => {
    parseJudgeResponse('{"score": "4", "feedback": "Good"}');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Coerced score'));
  });
});

// ── Nested score extraction ────────────────────────────────────────────────────

describe('nested score extraction', () => {
  test('score one level deep → extracted', () => {
    const input = JSON.stringify({ evaluation: { score: 3, feedback: 'Decent' } });
    const result = parseJudgeResponse(input);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(3);
  });

  test('score nested as string → coerced and extracted', () => {
    const input = JSON.stringify({ result: { score: '4', feedback: 'Good' } });
    const result = parseJudgeResponse(input);
    expect(result!.score).toBe(4);
  });

  test('nested extraction logs a warning', () => {
    const input = JSON.stringify({ eval: { score: 3, feedback: 'ok' } });
    parseJudgeResponse(input);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nested object'));
  });

  test('top-level score takes priority over nested score', () => {
    const input = JSON.stringify({ score: 5, sub: { score: 2 }, feedback: 'Top wins' });
    const result = parseJudgeResponse(input);
    expect(result!.score).toBe(5);
  });
});

// ── Null / failure cases ───────────────────────────────────────────────────────

describe('null / failure cases', () => {
  test('pure prose with no JSON → returns null', () => {
    expect(parseJudgeResponse('This test suite looks comprehensive.')).toBeNull();
  });

  test('empty string → returns null', () => {
    expect(parseJudgeResponse('')).toBeNull();
  });

  test('malformed JSON → returns null', () => {
    expect(parseJudgeResponse('{"score": 4, "feedback": ')).toBeNull();
  });

  test('valid JSON but no score field → returns null', () => {
    expect(parseJudgeResponse('{"feedback": "Good", "rating": 4}')).toBeNull();
  });

  test('valid JSON with score=null → returns null', () => {
    expect(parseJudgeResponse('{"score": null, "feedback": "ok"}')).toBeNull();
  });

  test('valid JSON with score=NaN (as number) → returns null', () => {
    // JSON can't encode NaN natively; this produces score:null after parse
    expect(parseJudgeResponse('{"score": null}')).toBeNull();
  });

  test('no score field logs a warning', () => {
    parseJudgeResponse('{"feedback": "no score here"}');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No numeric score'));
  });
});

// ── Complex / comprehensive rubric format ─────────────────────────────────────

describe('comprehensive rubric format', () => {
  test('complex response with top-level score + all extra fields → score extracted, extras preserved', () => {
    const input = JSON.stringify({
      score: 4,
      feedback: 'Good overall',
      weighted_total: 3.8,
      dimensions: { Coverage: { score: 4, adjusted_weight: 0.3, evidence: 'Covers 80%' } },
      strengths: ['Good boundary tests'],
      critical_gaps: ['Missing auth edge cases'],
      applicability: { 'Error Handling': 'N/A' },
    });
    const result = parseJudgeResponse(input);
    expect(result!.score).toBe(4);
    expect(result!.feedback).toBe('Good overall');
    expect(result!.weighted_total).toBe(3.8);
    expect(result!.dimensions).toBeDefined();
    expect(result!.strengths).toEqual(['Good boundary tests']);
    expect(result!.critical_gaps).toEqual(['Missing auth edge cases']);
  });

  test('complex response inside markdown fences → extra fields preserved', () => {
    const inner = JSON.stringify({ score: 3, feedback: 'Decent', recommendations: ['Add negative tests'] });
    const result = parseJudgeResponse('```json\n' + inner + '\n```');
    expect(result!.score).toBe(3);
    expect(result!.recommendations).toEqual(['Add negative tests']);
  });

  test('score returned as string in complex rubric → coerced', () => {
    const input = JSON.stringify({
      score: '4',
      feedback: 'Strong',
      dimensions: { Coverage: { score: 4 } },
      weighted_total: 3.9,
    });
    const result = parseJudgeResponse(input);
    expect(result!.score).toBe(4);
    expect(typeof result!.score).toBe('number');
    expect(result!.weighted_total).toBe(3.9);
  });
});

// ── Fallback warning behaviour ─────────────────────────────────────────────────

describe('fallback warning behaviour', () => {
  test('direct parse succeeds → no warnings logged', () => {
    parseJudgeResponse('{"score": 3, "feedback": "ok"}');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('markdown fence fallback → warning logged', () => {
    parseJudgeResponse('```json\n{"score": 3, "feedback": "ok"}\n```');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('markdown code fence'));
  });

  test('brace-search fallback → warning logged', () => {
    parseJudgeResponse('Preamble text\n{"score": 3, "feedback": "ok"}\nPostamble.');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('brace search'));
  });
});
