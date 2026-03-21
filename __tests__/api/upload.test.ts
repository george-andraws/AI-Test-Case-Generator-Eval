import { GET, POST } from '../../src/app/api/upload/route';
import fs from 'fs/promises';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/lib/storage', () => ({
  urlToSlug: jest.fn((url: string) =>
    url
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase()
      .replace(/^-+|-+$/g, '')
  ),
}));

const mockReadFile = fs.readFile as jest.Mock;
const mockWriteFile = fs.writeFile as jest.Mock;
const mockMkdir = fs.mkdir as jest.Mock;

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeGetRequest(params: Record<string, string>) {
  const url = `http://localhost/api/upload?${new URLSearchParams(params)}`;
  const req = new Request(url);
  Object.defineProperty(req, 'nextUrl', { value: new URL(url), writable: false });
  return req;
}

function makeMockFile(name: string, mimeType: string, content = 'fake-image-bytes') {
  const bytes = Buffer.from(content);
  return {
    name,
    type: mimeType,
    size: bytes.length,
    arrayBuffer: async (): Promise<ArrayBuffer> =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  };
}

type MockFile = ReturnType<typeof makeMockFile>;

function makePostRequest(opts: { url?: string; revision?: string; images?: MockFile[] }) {
  const mockFD = {
    get: (key: string) => {
      if (key === 'url') return opts.url ?? null;
      if (key === 'revision') return opts.revision ?? null;
      return null;
    },
    getAll: (key: string) => (key === 'images' ? (opts.images ?? []) : []),
  };
  return { formData: jest.fn().mockResolvedValue(mockFD) };
}

function makeThrowingFormDataRequest() {
  return { formData: jest.fn().mockRejectedValue(new Error('bad multipart')) };
}

// ── GET /api/upload ────────────────────────────────────────────────────────────

describe('GET /api/upload', () => {
  test('valid data/images/ path → 200 with correct Content-Type for png', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('PNG_BYTES'));
    const req = makeGetRequest({ path: 'data/images/my-slug/rev-1-screenshot-1.png' });
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
  });

  test('.jpg path → Content-Type image/jpeg', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('JPEG_BYTES'));
    const req = makeGetRequest({ path: 'data/images/slug/rev-1-screenshot-1.jpg' });
    const res = await GET(req as any);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
  });

  test('.webp path → Content-Type image/webp', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('WEBP_BYTES'));
    const req = makeGetRequest({ path: 'data/images/slug/rev-2-screenshot-1.webp' });
    const res = await GET(req as any);
    expect(res.headers.get('Content-Type')).toBe('image/webp');
  });

  test('missing path param → 400', async () => {
    const req = makeGetRequest({});
    const res = await GET(req as any);
    expect(res.status).toBe(400);
  });

  test('path traversal attempt (../../../) → 403', async () => {
    const req = makeGetRequest({ path: '../../../etc/passwd' });
    const res = await GET(req as any);
    expect(res.status).toBe(403);
  });

  test('path outside data/images/ (data/revisions.json) → 403', async () => {
    const req = makeGetRequest({ path: 'data/localhost-3000.json' });
    const res = await GET(req as any);
    expect(res.status).toBe(403);
  });

  test('file not found → 404', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const req = makeGetRequest({ path: 'data/images/slug/rev-99-screenshot-1.png' });
    const res = await GET(req as any);
    expect(res.status).toBe(404);
  });
});

// ── POST /api/upload ───────────────────────────────────────────────────────────

describe('POST /api/upload', () => {
  test('single PNG file → 200, path follows rev-N-screenshot-1.png pattern', async () => {
    const req = makePostRequest({
      url: 'http://test.com',
      revision: '1',
      images: [makeMockFile('screenshot.png', 'image/png')],
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.paths).toHaveLength(1);
    expect(data.paths[0]).toMatch(/^data\/images\/.+\/rev-1-screenshot-1\.png$/);
  });

  test('jpeg MIME → .jpg extension in path', async () => {
    const req = makePostRequest({
      url: 'http://test.com',
      revision: '1',
      images: [makeMockFile('photo.jpg', 'image/jpeg')],
    });
    const res = await POST(req as any);
    const data = await res.json();
    expect(data.paths[0]).toMatch(/\.jpg$/);
  });

  test('multiple files → paths indexed screenshot-1, screenshot-2', async () => {
    const req = makePostRequest({
      url: 'http://test.com',
      revision: '2',
      images: [makeMockFile('a.png', 'image/png'), makeMockFile('b.webp', 'image/webp')],
    });
    const res = await POST(req as any);
    const data = await res.json();
    expect(data.paths).toHaveLength(2);
    expect(data.paths[0]).toContain('screenshot-1');
    expect(data.paths[1]).toContain('screenshot-2');
  });

  test('no files → 200 with empty paths array (no mkdir/writeFile)', async () => {
    const req = makePostRequest({ url: 'http://test.com', revision: '1', images: [] });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.paths).toEqual([]);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  test('mkdir called with recursive: true for the image dir', async () => {
    const req = makePostRequest({
      url: 'http://test.com',
      revision: '1',
      images: [makeMockFile('a.png', 'image/png')],
    });
    await POST(req as any);
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('images'),
      expect.objectContaining({ recursive: true })
    );
  });

  test('writeFile called once per image', async () => {
    const req = makePostRequest({
      url: 'http://test.com',
      revision: '1',
      images: [makeMockFile('a.png', 'image/png'), makeMockFile('b.png', 'image/png')],
    });
    await POST(req as any);
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
  });

  test('missing url → 400', async () => {
    const req = makePostRequest({ revision: '1', images: [] });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test('missing revision → 400', async () => {
    const req = makePostRequest({ url: 'http://test.com', images: [] });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test('non-numeric revision → 400', async () => {
    const req = makePostRequest({
      url: 'http://test.com',
      revision: 'notanumber',
      images: [makeMockFile('a.png', 'image/png')],
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test('unsupported MIME type (image/gif) → 400', async () => {
    const req = makePostRequest({
      url: 'http://test.com',
      revision: '1',
      images: [makeMockFile('anim.gif', 'image/gif')],
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test('formData() throws → 400', async () => {
    const res = await POST(makeThrowingFormDataRequest() as any);
    expect(res.status).toBe(400);
  });
});
