import { GET, POST, PATCH } from '../../src/app/api/data/route';
import { readRevisions, readRevision, saveRevision, updateRevision } from '../../src/lib/storage';

jest.mock('../../src/lib/storage', () => ({
  urlToSlug: jest.fn((url: string) => url.replace(/[^a-z0-9]+/gi, '-').toLowerCase()),
  readRevisions: jest.fn(),
  readRevision: jest.fn(),
  saveRevision: jest.fn(),
  updateRevision: jest.fn(),
}));

const mockReadRevisions = readRevisions as jest.Mock;
const mockReadRevision = readRevision as jest.Mock;
const mockSaveRevision = saveRevision as jest.Mock;
const mockUpdateRevision = updateRevision as jest.Mock;

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

function makePatchRequest(body: unknown) {
  return new Request('http://localhost/api/data', {
    method: 'PATCH',
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

describe('PATCH /api/data', () => {
  test('valid patch with human scores → 200, {success: true}', async () => {
    mockUpdateRevision.mockResolvedValue(undefined);
    const req = makePatchRequest({
      url: 'http://test.com',
      revision: 1,
      scores: { human: { claude: 4 } },
    });
    const res = await PATCH(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  test('valid patch with judge scores → calls updateRevision with scores.judges', async () => {
    mockUpdateRevision.mockResolvedValue(undefined);
    const judgeScores = {
      'claude-judge': { claude: { score: 4, feedback: 'Good', langfuseTraceId: 'trace-1' } },
    };
    const req = makePatchRequest({
      url: 'http://test.com',
      revision: 2,
      scores: { judges: judgeScores },
    });
    await PATCH(req as any);
    expect(mockUpdateRevision).toHaveBeenCalledWith(
      expect.any(String),
      2,
      expect.objectContaining({ scores: expect.objectContaining({ judges: judgeScores }) })
    );
  });

  test('valid patch with generations → calls updateRevision with generations', async () => {
    mockUpdateRevision.mockResolvedValue(undefined);
    const gens = { claude: { output: 'out', tokenUsage: { input: 5, output: 10 }, latencyMs: 50, langfuseTraceId: 'trace-2' } };
    const req = makePatchRequest({ url: 'http://test.com', revision: 1, generations: gens });
    await PATCH(req as any);
    expect(mockUpdateRevision).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.objectContaining({ generations: gens })
    );
  });

  test('missing url → 400', async () => {
    const req = makePatchRequest({ revision: 1, scores: { human: { claude: 4 } } });
    const res = await PATCH(req as any);
    expect(res.status).toBe(400);
  });

  test('missing revision → 400', async () => {
    const req = makePatchRequest({ url: 'http://test.com', scores: { human: { claude: 4 } } });
    const res = await PATCH(req as any);
    expect(res.status).toBe(400);
  });

  test('valid patch with images → calls updateRevision with images array', async () => {
    mockUpdateRevision.mockResolvedValue(undefined);
    const imagePaths = ['data/images/slug/rev-1-screenshot-1.png'];
    const req = makePatchRequest({ url: 'http://test.com', revision: 1, images: imagePaths });
    await PATCH(req as any);
    expect(mockUpdateRevision).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.objectContaining({ images: imagePaths })
    );
  });

  test('updateRevision throws (revision not found) → 500', async () => {
    mockUpdateRevision.mockRejectedValue(new Error('Revision 99 not found for slug: test'));
    const req = makePatchRequest({ url: 'http://test.com', revision: 99 });
    const res = await PATCH(req as any);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.success).toBe(false);
  });
});
