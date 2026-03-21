import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { RevisionData } from '../../src/lib/storage';

// urlToSlug is a pure function — import at top level
import { urlToSlug } from '../../src/lib/storage';

const baseRevision: Omit<RevisionData, 'revision' | 'timestamp'> = {
  url: 'http://test.example.com',
  prompts: {
    testMethodology: 'Test the app thoroughly',
    productRequirements: 'It should work',
    judgePrompt: 'Score it',
  },
  revisionNotes: 'Initial revision',
  images: [],
  configSnapshot: {
    generators: [{ id: 'claude', name: 'Claude', model: 'claude-3', provider: 'anthropic' }],
    judges: [],
  },
  generations: {
    claude: {
      output: 'Test case 1: ...',
      tokenUsage: { input: 100, output: 200 },
      latencyMs: 1500,
      langfuseTraceId: 'trace-abc',
    },
  },
  scores: {
    human: { claude: 4 },
    judges: {},
  },
};

// ── urlToSlug pure function tests ──────────────────────────────────────────────

describe('urlToSlug', () => {
  test('http://localhost:3000 → localhost-3000', () => {
    expect(urlToSlug('http://localhost:3000')).toBe('localhost-3000');
  });

  test('https://my-app.example.com/dashboard → my-app-example-com-dashboard', () => {
    expect(urlToSlug('https://my-app.example.com/dashboard')).toBe('my-app-example-com-dashboard');
  });

  test('URL with query params strips them properly', () => {
    const result = urlToSlug('https://example.com/path?foo=bar&baz=qux');
    expect(result).toBe('example-com-path-foo-bar-baz-qux');
  });

  test('trailing slash stripped', () => {
    const result = urlToSlug('https://example.com/path/');
    expect(result).not.toMatch(/^-|-$/);
    expect(result).toBe('example-com-path');
  });

  test('empty string → empty string (or at least does not throw)', () => {
    expect(() => urlToSlug('')).not.toThrow();
    expect(urlToSlug('')).toBe('');
  });
});

// ── File operation tests ──────────────────────────────────────────────────────

describe('storage file operations', () => {
  let tmpDir: string;
  let mod: typeof import('../../src/lib/storage');

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'));
    jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    jest.resetModules();
    mod = require('../../src/lib/storage') as typeof import('../../src/lib/storage');
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('saveRevision to new file → revision number = 1, file created', async () => {
    const revisionNum = await mod.saveRevision(baseRevision);
    expect(revisionNum).toBe(1);
    const slug = mod.urlToSlug(baseRevision.url);
    const filePath = path.join(tmpDir, 'data', `${slug}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(JSON.parse(content)).toHaveLength(1);
  });

  test('saveRevision to existing file → revision number = 2, array has 2 entries', async () => {
    await mod.saveRevision(baseRevision);
    const revisionNum = await mod.saveRevision(baseRevision);
    expect(revisionNum).toBe(2);
    const slug = mod.urlToSlug(baseRevision.url);
    const filePath = path.join(tmpDir, 'data', `${slug}.json`);
    const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(content).toHaveLength(2);
  });

  test('readRevisions on non-existent file → null', async () => {
    const result = await mod.readRevisions('nonexistent-slug');
    expect(result).toBeNull();
  });

  test('readRevision on non-existent file → null', async () => {
    const result = await mod.readRevision('nonexistent-slug', 1);
    expect(result).toBeNull();
  });

  test('readRevision with correct revision number → correct data', async () => {
    await mod.saveRevision(baseRevision);
    const slug = mod.urlToSlug(baseRevision.url);
    const result = await mod.readRevision(slug, 1);
    expect(result).not.toBeNull();
    expect(result!.revision).toBe(1);
  });

  test('readRevision with wrong revision number → null', async () => {
    await mod.saveRevision(baseRevision);
    const slug = mod.urlToSlug(baseRevision.url);
    const result = await mod.readRevision(slug, 99);
    expect(result).toBeNull();
  });

  test('full round-trip: save then read preserves all fields', async () => {
    await mod.saveRevision(baseRevision);
    const slug = mod.urlToSlug(baseRevision.url);
    const result = await mod.readRevision(slug, 1);
    expect(result).not.toBeNull();
    expect(result!.url).toBe(baseRevision.url);
    expect(result!.prompts.testMethodology).toBe(baseRevision.prompts.testMethodology);
    expect(result!.prompts.productRequirements).toBe(baseRevision.prompts.productRequirements);
    expect(result!.revisionNotes).toBe(baseRevision.revisionNotes);
    expect(result!.generations.claude.output).toBe(baseRevision.generations.claude.output);
    expect(result!.scores.human.claude).toBe(4);
  });

  test('images array (empty []) preserved', async () => {
    await mod.saveRevision({ ...baseRevision, images: [] });
    const slug = mod.urlToSlug(baseRevision.url);
    const result = await mod.readRevision(slug, 1);
    expect(result!.images).toEqual([]);
  });

  test('unicode content in prompts survives write/read', async () => {
    const unicodeRevision = {
      ...baseRevision,
      prompts: {
        ...baseRevision.prompts,
        testMethodology: 'Test 日本語 content: αβγ emoji: 🚀',
      },
    };
    await mod.saveRevision(unicodeRevision);
    const slug = mod.urlToSlug(unicodeRevision.url);
    const result = await mod.readRevision(slug, 1);
    expect(result!.prompts.testMethodology).toBe('Test 日本語 content: αβγ emoji: 🚀');
  });

  test('listProducts returns correct data after saving', async () => {
    await mod.saveRevision(baseRevision);
    const products = await mod.listProducts();
    expect(products).toHaveLength(1);
    expect(products[0].url).toBe(baseRevision.url);
    expect(products[0].revisionCount).toBe(1);
    expect(products[0].slug).toBe(mod.urlToSlug(baseRevision.url));
  });
});
