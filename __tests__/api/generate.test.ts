import { POST } from '../../src/app/api/generate/route';
import { callLLM } from '../../src/lib/llm';

jest.mock('../../src/lib/llm', () => ({
  callLLM: jest.fn(),
  flushSpans: jest.fn().mockResolvedValue(undefined),
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
    judges: [],
    langfuse: {
      publicKeyEnvVar: 'LANGFUSE_PUBLIC_KEY',
      secretKeyEnvVar: 'LANGFUSE_SECRET_KEY',
      baseUrl: 'https://us.cloud.langfuse.com',
    },
  },
}));

const mockCallLLM = callLLM as jest.Mock;

const defaultLLMResponse = {
  text: 'Generated test cases here',
  tokenUsage: { input: 100, output: 200 },
  latencyMs: 1500,
  traceId: 'trace-abc123',
};

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/generate', () => {
  beforeEach(() => {
    mockCallLLM.mockResolvedValue(defaultLLMResponse);
  });

  test('valid request → 200, results for each generator', async () => {
    const req = makeRequest({
      url: 'http://test.com',
      testMethodology: 'Test methodology',
      productRequirements: 'Product requirements',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results).toBeDefined();
    expect(data.results['claude']).toBeDefined();
    expect(data.results['gpt']).toBeDefined();
  });

  test('missing url → 400', async () => {
    const req = makeRequest({
      testMethodology: 'Test methodology',
      productRequirements: 'Product requirements',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test('missing testMethodology → 400', async () => {
    const req = makeRequest({
      url: 'http://test.com',
      productRequirements: 'Product requirements',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test('missing productRequirements → 400', async () => {
    const req = makeRequest({
      url: 'http://test.com',
      testMethodology: 'Test methodology',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test('invalid JSON body → 400', async () => {
    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      body: 'not valid json {{{',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test('modelId filter → only runs that model', async () => {
    const req = makeRequest({
      url: 'http://test.com',
      testMethodology: 'Test methodology',
      productRequirements: 'Product requirements',
      modelId: 'claude',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results['claude']).toBeDefined();
    expect(data.results['gpt']).toBeUndefined();
  });

  test('unknown modelId → 400', async () => {
    const req = makeRequest({
      url: 'http://test.com',
      testMethodology: 'Test methodology',
      productRequirements: 'Product requirements',
      modelId: 'nonexistent-model',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test('one model fails → other still succeeds (partial failure)', async () => {
    mockCallLLM
      .mockRejectedValueOnce(new Error('API error for claude'))
      .mockResolvedValueOnce(defaultLLMResponse);

    const req = makeRequest({
      url: 'http://test.com',
      testMethodology: 'Test methodology',
      productRequirements: 'Product requirements',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results['claude'].success).toBe(false);
    expect(data.results['gpt'].success).toBe(true);
  });

  test('successful response has output, tokenUsage, latencyMs, langfuseTraceId', async () => {
    const req = makeRequest({
      url: 'http://test.com',
      testMethodology: 'Test methodology',
      productRequirements: 'Product requirements',
      modelId: 'claude',
    });
    const res = await POST(req as any);
    const data = await res.json();
    const claudeResult = data.results['claude'];
    expect(claudeResult.output).toBe(defaultLLMResponse.text);
    expect(claudeResult.tokenUsage).toEqual(defaultLLMResponse.tokenUsage);
    expect(claudeResult.latencyMs).toBe(defaultLLMResponse.latencyMs);
    expect(claudeResult.langfuseTraceId).toBe(defaultLLMResponse.traceId);
  });

  test('callLLM called with correct provider and model', async () => {
    const req = makeRequest({
      url: 'http://test.com',
      testMethodology: 'Test methodology',
      productRequirements: 'Product requirements',
      modelId: 'claude',
    });
    await POST(req as any);
    expect(mockCallLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      })
    );
  });

  test('images in body → callLLM receives images array', async () => {
    const images = [{ base64: 'abc123', mimeType: 'image/png' }];
    const req = makeRequest({
      url: 'http://test.com',
      testMethodology: 'Test methodology',
      productRequirements: 'Product requirements',
      modelId: 'claude',
      images,
    });
    await POST(req as any);
    expect(mockCallLLM).toHaveBeenCalledWith(expect.objectContaining({ images }));
  });

  test('images in body → user prompt includes screenshot context note', async () => {
    const req = makeRequest({
      url: 'http://test.com',
      testMethodology: 'Test methodology',
      productRequirements: 'Product requirements',
      modelId: 'claude',
      images: [{ base64: 'abc', mimeType: 'image/png' }],
    });
    await POST(req as any);
    const { userPrompt } = mockCallLLM.mock.calls[0][0];
    expect(userPrompt).toContain('Screenshots of the application UI are attached');
    expect(userPrompt).toContain('attached screenshots');
  });

  test('no images → callLLM receives no images, prompt has no screenshot note', async () => {
    const req = makeRequest({
      url: 'http://test.com',
      testMethodology: 'Test methodology',
      productRequirements: 'Product requirements',
      modelId: 'claude',
    });
    await POST(req as any);
    const call = mockCallLLM.mock.calls[0][0];
    expect(call.images).toBeUndefined();
    expect(call.userPrompt).not.toContain('Screenshots');
  });
});
