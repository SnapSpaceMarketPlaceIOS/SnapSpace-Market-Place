/**
 * visionMatcher.verify8.test.js — Build 153 Fix A regression guard.
 *
 * Workstream B raised the committed product count from 4 → 8 (anchor panel +
 * accent panel). The post-render verifier (`verifyGeneratedProducts`) was built
 * for the 4-product era: its vision prompt asked for "4-6 items" and its
 * max_tokens ceiling could truncate a longer list. The low-dominance accents we
 * added (rug, throw pillow, vase, lamp) were therefore the most likely to be
 * omitted from the vision item list, scored 0, and badged "similar" even when
 * they rendered fine.
 *
 * These tests lock the behavior the fix depends on:
 *   1. verifyGeneratedProducts processes ALL 8 reference products (no 6-cap) and
 *      passes the full vision item list through.
 *   2. When vision DOES return items for the accents (the point of the prompt
 *      change), accent products verify instead of defaulting to "similar".
 *   3. If vision is unavailable / the JSON is truncated/unparseable, all 8
 *      products still come back (as 'unverified') — the fallback never drops or
 *      caps the set.
 *
 * Runs under jest-expo with AsyncStorage mocked (visionMatcher's import chain —
 * productCatalog facade — transitively touches it) and apiProxy mocked so no
 * network call is made; we feed canned Claude-vision JSON directly.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/apiProxy', () => ({
  proxyFetch: jest.fn(),
}));

import { verifyGeneratedProducts } from '../services/visionMatcher';
import { proxyFetch } from '../services/apiProxy';

// Helper: wrap a vision payload object the way the Anthropic messages API does.
function mockVisionResponse(payload) {
  return {
    ok: true,
    json: async () => ({ content: [{ text: JSON.stringify(payload) }] }),
  };
}

// 8 committed reference products: 4 anchors + 4 accents. The accents
// (rug / floor-lamp / throw-pillow / vase) are exactly the low-dominance pieces
// the 4-6 cap used to drop from verification.
const EIGHT_PRODUCTS = [
  { id: 'a1', category: 'sofa',         name: 'Rivet Cream Linen Sectional Sofa', description: 'low profile sectional', materials: ['linen'],  styles: ['japandi'],      tags: ['cream'] },
  { id: 'a2', category: 'coffee-table', name: 'Walnut Round Coffee Table',         description: 'round walnut wood table', materials: ['wood'],   styles: ['japandi'],      tags: ['walnut'] },
  { id: 'a3', category: 'accent-chair', name: 'Sage Velvet Accent Chair',          description: 'curved accent chair',     materials: ['velvet'], styles: ['japandi'],      tags: ['sage', 'green'] },
  { id: 'a4', category: 'side-table',   name: 'Oak Side Table',                    description: 'small side table',        materials: ['wood'],   styles: ['scandinavian'], tags: ['oak'] },
  { id: 'c1', category: 'rug',          name: 'Beige Wool Area Rug',               description: 'large area rug',          materials: ['wool'],   styles: ['japandi'],      tags: ['beige'] },
  { id: 'c2', category: 'floor-lamp',   name: 'Brass Arc Floor Lamp',              description: 'arc floor lamp',          materials: ['brass', 'metal'], styles: ['mid-century'], tags: ['gold', 'brass'] },
  { id: 'c3', category: 'throw-pillow', name: 'Cream Linen Throw Pillow',          description: 'square throw pillow',     materials: ['linen'],  styles: ['japandi'],      tags: ['cream'] },
  { id: 'c4', category: 'vase',         name: 'Ceramic Sage Vase',                 description: 'tall ceramic vase',       materials: ['ceramic'], styles: ['japandi'],     tags: ['sage', 'green'] },
];

// Vision returns 8 items — one per product, including the small accents. This is
// the scenario the prompt change ("list up to 10, include accents") enables.
const EIGHT_VISION_ITEMS = {
  roomType: 'living-room',
  items: [
    { category: 'sofa',         color: 'cream',      material: 'linen',   shape: 'low profile', style: 'japandi',      size: 'large',  dominance: 'high',   description: 'large cream linen sectional sofa low profile' },
    { category: 'coffee-table', color: 'walnut',     material: 'wood',    shape: 'round',       style: 'japandi',      size: 'medium', dominance: 'high',   description: 'round walnut wood coffee table' },
    { category: 'accent-chair', color: 'sage green', material: 'velvet',  shape: 'curved',      style: 'japandi',      size: 'medium', dominance: 'medium', description: 'sage green velvet accent chair' },
    { category: 'side-table',   color: 'oak',        material: 'wood',    shape: 'small',       style: 'scandinavian', size: 'small',  dominance: 'low',    description: 'small oak side table' },
    { category: 'rug',          color: 'beige',      material: 'wool',    shape: 'rectangular', style: 'japandi',      size: 'large',  dominance: 'medium', description: 'large beige wool area rug' },
    { category: 'floor-lamp',   color: 'gold',       material: 'brass',   shape: 'arc',         style: 'mid-century',  size: 'large',  dominance: 'low',    description: 'brass arc floor lamp' },
    { category: 'throw-pillow', color: 'cream',      material: 'linen',   shape: 'square',      style: 'japandi',      size: 'small',  dominance: 'low',    description: 'cream linen throw pillow' },
    { category: 'vase',         color: 'sage green', material: 'ceramic', shape: 'tall',        style: 'japandi',      size: 'small',  dominance: 'low',    description: 'ceramic sage vase' },
  ],
};

const byId = (products, id) => products.find(p => p.id === id);

beforeEach(() => {
  proxyFetch.mockReset();
});

describe('verifyGeneratedProducts — 8-product (dual-panel) verification', () => {
  test('processes all 8 reference products and passes through all vision items', async () => {
    proxyFetch.mockResolvedValueOnce(mockVisionResponse(EIGHT_VISION_ITEMS));

    const result = await verifyGeneratedProducts('https://example.com/room.jpg', EIGHT_PRODUCTS);

    // No hidden 6-cap: every committed product is returned, every one tagged.
    expect(result.products).toHaveLength(8);
    expect(result.products.every(p => typeof p.confidence === 'string')).toBe(true);
    expect(result.visionItems).toHaveLength(8);
    expect(result.roomType).toBe('living-room');

    // The returned set is exactly the committed ids (never-swap contract).
    const ids = result.products.map(p => p.id).sort();
    expect(ids).toEqual(['a1', 'a2', 'a3', 'a4', 'c1', 'c2', 'c3', 'c4']);
  });

  test('low-dominance ACCENTS verify when vision lists them (the regression target)', async () => {
    proxyFetch.mockResolvedValueOnce(mockVisionResponse(EIGHT_VISION_ITEMS));

    const result = await verifyGeneratedProducts('https://example.com/room.jpg', EIGHT_PRODUCTS);

    // These are the four accents the old 4-6 cap would have starved of a vision
    // item → forced to 'similar'. With the fix they get scored and verified.
    expect(byId(result.products, 'c1').confidence).toBe('verified'); // rug
    expect(byId(result.products, 'c2').confidence).toBe('verified'); // floor-lamp
    expect(byId(result.products, 'c3').confidence).toBe('verified'); // throw-pillow
    expect(byId(result.products, 'c4').confidence).toBe('verified'); // vase

    // And the verified count should reflect the full set matching (>= the 4
    // accents + the 4 anchors all scoring above their category thresholds).
    const verifiedCount = result.products.filter(p => p.confidence === 'verified').length;
    expect(verifiedCount).toBeGreaterThanOrEqual(6);
  });

  test('fallback: unparseable/truncated vision JSON → all 8 returned as unverified', async () => {
    // Simulates a truncated response (the failure mode max_tokens=2048 guards
    // against) — analyzeRoomImage JSON.parse throws → vision treated unavailable.
    proxyFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ text: '{ "roomType": "living-room", "items": [ {' }] }),
    });

    const result = await verifyGeneratedProducts('https://example.com/room.jpg', EIGHT_PRODUCTS);

    expect(result.products).toHaveLength(8);
    expect(result.products.every(p => p.confidence === 'unverified')).toBe(true);
    expect(result.visionItems).toHaveLength(0);
  });

  test('empty reference set is handled without a vision call', async () => {
    const result = await verifyGeneratedProducts('https://example.com/room.jpg', []);
    expect(result.products).toHaveLength(0);
    expect(proxyFetch).not.toHaveBeenCalled();
  });
});
