import type { RevisionData } from '../../src/lib/storage';

const store = new Map<string, unknown>();
const expirations = new Map<string, number>();

jest.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: jest.fn(() => ({
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      set: jest.fn(async (key: string, value: unknown, opts?: { ex?: number }) => {
        store.set(key, value);
        if (opts?.ex) expirations.set(key, opts.ex);
      }),
    })),
  },
}));

const baseRevision: Omit<RevisionData, 'revision' | 'timestamp'> = {
  url: 'http://demo.example.com',
  prompts: {
    testMethodology: 'Test the app thoroughly',
    productRequirements: 'It should work',
    judgePrompt: 'Score it',
  },
  revisionNotes: 'Initial revision',
  images: [],
  langfuseEnabled: false,
  configSnapshot: {
    generators: [{ id: 'demo-a', name: 'Demo A', model: 'model-a', provider: 'openrouter' }],
    judges: [],
  },
  generations: {},
  scores: {
    human: {},
    judges: {},
  },
};

describe('demo storage mode', () => {
  const oldEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    store.clear();
    expirations.clear();
    process.env = { ...oldEnv, APP_STORAGE_MODE: 'demo' };
  });

  afterEach(() => {
    process.env = oldEnv;
  });

  test('saveRevision stores revisions and product summaries with a 1 week TTL', async () => {
    const storage = require('../../src/lib/storage') as typeof import('../../src/lib/storage');
    const context = { sessionId: 'session-a' };

    const revision = await storage.saveRevision(baseRevision, context);
    const slug = storage.urlToSlug(baseRevision.url);
    const revisions = await storage.readRevisions(slug, context);
    const products = await storage.listProducts(context);

    expect(revision).toBe(1);
    expect(revisions).toHaveLength(1);
    expect(products).toEqual([{ url: baseRevision.url, slug, revisionCount: 1 }]);
    expect(expirations.get(`tcet:session:session-a:revisions:${slug}`)).toBe(7 * 24 * 60 * 60);
    expect(expirations.get('tcet:session:session-a:products')).toBe(7 * 24 * 60 * 60);
  });

  test('sessions cannot see each other revision data', async () => {
    const storage = require('../../src/lib/storage') as typeof import('../../src/lib/storage');
    const slug = storage.urlToSlug(baseRevision.url);

    await storage.saveRevision(baseRevision, { sessionId: 'session-a' });

    expect(await storage.readRevisions(slug, { sessionId: 'session-a' })).toHaveLength(1);
    expect(await storage.readRevisions(slug, { sessionId: 'session-b' })).toBeNull();
  });
});
