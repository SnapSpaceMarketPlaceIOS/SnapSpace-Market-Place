/**
 * promptBuilders.dualPanel.test.js — contract for buildDualPanelPrompt
 * (Build 153, Workstream B — the 4→8 product dual-panel path).
 *
 * buildDualPanelPrompt is pure (no network, no AsyncStorage — it only pulls
 * describeProductForPrompt from productDescriptor), so these run fast and
 * offline. They pin the prompt SHAPE that GPT Image 2 depends on:
 *   - TWO named grids: "anchor furniture" (image 2) + "accent decor" (image 3)
 *   - a single combined render directive carrying the LIVE product count
 *   - a fidelity clause asserting all-N must appear (count is inline, not the
 *     hardcoded-"4" FIDELITY_DIRECTIVES the single-panel path still uses)
 *   - global product numbering that continues across both grids (1..4, 5..8)
 *   - the architecture lock in the CLOSING position
 *   - graceful degradation to an anchor-only prompt when accents are empty
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

import { buildDualPanelPrompt } from '../services/promptBuilders';

// 4 anchor furniture pieces (image 2 grid)
const ANCHORS = [
  { id: 'c1', name: 'Cognac Leather Loveseat', category: 'sofa', materials: ['leather'], tags: ['cognac'] },
  { id: 'c2', name: 'Walnut Pedestal Coffee Table', category: 'coffee-table', materials: ['wood'], tags: ['walnut'] },
  { id: 'c3', name: 'Oak Dining Table', category: 'dining-table', materials: ['wood'], tags: ['oak'] },
  { id: 'c4', name: 'Upholstered Platform Bed', category: 'bed', materials: ['linen'], tags: ['gray'] },
];

// 4 accent/decor pieces (image 3 grid)
const ACCENTS = [
  { id: 'a1', name: 'Hand-Woven Jute Area Rug', category: 'rug', materials: ['jute'], tags: ['natural'] },
  { id: 'a2', name: 'Ceramic Table Lamp', category: 'table-lamp', materials: ['ceramic'], tags: ['white'] },
  { id: 'a3', name: 'Stoneware Vase', category: 'vase', materials: ['ceramic'], tags: ['sage'] },
  { id: 'a4', name: 'Framed Abstract Wall Art', category: 'wall-art', materials: ['canvas'], tags: ['gold'] },
];

describe('buildDualPanelPrompt — 8-product (4 anchors + 4 accents)', () => {
  const prompt = buildDualPanelPrompt('cozy dark luxe loft', ANCHORS, ACCENTS);

  it('returns a non-empty string', () => {
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('names BOTH grids — anchor furniture (image 2) and accent decor (image 3)', () => {
    expect(prompt).toContain('Image 2 is a 2×2 grid of anchor furniture');
    expect(prompt).toContain('Image 3 is a 2×2 grid of accent decor');
    // the 2×2 multiplication-sign token is part of the contract
    expect(prompt).toContain('2×2');
  });

  it('render + fidelity directives carry the LIVE count (8), not a hardcoded 4', () => {
    expect(prompt).toContain('Render all 8 products in the room');
    expect(prompt).toContain('All 8 products must appear');
    expect(prompt).not.toContain('Render all 4 products');
    expect(prompt).not.toContain('All 4 products must appear');
  });

  it('numbers products globally across both grids (anchors 1-4, accents start at 5)', () => {
    expect(prompt).toContain('Product 1 (image 2, top-left)');
    expect(prompt).toContain('Product 4 (image 2, bottom-right)');
    expect(prompt).toContain('Product 5 (image 3, top-left)');
    expect(prompt).toContain('Product 8 (image 3, bottom-right)');
  });

  it('wires each cell descriptor in from describeProductForPrompt', () => {
    expect(prompt).toContain('cognac leather loveseat sofa');
    expect(prompt).toMatch(/jute/);
  });

  it('places the architecture lock in the closing position', () => {
    expect(prompt).toContain(
      "Architecture lock: image 1's walls, floor, ceiling, windows, doors, trim, and camera angle remain identical to the room photo.",
    );
    expect(prompt.trimEnd().endsWith('never to surfaces.')).toBe(true);
  });

  it('wraps the user prompt as a scoped atmosphere clause', () => {
    expect(prompt).toContain('Atmosphere applies to lighting tone and upholstery only: cozy dark luxe loft.');
  });
});

describe('buildDualPanelPrompt — graceful degradation', () => {
  it('produces an anchor-only prompt (count 4, no accent grid) when accents are empty', () => {
    const prompt = buildDualPanelPrompt('modern minimalist', ANCHORS, []);
    expect(prompt).toContain('Image 2 is a 2×2 grid of anchor furniture');
    // no accent grid was sent → never reference accent decor or a third image
    expect(prompt).not.toContain('accent decor');
    expect(prompt).not.toContain('image 3');
    expect(prompt).toContain('Render all 4 products in the room');
    expect(prompt).toContain('All 4 products must appear');
    // architecture lock still closes the prompt
    expect(prompt.trimEnd().endsWith('never to surfaces.')).toBe(true);
  });

  it('omits the atmosphere clause when the user prompt is empty', () => {
    const prompt = buildDualPanelPrompt('', ANCHORS, ACCENTS);
    expect(prompt).not.toContain('Atmosphere applies');
    // still a valid 8-product prompt
    expect(prompt).toContain('Render all 8 products in the room');
  });
});

describe('buildDualPanelPrompt — per-grid 4-cell cap', () => {
  it('caps each grid at 4 cells (total 8) even when 6+6 products are passed', () => {
    const sixAnchors = [...ANCHORS, { id: 'c5', name: 'Extra Sofa', category: 'sofa' }, { id: 'c6', name: 'Extra Table', category: 'coffee-table' }];
    const sixAccents = [...ACCENTS, { id: 'a5', name: 'Extra Lamp', category: 'floor-lamp' }, { id: 'a6', name: 'Extra Mirror', category: 'mirror' }];
    const prompt = buildDualPanelPrompt('x', sixAnchors, sixAccents);
    expect(prompt).toContain('Render all 8 products in the room');
    expect(prompt).not.toContain('Render all 12 products');
    // no cell numbered beyond 8
    expect(prompt).not.toContain('Product 9');
  });
});
