/**
 * affiliateProducts.accent.test.js — contract for getAccentProductsForPrompt
 * (Build 153, Workstream B — panel 2, the decor grid).
 *
 * Panel-framing polish update: getAccentProductsForPrompt now filters the
 * catalog by DECOR_CATEGORIES, NOT the older ACCENT_CATEGORIES. The two differ
 * deliberately — DECOR drops `rug` and `accent-chair` (both promoted to Panel 1
 * anchors so Panel 2 never renders a second centerpiece) and adds `chandelier`.
 * The local mirror set below tracks DECOR_CATEGORIES, not ACCENT_CATEGORIES.
 *
 * Runs under jest-expo with AsyncStorage mocked (the affiliateProducts import
 * chain — productMatcher, the 2.87 MB catalog facade — transitively touches it;
 * the pre-existing productMatcher.coverage.test.js fails ONLY because it omits
 * this mock). These assert the three guarantees the dual-panel orchestration in
 * HomeScreen relies on:
 *   1. never returns more than `limit` products
 *   2. every product comes from a DECOR category (no anchors / primary furniture,
 *      and specifically no rug or accent-chair — those are Panel 1's job)
 *   3. excludeIds (the center pieces already in panel 1) never reappear, so the
 *      two panels are always disjoint
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

import { getAccentProductsForPrompt } from '../services/affiliateProducts';

// The decor contract — mirrors DECOR_CATEGORIES in affiliateProducts.js.
// Re-declared here on purpose: changing which categories count as "decor" is a
// meaningful contract change that SHOULD force this test to be revisited.
const DECOR_CATEGORIES = new Set([
  'table-lamp', 'floor-lamp', 'lamp', 'pendant-light', 'chandelier',
  'wall-art', 'vase', 'planter', 'mirror', 'throw-pillow', 'throw-blanket',
  'side-table', 'curtains',
]);

const PROMPT = 'cozy bohemian living room with a woven area rug, table lamp, throw pillows and framed wall art';

describe('getAccentProductsForPrompt', () => {
  it('returns at most `limit` products (default 4)', () => {
    expect(getAccentProductsForPrompt(PROMPT).length).toBeLessThanOrEqual(4);
    expect(getAccentProductsForPrompt(PROMPT, [], 3).length).toBeLessThanOrEqual(3);
  });

  it('returns a non-empty, normalized set for a decor-rich prompt', () => {
    const res = getAccentProductsForPrompt(PROMPT, [], 4);
    expect(res.length).toBeGreaterThan(0);
    res.forEach((p) => {
      expect(typeof p.id).toBe('string');
      expect(p.id.length).toBeGreaterThan(0);
    });
  });

  it('only ever returns DECOR categories — never anchors, rug, or accent-chair', () => {
    const res = getAccentProductsForPrompt(PROMPT, [], 4);
    res.forEach((p) => {
      expect(DECOR_CATEGORIES.has(p.category)).toBe(true);
      // The two categories most likely to drift back in (they used to be
      // accents) must stay out — they're Panel 1 anchors now.
      expect(p.category).not.toBe('rug');
      expect(p.category).not.toBe('accent-chair');
    });
  });

  it('never returns a product whose id is in excludeIds (panels stay disjoint)', () => {
    // Harvest a stable exclude list from a wider pull, then exclude all of them.
    const firstBatch = getAccentProductsForPrompt(PROMPT, [], 8);
    const excludeIds = firstBatch.map((p) => p.id);
    expect(excludeIds.length).toBeGreaterThan(0);

    const res = getAccentProductsForPrompt(PROMPT, excludeIds, 4);
    const excludeSet = new Set(excludeIds);
    res.forEach((p) => {
      expect(excludeSet.has(p.id)).toBe(false);
    });
  });

  it('never throws on an empty prompt — returns an array', () => {
    const res = getAccentProductsForPrompt('', [], 4);
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBeLessThanOrEqual(4);
  });
});
