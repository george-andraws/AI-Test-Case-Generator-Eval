import { callLLM } from '../../../src/lib/llm';
import type { LLMRequest } from '../../../src/lib/llm/types';

const mockSpan = {
  setAttribute: jest.fn().mockReturnThis(),
  setStatus: jest.fn().mockReturnThis(),
  end: jest.fn(),
  spanContext: jest.fn().mockReturnValue({ traceId: 'abc123def456' }),
};

jest.mock('../../../src/lib/llm/tracing', () => ({
  getTracer: jest.fn(() => ({
    startSpan: jest.fn(() => mockSpan),
  })),
  initTracing: jest.fn(),
  flushSpans: jest.fn(),
  flushTracing: jest.fn(),
  getLangfuseClient: jest.fn(),
}));

jest.mock('@opentelemetry/api', () => ({
  context: {
    active: jest.fn().mockReturnValue({}),
    with: jest.fn().mockImplementation((_ctx: any, fn: any) => fn()),
  },
  trace: {
    setSpan: jest.fn().mockReturnValue({}),
  },
  SpanStatusCode: { OK: 1, ERROR: 2, UNSET: 0 },
}));

const mockAdapterResponse = {
  text: 'Generated test cases here',
  model: 'some-model',
  provider: 'anthropic' as const,
  tokenUsage: { input: 100, output: 200 },
  latencyMs: 1500,
};

jest.mock('../../../src/lib/llm/anthropic', () => ({
  callAnthropic: jest.fn(),
}));
jest.mock('../../../src/lib/llm/openai', () => ({
  callOpenAI: jest.fn(),
}));
jest.mock('../../../src/lib/llm/google', () => ({
  callGoogle: jest.fn(),
}));

import { callAnthropic } from '../../../src/lib/llm/anthropic';
import { callOpenAI } from '../../../src/lib/llm/openai';
import { callGoogle } from '../../../src/lib/llm/google';

const mockCallAnthropic = callAnthropic as jest.Mock;
const mockCallOpenAI = callOpenAI as jest.Mock;
const mockCallGoogle = callGoogle as jest.Mock;

const baseRequest: LLMRequest = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: 'System prompt',
  userPrompt: 'User prompt',
  maxTokens: 4096,
  temperature: 0.3,
};

describe('callLLM router', () => {
  beforeEach(() => {
    mockCallAnthropic.mockResolvedValue({ ...mockAdapterResponse, provider: 'anthropic' });
    mockCallOpenAI.mockResolvedValue({ ...mockAdapterResponse, provider: 'openai' });
    mockCallGoogle.mockResolvedValue({ ...mockAdapterResponse, provider: 'google' });
    // Reset span mocks
    mockSpan.setAttribute.mockReturnThis();
    mockSpan.setStatus.mockReturnThis();
    mockSpan.end.mockReturnThis();
    mockSpan.spanContext.mockReturnValue({ traceId: 'abc123def456' });
  });

  test("provider='anthropic' → callAnthropic called, callOpenAI/callGoogle not called", async () => {
    await callLLM({ ...baseRequest, provider: 'anthropic' });
    expect(mockCallAnthropic).toHaveBeenCalledTimes(1);
    expect(mockCallOpenAI).not.toHaveBeenCalled();
    expect(mockCallGoogle).not.toHaveBeenCalled();
  });

  test("provider='openai' → callOpenAI called", async () => {
    await callLLM({ ...baseRequest, provider: 'openai', model: 'gpt-4.1' });
    expect(mockCallOpenAI).toHaveBeenCalledTimes(1);
    expect(mockCallAnthropic).not.toHaveBeenCalled();
    expect(mockCallGoogle).not.toHaveBeenCalled();
  });

  test("provider='google' → callGoogle called", async () => {
    await callLLM({ ...baseRequest, provider: 'google', model: 'gemini-flash' });
    expect(mockCallGoogle).toHaveBeenCalledTimes(1);
    expect(mockCallAnthropic).not.toHaveBeenCalled();
    expect(mockCallOpenAI).not.toHaveBeenCalled();
  });

  test('unknown provider → throws error containing provider name', async () => {
    await expect(
      callLLM({ ...baseRequest, provider: 'unknown-provider' as any })
    ).rejects.toThrow('unknown-provider');
  });

  test('returns traceId from span context', async () => {
    mockSpan.spanContext.mockReturnValue({ traceId: 'myfaketraceid' });
    const result = await callLLM({ ...baseRequest, provider: 'anthropic' });
    expect(result.traceId).toBe('myfaketraceid');
  });

  test('all LLMRequest fields passed to adapter', async () => {
    const req: LLMRequest = {
      provider: 'anthropic',
      model: 'claude-model',
      systemPrompt: 'my system prompt',
      userPrompt: 'my user prompt',
      maxTokens: 1024,
      temperature: 0.5,
    };
    await callLLM(req);
    expect(mockCallAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-model',
        systemPrompt: 'my system prompt',
        userPrompt: 'my user prompt',
        maxTokens: 1024,
        temperature: 0.5,
      })
    );
  });

  test('LLMResponse has all required fields (text, model, provider, tokenUsage, latencyMs, traceId)', async () => {
    const result = await callLLM({ ...baseRequest, provider: 'anthropic' });
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('model');
    expect(result).toHaveProperty('provider');
    expect(result).toHaveProperty('tokenUsage');
    expect(result).toHaveProperty('latencyMs');
    expect(result).toHaveProperty('traceId');
  });

  test('adapter error propagates (callLLM throws when adapter throws)', async () => {
    mockCallAnthropic.mockRejectedValue(new Error('Adapter failed'));
    await expect(callLLM({ ...baseRequest, provider: 'anthropic' })).rejects.toThrow(
      'Adapter failed'
    );
  });
});
