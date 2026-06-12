import config from '../../src/lib/config';

describe('config', () => {
  test('config loads without error', () => {
    expect(config).toBeDefined();
  });

  test('all generators have id, name, provider, model, apiKeyEnvVar, maxTokens, temperature', () => {
    for (const gen of config.generators) {
      expect(gen.id).toBeDefined();
      expect(gen.name).toBeDefined();
      expect(gen.provider).toBeDefined();
      expect(gen.model).toBeDefined();
      expect(gen.apiKeyEnvVar).toBeDefined();
      expect(gen.maxTokens).toBeDefined();
      expect(gen.temperature).toBeDefined();
    }
  });

  test('all judges have id, name, provider, model, apiKeyEnvVar, maxTokens, temperature', () => {
    for (const judge of config.judges) {
      expect(judge.id).toBeDefined();
      expect(judge.name).toBeDefined();
      expect(judge.provider).toBeDefined();
      expect(judge.model).toBeDefined();
      expect(judge.apiKeyEnvVar).toBeDefined();
      expect(judge.maxTokens).toBeDefined();
      expect(judge.temperature).toBeDefined();
    }
  });

  test('provider values are "anthropic", "openai", "google", "grok", or "openrouter"', () => {
    const validProviders = ['anthropic', 'openai', 'google', 'grok', 'openrouter'];
    for (const gen of config.generators) {
      expect(validProviders).toContain(gen.provider);
    }
    for (const judge of config.judges) {
      expect(validProviders).toContain(judge.provider);
    }
  });

  test('all generators and judges have enabled boolean', () => {
    for (const gen of config.generators) {
      expect(typeof gen.enabled).toBe('boolean');
    }
    for (const judge of config.judges) {
      expect(typeof judge.enabled).toBe('boolean');
    }
  });

  test('no duplicate generator IDs', () => {
    const ids = config.generators.map((g) => g.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test('no duplicate judge IDs', () => {
    const ids = config.judges.map((j) => j.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test('temperature between 0 and 1 for all models', () => {
    for (const gen of config.generators) {
      expect(gen.temperature).toBeGreaterThanOrEqual(0);
      expect(gen.temperature).toBeLessThanOrEqual(1);
    }
    for (const judge of config.judges) {
      expect(judge.temperature).toBeGreaterThanOrEqual(0);
      expect(judge.temperature).toBeLessThanOrEqual(1);
    }
  });

  test('maxTokens > 0 for all models', () => {
    for (const gen of config.generators) {
      expect(gen.maxTokens).toBeGreaterThan(0);
    }
    for (const judge of config.judges) {
      expect(judge.maxTokens).toBeGreaterThan(0);
    }
  });

  test('at least one generator defined', () => {
    expect(config.generators.length).toBeGreaterThanOrEqual(1);
  });

  test('at least one judge defined', () => {
    expect(config.judges.length).toBeGreaterThanOrEqual(1);
  });

  test('demo model profile enables two OpenRouter demo generators and judges with separate keys', () => {
    const oldEnv = process.env;
    jest.resetModules();
    process.env = {
      ...oldEnv,
      NEXT_PUBLIC_MODEL_PROFILE: 'demo',
      OPENROUTER_DEMO_PRIMARY_MODEL: 'provider/primary:free',
      OPENROUTER_DEMO_COMPARE_MODEL: 'provider/compare:free',
    };

    const demoConfig = require('../../src/lib/config').default as typeof config;
    const enabledGenerators = demoConfig.generators.filter((g) => g.enabled);
    const enabledJudges = demoConfig.judges.filter((j) => j.enabled);

    expect(enabledGenerators.map((g) => g.id)).toEqual([
      'openrouter-demo-primary',
      'openrouter-demo-compare',
    ]);
    expect(enabledJudges.map((j) => j.id)).toEqual([
      'openrouter-demo-primary-judge',
      'openrouter-demo-compare-judge',
    ]);
    expect(enabledGenerators[0].model).toBe('provider/primary:free');
    expect(enabledGenerators[0].apiKeyEnvVar).toBe('OPENROUTER_API_KEY');
    expect(enabledGenerators[1].model).toBe('provider/compare:free');
    expect(enabledGenerators[1].apiKeyEnvVar).toBe('OPENROUTER_COMPARE_API_KEY');

    process.env = oldEnv;
  });
});
