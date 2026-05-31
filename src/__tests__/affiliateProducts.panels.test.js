/**
 * affiliateProducts.panels.test.js — dual-panel FRAMING contract (Build 153
 * Workstream B polish: "two centerpiece grids" → "anchors grid + decor grid").
 *
 * TestFlight feedback on Build 153: both 2×2 grids were extracting centerpieces
 * (e.g. three sofas, two rugs) instead of Panel 1 = four distinct anchors
 * (sofa / coffee-table / accent-chair / rug) and Panel 2 = lighter decor
 * (lamp, vase, wall art …). The fix partitions the catalog into two DISJOINT,
 * jointly-exhaustive category sets and points each panel at one of them:
 *   • Panel 1 → getAnchorProductsForPrompt  (ANCHOR_CATEGORIES, ≤1 primary seat)
 *   • Panel 2 → getAccentProductsForPrompt  (DECOR_CATEGORIES)
 * Because ANCHOR ∩ DECOR = ∅, the two panels can never share a CATEGORY, which
 * is what structurally kills the "second rug / both grids are sofas" drift —
 * no separate cross-panel dedup pass required.
 *
 * These lock that contract:
 *   1. the partition really is disjoint (the invariant the whole fix rests on)
 *   2. getAnchorProductsForPrompt returns only ANCHOR categories
 *   3. anchors carry ≤1 primary seat (no "too many centerpieces")
 *   4. a realistic 4+4 assembly (mirroring HomeScreen's orchestration) yields
 *      8 unique products, category-disjoint across the two panels
 *
 * Runs under jest-expo with AsyncStorage mocked (the affiliateProducts import
 * chain transitively touches it). No network mock needed — both functions are
 * pure local catalog matching, no proxyFetch.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

import {
  getAnchorProductsForPrompt,
  getAccentProductsForPrompt,
} from '../services/affiliateProducts';

// Mirrors of the private sets in affiliateProducts.js. Re-declared on purpose:
// a change to either partition is a meaningful contract change that SHOULD
// force this test to be revisited.
const ANCHOR_CATEGORIES = new Set([
  'sofa', 'sectional', 'loveseat', 'lounge-chair', 'accent-chair',
  'coffee-table', 'dining-table', 'dining-chair', 'bar-stool', 'kitchen-island',
  'bed', 'nightstand', 'dresser', 'desk', 'desk-chair', 'office-chair',
  'bookshelf', 'tv-stand', 'media-console', 'furniture-set', 'fire-pit',
  'storage', 'rug',
]);
const DECOR_CATEGORIES = new Set([
  'table-lamp', 'floor-lamp', 'lamp', 'pendant-light', 'chandelier',
  'wall-art', 'vase', 'planter', 'mirror', 'throw-pillow', 'throw-blanket',
  'side-table', 'curtains',
]);
const PRIMARY_SEATING = new Set([
  'sofa', 'sectional', 'loveseat', 'furniture-set',
]);

// Living room is the richest room in the catalog → most reliable for the
// count-sensitive assertions. Category/disjointness assertions below hold
// regardless of how thin a room is.
const LIVING = 'modern minimalist living room with a low linen sofa, walnut coffee table, sage velvet accent chair and a large wool area rug';

describe('dual-panel framing partition', () => {
  it('ANCHOR_CATEGORIES and DECOR_CATEGORIES are disjoint (the core invariant)', () => {
    const overlap = [...ANCHOR_CATEGORIES].filter((c) => DECOR_CATEGORIES.has(c));
    expect(overlap).toEqual([]);
  });
});

describe('getAnchorProductsForPrompt (Panel 1 — anchors)', () => {
  it('returns at most `limit` products', () => {
    expect(getAnchorProductsForPrompt(LIVING, 6).length).toBeLessThanOrEqual(6);
    expect(getAnchorProductsForPrompt(LIVING, 4).length).toBeLessThanOrEqual(4);
  });

  it('returns a non-empty, normalized set for a furniture-rich prompt', () => {
    const res = getAnchorProductsForPrompt(LIVING, 6);
    expect(res.length).toBeGreaterThan(0);
    res.forEach((p) => {
      expect(typeof p.id).toBe('string');
      expect(p.id.length).toBeGreaterThan(0);
    });
  });

  it('only ever returns ANCHOR categories — never lighting / soft decor', () => {
    const res = getAnchorProductsForPrompt(LIVING, 6);
    res.forEach((p) => {
      expect(ANCHOR_CATEGORIES.has(p.category)).toBe(true);
      expect(DECOR_CATEGORIES.has(p.category)).toBe(false);
    });
  });

  it('collapses primary seating to at most ONE (no "too many centerpieces")', () => {
    const res = getAnchorProductsForPrompt(LIVING, 6);
    const seats = res.filter((p) => PRIMARY_SEATING.has(p.category));
    expect(seats.length).toBeLessThanOrEqual(1);
  });

  it('never throws on an empty prompt — returns an array', () => {
    const res = getAnchorProductsForPrompt('', 6);
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBeLessThanOrEqual(6);
  });
});

describe('4+4 assembly (mirrors HomeScreen dual-panel orchestration)', () => {
  it('produces 8 unique products that are category-disjoint across panels', () => {
    // Panel 1: anchors, then take the first 4 (HomeScreen slices to 4 for the grid).
    const anchors = getAnchorProductsForPrompt(LIVING, 6).slice(0, 4);
    // Panel 2: accents, excluding the anchor ids already committed (the real
    // call passes reachableProducts' ids as excludeIds).
    const anchorIds = anchors.map((p) => p.id);
    const accents = getAccentProductsForPrompt(LIVING, anchorIds, 4);

    // Sanity: living room is rich enough to actually fill both panels.
    expect(anchors.length).toBe(4);
    expect(accents.length).toBeGreaterThan(0);

    // Panel membership is correct.
    anchors.forEach((p) => expect(ANCHOR_CATEGORIES.has(p.category)).toBe(true));
    accents.forEach((p) => expect(DECOR_CATEGORIES.has(p.category)).toBe(true));

    // No product id appears in both panels (excludeIds did its job).
    const ids = [...anchors, ...accents].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);

    // No CATEGORY appears in both panels (the partition guarantees this).
    const anchorCats = new Set(anchors.map((p) => p.category));
    const sharedCat = accents.find((p) => anchorCats.has(p.category));
    expect(sharedCat).toBeUndefined();
  });
});
