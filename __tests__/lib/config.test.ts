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

  test('provider values are "anthropic", "openai", "google", or "grok"', () => {
    const validProviders = ['anthropic', 'openai', 'google', 'grok'];
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
});
