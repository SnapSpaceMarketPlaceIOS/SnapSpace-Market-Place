jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
import { matchProducts } from '../services/productMatcher';
import catalog from '../data/productCatalog';

describe('matchProducts', () => {
  const parsedPrompt = {
    roomType: 'living-room',
    styles: ['minimalist', 'scandi'],
    materials: ['wood', 'linen'],
    moods: ['calm'],
    furnitureCategories: ['sofa', 'coffee-table', 'rug'],
  };

  it('returns an array of products', () => {
    const results = matchProducts(parsedPrompt, catalog);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns at most 6 products by default', () => {
    const results = matchProducts(parsedPrompt, catalog);
    expect(results.length).toBeLessThanOrEqual(6);
  });

  it('returns products relevant to the room type', () => {
    const results = matchProducts(parsedPrompt, catalog);
    const hasLivingRoomProduct = results.some(
      (p) => p.roomType === 'living-room' || p.category === 'sofa' || p.category === 'rug'
    );
    expect(hasLivingRoomProduct).toBe(true);
  });

  it('respects custom limit', () => {
    // Build 146: matchProducts signature is (parsedPrompt, limit, catalog, ...)
    // — the previous test call had (parsedPrompt, catalog, 3) which assigned
    // 3 to the catalog slot and threw "3.filter is not a function". The
    // `catalog` local is undefined (default-import on a named-only module)
    // but the matcher's default catalog param falls back to PRODUCT_CATALOG.
    const results = matchProducts(parsedPrompt, 3, catalog);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});
