import { GET } from '../../src/app/api/products/route';
import { listProducts } from '../../src/lib/storage';

jest.mock('../../src/lib/storage', () => ({
  listProducts: jest.fn(),
}));

const mockListProducts = listProducts as jest.Mock;

describe('GET /api/products', () => {
  test('GET → 200 with {products: []} when no data', async () => {
    mockListProducts.mockResolvedValue([]);
    const req = new Request('http://localhost/api/products');
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.products).toEqual([]);
  });

  test('GET → 200 with correct products list', async () => {
    const products = [
      { url: 'http://test.com', slug: 'test-com', revisionCount: 3 },
      { url: 'http://example.com', slug: 'example-com', revisionCount: 1 },
    ];
    mockListProducts.mockResolvedValue(products);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.products).toHaveLength(2);
    expect(data.products[0].url).toBe('http://test.com');
    expect(data.products[1].url).toBe('http://example.com');
  });

  test('product summary has url, slug, revisionCount', async () => {
    const products = [
      { url: 'http://test.com', slug: 'test-com', revisionCount: 5 },
    ];
    mockListProducts.mockResolvedValue(products);
    const res = await GET();
    const data = await res.json();
    const product = data.products[0];
    expect(product).toHaveProperty('url');
    expect(product).toHaveProperty('slug');
    expect(product).toHaveProperty('revisionCount');
    expect(product.revisionCount).toBe(5);
  });
});
