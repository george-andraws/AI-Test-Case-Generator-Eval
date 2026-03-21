import { POST } from '../../src/app/api/judge/route';
import { callLLM, scoreTrace } from '../../src/lib/llm';

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
      },
      {
        id: 'gpt',
        name: 'GPT',
        provider: 'openai',
        model: 'gpt-4.1',
        apiKeyEnvVar: 'OPENAI_API_KEY',
        maxTokens: 4096,
        temperature: 0.3,
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
      },
      {
        id: 'gpt-judge',
        name: 'GPT Judge',
        provider: 'openai',
        model: 'gpt-4.1',
        apiKeyEnvVar: 'OPENAI_API_KEY',
        maxTokens: 8192,
        temperature: 0.2,
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
const mockScoreTrace = scoreTrace as jest.Mock;

const defaultLLMResponse = {
  text: '{"score": 4, "feedback": "Good coverage"}',
  tokenUsage: { input: 10, output: 20 },
  latencyMs: 100,
  traceId: 'trace-abc123',
};

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/judge', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const validBody = {
  url: 'http://test.com',
  productRequirements: 'Requirements here',
  judgePrompt: 'Judge carefully',
  generations: {
    claude: { modelName: 'Claude', output: 'Test cases...' },
  },
};

describe('POST /api/judge', () => {
  beforeEach(() => {
    mockCallLLM.mockResolvedValue(defaultLLMResponse);
  });

  test('valid request → 200, results for each judge×generator combo', async () => {
    const req = makeRequest(validBody);
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results).toBeDefined();
    expect(data.results['claude-judge']).toBeDefined();
    expect(data.results['claude-judge']['claude']).toBeDefined();
    expect(data.results['gpt-judge']).toBeDefined();
    expect(data.results['gpt-judge']['claude']).toBeDefined();
  });

  test('missing url → 400', async () => {
    const req = makeRequest({
      productRequirements: 'Requirements here',
      judgePrompt: 'Judge carefully',
      generations: { claude: { modelName: 'Claude', output: 'Test cases...' } },
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test('missing productRequirements → 400', async () => {
    const req = makeRequest({
      url: 'http://test.com',
      judgePrompt: 'Judge carefully',
      generations: { claude: { modelName: 'Claude', output: 'Test cases...' } },
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test('missing judgePrompt → 200 (judgePrompt is optional)', async () => {
    const req = makeRequest({
      url: 'http://test.com',
      productRequirements: 'Requirements here',
      judgeId: 'claude-judge',
      generations: { claude: { modelName: 'Claude', output: 'Test cases...' } },
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results['claude-judge']['claude'].success).toBe(true);
  });

  test('empty string judgePrompt → 200 (empty string is valid)', async () => {
    const req = makeRequest({
      ...validBody,
      judgeId: 'claude-judge',
      judgePrompt: '',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results['claude-judge']['claude'].success).toBe(true);
  });

  test('empty string judgePrompt → callLLM receives empty string as systemPrompt', async () => {
    const req = makeRequest({ ...validBody, judgeId: 'claude-judge', judgePrompt: '' });
    await POST(req as any);
    expect(mockCallLLM).toHaveBeenCalledWith(expect.objectContaining({ systemPrompt: '' }));
  });

  test('missing generations → 400', async () => {
    const req = makeRequest({
      url: 'http://test.com',
      productRequirements: 'Requirements here',
      judgePrompt: 'Judge carefully',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test('judgeId filter → only runs that judge', async () => {
    const req = makeRequest({ ...validBody, judgeId: 'claude-judge' });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results['claude-judge']).toBeDefined();
    expect(data.results['gpt-judge']).toBeUndefined();
  });

  test('unknown judgeId → 400', async () => {
    const req = makeRequest({ ...validBody, judgeId: 'nonexistent-judge' });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test('self-evaluation detected correctly (claude judge + claude generator)', async () => {
    const req = makeRequest({ ...validBody, judgeId: 'claude-judge' });
    const res = await POST(req as any);
    const data = await res.json();
    expect(data.results['claude-judge']['claude'].selfEvaluation).toBe(true);
  });

  test('partial failure handled', async () => {
    mockCallLLM
      .mockRejectedValueOnce(new Error('Claude judge failed'))
      .mockResolvedValueOnce(defaultLLMResponse);

    const req = makeRequest(validBody);
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    // One should fail, one should succeed
    const results = data.results;
    const allResults = Object.values(results).flatMap((judgeResults) =>
      Object.values(judgeResults as Record<string, { success: boolean }>)
    );
    const failures = allResults.filter((r) => !r.success);
    const successes = allResults.filter((r) => r.success);
    expect(failures.length).toBeGreaterThan(0);
    expect(successes.length).toBeGreaterThan(0);
  });

  test('scoreTrace called for each successful result', async () => {
    mockCallLLM.mockResolvedValue(defaultLLMResponse);
    const req = makeRequest({ ...validBody, judgeId: 'claude-judge' });
    await POST(req as any);
    // claude-judge × claude generator = 1 successful result
    expect(mockScoreTrace).toHaveBeenCalledTimes(1);
    expect(mockScoreTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'trace-abc123',
        value: 4,
        source: 'llm_judge',
      })
    );
  });

  test('images in body → callLLM receives images array', async () => {
    const images = [{ base64: 'abc123', mimeType: 'image/png' }];
    const req = makeRequest({ ...validBody, judgeId: 'claude-judge', images });
    await POST(req as any);
    expect(mockCallLLM).toHaveBeenCalledWith(expect.objectContaining({ images }));
  });

  test('images in body → judge prompt includes visual context note', async () => {
    const req = makeRequest({
      ...validBody,
      judgeId: 'claude-judge',
      images: [{ base64: 'abc', mimeType: 'image/png' }],
    });
    await POST(req as any);
    const { userPrompt } = mockCallLLM.mock.calls[0][0];
    expect(userPrompt).toContain('Screenshots of the application are attached');
  });

  test('no images → callLLM receives no images, prompt has no visual context note', async () => {
    const req = makeRequest({ ...validBody, judgeId: 'gpt-judge' });
    await POST(req as any);
    const call = mockCallLLM.mock.calls[0][0];
    expect(call.images).toBeUndefined();
    expect(call.userPrompt).not.toContain('Screenshots');
  });

  test('scoreTrace not called when LLM parse fails (score undefined)', async () => {
    mockCallLLM.mockResolvedValue({
      text: 'pure prose no json',
      tokenUsage: { input: 10, output: 5 },
      latencyMs: 80,
      traceId: 'trace-nojson',
    });
    const req = makeRequest({ ...validBody, judgeId: 'gpt-judge' });
    await POST(req as any);
    expect(mockScoreTrace).not.toHaveBeenCalled();
  });

  test('invalid JSON from LLM → graceful handling (score undefined, raw text as feedback)', async () => {
    mockCallLLM.mockResolvedValue({
      text: 'This is just prose with no JSON at all',
      tokenUsage: { input: 10, output: 20 },
      latencyMs: 100,
      traceId: 'trace-xyz',
    });

    const req = makeRequest({ ...validBody, judgeId: 'gpt-judge' });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    const result = data.results['gpt-judge']['claude'];
    expect(result.success).toBe(true);
    expect(result.score).toBeUndefined();
    expect(result.feedback).toBe('This is just prose with no JSON at all');
  });
});
