import { POST } from '../../src/app/api/judge/route';
import { callLLM } from '../../src/lib/llm';

jest.mock('../../src/lib/llm', () => ({
  callLLM: jest.fn(),
  flushSpans: jest.fn().mockResolvedValue(undefined),
  scoreTrace: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/lib/config', () => ({
  __esModule: true,
  default: {
    generators: [
      {
        id: 'claude',
        name: 'Claude',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKeyEnvVar: 'ANTHROPIC_API_KEY',
        maxTokens: 4096,
        temperature: 0.3,
        enabled: true,
      },
    ],
    judges: [
      {
        id: 'gpt-judge',
        name: 'GPT Judge',
        provider: 'openai',
        model: 'gpt-4.1',
        apiKeyEnvVar: 'OPENAI_API_KEY',
        maxTokens: 8192,
        temperature: 0.2,
        enabled: true,
      },
    ],
    langfuse: {
      publicKeyEnvVar: 'LANGFUSE_PUBLIC_KEY',
      secretKeyEnvVar: 'LANGFUSE_SECRET_KEY',
      baseUrl: 'https://us.cloud.langfuse.com',
    },
  },
}));

const mockCallLLM = callLLM as jest.Mock;

async function callJudgeRoute(llmResponse: string) {
  mockCallLLM.mockResolvedValueOnce({
    text: llmResponse,
    tokenUsage: { input: 10, output: 20 },
    latencyMs: 100,
    traceId: 'trace-123',
  });

  const req = new Request('http://localhost/api/judge', {
    method: 'POST',
    body: JSON.stringify({
      url: 'http://test.com',
      productRequirements: 'Requirements here',
      judgePrompt: 'Judge carefully',
      generations: { claude: { modelName: 'Claude', output: 'Test cases...' } },
      judgeId: 'gpt-judge',
    }),
    headers: { 'Content-Type': 'application/json' },
  });

  const res = await POST(req as any);
  const data = await res.json();
  return data.results?.['gpt-judge']?.['claude'];
}

describe('judge response parsing', () => {
  test('valid JSON → score=4, feedback="Good"', async () => {
    const result = await callJudgeRoute('{"score": 4, "feedback": "Good"}');
    expect(result.score).toBe(4);
    expect(result.feedback).toBe('Good');
  });

  test('JSON in ```json ... ``` fences → parses correctly', async () => {
    const result = await callJudgeRoute('```json\n{"score": 3, "feedback": "Decent"}\n```');
    expect(result.score).toBe(3);
    expect(result.feedback).toBe('Decent');
  });

  test('JSON in ``` ... ``` (no language) → parses correctly', async () => {
    const result = await callJudgeRoute('```\n{"score": 5, "feedback": "Excellent"}\n```');
    expect(result.score).toBe(5);
    expect(result.feedback).toBe('Excellent');
  });

  test('JSON with extra whitespace/newlines → parses correctly', async () => {
    const result = await callJudgeRoute('  \n  {"score": 2, "feedback": "Some gaps"}  \n  ');
    expect(result.score).toBe(2);
    expect(result.feedback).toBe('Some gaps');
  });

  test('prose with embedded JSON block → extracts the {...} block', async () => {
    const result = await callJudgeRoute(
      'After careful evaluation, here is my assessment:\n{"score": 4, "feedback": "Good coverage"}\nEnd of evaluation.'
    );
    expect(result.score).toBe(4);
    expect(result.feedback).toBe('Good coverage');
  });

  test('pure prose (no JSON) → score=undefined, feedback=raw text', async () => {
    const rawText = 'This is just prose with no JSON structure at all.';
    const result = await callJudgeRoute(rawText);
    expect(result.score).toBeUndefined();
    expect(result.feedback).toBe(rawText);
  });

  test('empty string → handled gracefully (score undefined or null result)', async () => {
    const result = await callJudgeRoute('');
    // Either result is null or score is undefined
    if (result !== null && result !== undefined) {
      expect(result.score).toBeUndefined();
    }
  });
});

describe('rawData passthrough', () => {
  test('simple {score, feedback} response → rawData contains score and feedback', async () => {
    const result = await callJudgeRoute('{"score": 4, "feedback": "Good coverage"}');
    expect(result.rawData).toBeDefined();
    expect(result.rawData.score).toBe(4);
    expect(result.rawData.feedback).toBe('Good coverage');
  });

  test('detailed response with extra fields → rawData contains all extra fields', async () => {
    const detailed = {
      score: 3,
      feedback: 'Decent',
      weighted_total: 2.8,
      dimensions: {
        Coverage: { score: 3, adjusted_weight: 0.4, evidence: 'Covers main flows' },
        'Error Handling': { score: null, adjusted_weight: 0.2, evidence: '' },
      },
      applicability: { 'Error Handling': 'No error scenarios defined in requirements' },
      strengths: ['Clear step descriptions'],
      critical_gaps: ['Missing boundary tests'],
      recommendations: ['Add tests for empty input'],
      overall_vs_weighted_delta: 'Score slightly above weighted due to N/A dimension',
    };
    const result = await callJudgeRoute(JSON.stringify(detailed));
    expect(result.score).toBe(3);
    expect(result.rawData).toBeDefined();
    expect(result.rawData.weighted_total).toBe(2.8);
    expect(result.rawData.dimensions).toBeDefined();
    expect(result.rawData.applicability).toBeDefined();
    expect(result.rawData.strengths).toEqual(['Clear step descriptions']);
    expect(result.rawData.critical_gaps).toEqual(['Missing boundary tests']);
    expect(result.rawData.recommendations).toEqual(['Add tests for empty input']);
    expect(result.rawData.overall_vs_weighted_delta).toContain('weighted');
  });

  test('parse failure (pure prose) → rawData is undefined', async () => {
    const result = await callJudgeRoute('Just prose, no JSON here.');
    expect(result.rawData).toBeUndefined();
  });

  test('JSON in markdown fences with extra fields → rawData preserved', async () => {
    const inner = JSON.stringify({ score: 5, feedback: 'Excellent', strengths: ['Comprehensive'] });
    const result = await callJudgeRoute('```json\n' + inner + '\n```');
    expect(result.rawData.strengths).toEqual(['Comprehensive']);
  });
});
