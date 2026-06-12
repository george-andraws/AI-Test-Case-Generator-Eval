jest.mock('@upstash/redis', () => ({
  Redis: jest.fn().mockImplementation((opts) => ({ opts })),
}));

describe('createRedisFromEnv', () => {
  const oldEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...oldEnv };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  afterEach(() => {
    process.env = oldEnv;
  });

  test('uses Vercel KV REST env vars when Upstash aliases are absent', async () => {
    process.env.KV_REST_API_URL = 'https://kv.example.com';
    process.env.KV_REST_API_TOKEN = 'kv-token';

    const { createRedisFromEnv } = await import('../../src/lib/redis');
    const { Redis } = await import('@upstash/redis');
    createRedisFromEnv();

    expect(Redis as unknown as jest.Mock).toHaveBeenCalledWith({
      url: 'https://kv.example.com',
      token: 'kv-token',
    });
  });

  test('prefers explicit Upstash env vars', async () => {
    process.env.KV_REST_API_URL = 'https://kv.example.com';
    process.env.KV_REST_API_TOKEN = 'kv-token';
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token';

    const { createRedisFromEnv } = await import('../../src/lib/redis');
    const { Redis } = await import('@upstash/redis');
    createRedisFromEnv();

    expect(Redis as unknown as jest.Mock).toHaveBeenCalledWith({
      url: 'https://upstash.example.com',
      token: 'upstash-token',
    });
  });
});
