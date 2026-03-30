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
      {
        id: 'gpt',
        name: 'GPT',
        provider: 'openai',
        model: 'gpt-4.1',
        apiKeyEnvVar: 'OPENAI_API_KEY',
        maxTokens: 4096,
        temperature: 0.3,
        enabled: true,
      },
    ],
    judges: [
      {
        id: 'claude-judge',
        name: 'Claude Judge',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKeyEnvVar: 'ANTHROPIC_API_KEY',
        maxTokens: 8192,
        temperature: 0.2,
        enabled: true,
      },
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

const validLLMResponse = {
  text: '{"score": 4, "feedback": "Good"}',
  tokenUsage: { input: 10, output: 20 },
  latencyMs: 100,
  traceId: 'trace-123',
};

async function callJudgeRoute(judgeId: string, generatorId: string) {
  mockCallLLM.mockResolvedValue(validLLMResponse);

  const req = new Request('http://localhost/api/judge', {
    method: 'POST',
    body: JSON.stringify({
      url: 'http://test.com',
      productRequirements: 'Requirements here',
      judgePrompt: 'Judge carefully',
      generations: {
        [generatorId]: { modelName: 'Model Name', output: 'Test cases...' },
      },
      judgeId,
    }),
    headers: { 'Content-Type': 'application/json' },
  });

  const res = await POST(req as any);
  const data = await res.json();
  return data.results?.[judgeId]?.[generatorId];
}

describe('self-evaluation detection', () => {
  test('claude judge evaluating claude generator → selfEvaluation: true', async () => {
    const result = await callJudgeRoute('claude-judge', 'claude');
    expect(result).toBeDefined();
    expect(result.selfEvaluation).toBe(true);
  });

  test('claude judge evaluating gpt generator → selfEvaluation: false', async () => {
    const result = await callJudgeRoute('claude-judge', 'gpt');
    expect(result).toBeDefined();
    expect(result.selfEvaluation).toBe(false);
  });

  test('gpt judge evaluating claude generator → selfEvaluation: false', async () => {
    const result = await callJudgeRoute('gpt-judge', 'claude');
    expect(result).toBeDefined();
    expect(result.selfEvaluation).toBe(false);
  });
});
