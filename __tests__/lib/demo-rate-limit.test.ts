const limitMock = jest.fn();
const mockRatelimitConstructor = jest.fn().mockImplementation(() => ({
  limit: limitMock,
}));
(mockRatelimitConstructor as any).slidingWindow = jest.fn(() => ({ type: 'sliding-window' }));

jest.mock('@upstash/redis', () => ({
  Redis: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@upstash/ratelimit', () => ({
  Ratelimit: mockRatelimitConstructor,
}));

describe('demo rate limiting', () => {
  const oldEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    limitMock.mockReset();
    process.env = { ...oldEnv, APP_STORAGE_MODE: 'demo' };
    process.env.KV_REST_API_URL = 'https://redis.example.com';
    process.env.KV_REST_API_TOKEN = 'token';
  });

  afterEach(() => {
    process.env = oldEnv;
  });

  test('returns 429 response when the session or IP exceeds the limit', async () => {
    limitMock.mockResolvedValue({
      success: false,
      limit: 20,
      remaining: 0,
      reset: 123,
    });

    const { enforceDemoRateLimit } = require('../../src/lib/demo-rate-limit') as typeof import('../../src/lib/demo-rate-limit');
    const req = new Request('http://localhost/api/generate', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });

    const res = await enforceDemoRateLimit(req as any, 'generate', 'session-a');
    expect(res?.status).toBe(429);
    expect(limitMock).toHaveBeenCalledWith('generate:ip:203.0.113.10');
  });

  test('returns null when all identifiers are within the limit', async () => {
    limitMock.mockResolvedValue({
      success: true,
      limit: 20,
      remaining: 19,
      reset: 123,
    });

    const { enforceDemoRateLimit } = require('../../src/lib/demo-rate-limit') as typeof import('../../src/lib/demo-rate-limit');
    const req = new Request('http://localhost/api/generate', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });

    const res = await enforceDemoRateLimit(req as any, 'generate', 'session-a');
    expect(res).toBeNull();
    expect(limitMock).toHaveBeenCalledWith('generate:ip:203.0.113.10');
    expect(limitMock).toHaveBeenCalledWith('generate:session:session-a');
  });
});
