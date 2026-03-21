import { parseJudgeResponse } from '../../src/lib/judge-parser';

describe('parseJudgeResponse', () => {
  test('valid raw JSON → returns score and feedback', () => {
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

  test('prose text before and after JSON block → extracts JSON via brace fallback', () => {
    const input = 'Here is my evaluation:\n{"score": 2, "feedback": "Gaps found"}\nEnd.';
    const result = parseJudgeResponse(input);
    expect(result!.score).toBe(2);
    expect(result!.feedback).toBe('Gaps found');
  });

  test('JSON with score=0 (falsy) → still returns the value', () => {
    const result = parseJudgeResponse('{"score": 0, "feedback": "Unusable"}');
    expect(result!.score).toBe(0);
  });

  test('pure prose with no JSON → returns null', () => {
    expect(parseJudgeResponse('This test suite looks comprehensive.')).toBeNull();
  });

  test('empty string → returns null', () => {
    expect(parseJudgeResponse('')).toBeNull();
  });

  test('malformed JSON → returns null', () => {
    expect(parseJudgeResponse('{"score": 4, "feedback": ')).toBeNull();
  });

  test('JSON with extra whitespace/newlines → parses correctly', () => {
    const result = parseJudgeResponse('  \n  {"score": 2, "feedback": "Some gaps"}  \n  ');
    expect(result!.score).toBe(2);
  });
});
