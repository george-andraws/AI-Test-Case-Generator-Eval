import { GET, POST } from '../../src/app/api/data/route';
import { readRevisions, readRevision, saveRevision } from '../../src/lib/storage';

jest.mock('../../src/lib/storage', () => ({
  urlToSlug: jest.fn((url: string) => url.replace(/[^a-z0-9]+/gi, '-').toLowerCase()),
  readRevisions: jest.fn(),
  readRevision: jest.fn(),
  saveRevision: jest.fn(),
}));

const mockReadRevisions = readRevisions as jest.Mock;
const mockReadRevision = readRevision as jest.Mock;
const mockSaveRevision = saveRevision as jest.Mock;

const sampleRevision = {
  revision: 1,
  timestamp: '2024-01-01T00:00:00.000Z',
  url: 'http://test.com',
  prompts: {
    testMethodology: 'Test methodology',
    productRequirements: 'Product requirements',
    judgePrompt: 'Judge prompt',
  },
  revisionNotes: 'Initial',
  images: [],
  configSnapshot: { generators: [], judges: [] },
  generations: {},
  scores: { human: {}, judges: {} },
};

function makeGetRequest(params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  const url = `http://localhost/api/data?${searchParams.toString()}`;
  const req = new Request(url);
  // data route uses req.nextUrl.searchParams (NextRequest-specific)
  Object.defineProperty(req, 'nextUrl', {
    value: new URL(url),
    writable: false,
  });
  return req;
}

function makePostRequest(body: unknown) {
  return new Request('http://localhost/api/data', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GET /api/data', () => {
  test('GET ?url=... with data → 200 with revisions array', async () => {
    mockReadRevisions.mockResolvedValue([sampleRevision]);
    const req = makeGetRequest({ url: 'http://test.com' });
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
  });

  test('GET ?url=... with no data → 404', async () => {
    mockReadRevisions.mockResolvedValue(null);
    const req = makeGetRequest({ url: 'http://test.com' });
    const res = await GET(req as any);
    expect(res.status).toBe(404);
  });

  test('GET ?url=...&revision=1 → 200 with specific revision', async () => {
    mockReadRevision.mockResolvedValue(sampleRevision);
    const req = makeGetRequest({ url: 'http://test.com', revision: '1' });
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.revision).toBe(1);
  });

  test('GET ?url=...&revision=99 (not found) → 404', async () => {
    mockReadRevision.mockResolvedValue(null);
    const req = makeGetRequest({ url: 'http://test.com', revision: '99' });
    const res = await GET(req as any);
    expect(res.status).toBe(404);
  });

  test('GET missing url param → 400', async () => {
    const req = makeGetRequest({});
    const res = await GET(req as any);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/data', () => {
  const validPostBody = {
    url: 'http://test.com',
    prompts: {
      testMethodology: 'Test methodology',
      productRequirements: 'Product requirements',
      judgePrompt: 'Judge prompt',
    },
    revisionNotes: 'Initial',
    images: [],
    configSnapshot: { generators: [], judges: [] },
    generations: { claude: { output: 'output', tokenUsage: { input: 10, output: 20 }, latencyMs: 100, langfuseTraceId: 'trace' } },
    scores: { human: {}, judges: {} },
  };

  test('POST valid body → 200, {success: true, revision: number}', async () => {
    mockSaveRevision.mockResolvedValue(1);
    const req = makePostRequest(validPostBody);
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.revision).toBe(1);
  });

  test('POST missing url → 400', async () => {
    const { url: _, ...bodyWithoutUrl } = validPostBody;
    const req = makePostRequest(bodyWithoutUrl);
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test('POST missing prompts.testMethodology → 400', async () => {
    const body = {
      ...validPostBody,
      prompts: {
        productRequirements: 'Product requirements',
        judgePrompt: 'Judge prompt',
      },
    };
    const req = makePostRequest(body);
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test('POST missing generations → 400', async () => {
    const { generations: _, ...bodyWithoutGenerations } = validPostBody;
    const req = makePostRequest(bodyWithoutGenerations);
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test('POST to new URL creates revision 1', async () => {
    mockSaveRevision.mockResolvedValue(1);
    const req = makePostRequest(validPostBody);
    const res = await POST(req as any);
    const data = await res.json();
    expect(data.revision).toBe(1);
  });
});
