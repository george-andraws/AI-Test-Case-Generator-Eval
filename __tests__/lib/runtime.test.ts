describe('runtime storage mode', () => {
  const oldEnv = process.env;

  afterEach(() => {
    jest.resetModules();
    process.env = oldEnv;
  });

  test('defaults to local mode outside Vercel', async () => {
    process.env = { ...oldEnv };
    delete process.env.APP_STORAGE_MODE;
    delete process.env.VERCEL;
    const runtime = await import('../../src/lib/runtime');
    expect(runtime.getStorageMode()).toBe('local');
  });

  test('defaults to demo mode on Vercel when storage mode is not set', async () => {
    process.env = { ...oldEnv, VERCEL: '1' };
    delete process.env.APP_STORAGE_MODE;
    const runtime = await import('../../src/lib/runtime');
    expect(runtime.getStorageMode()).toBe('demo');
  });

  test('explicit local mode overrides Vercel default', async () => {
    process.env = { ...oldEnv, VERCEL: '1', APP_STORAGE_MODE: 'local' };
    const runtime = await import('../../src/lib/runtime');
    expect(runtime.getStorageMode()).toBe('local');
  });
});
