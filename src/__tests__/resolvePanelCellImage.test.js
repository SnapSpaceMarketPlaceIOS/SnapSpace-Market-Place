/**
 * resolvePanelCellImage.test.js — the "input = output" contract helper
 * (Build 153 Workstream B polish).
 *
 * resolvePanelCellImage is the SINGLE SOURCE OF TRUTH for "the exact image the
 * AI saw for a product in the 2×2 reference grid." createProductPanel builds
 * the FAL grid from it, and RoomResultScreen's buy card now renders the
 * identical image from it — so the variant the AI was told to reproduce is the
 * variant the shopper is shown and sold. These lock the selection precedence so
 * the panel input and the card output can never drift apart again.
 *
 * The helper is pure (no I/O), but createProductPanel.js imports the supabase
 * client at module load, so we stub that module to keep the import graph inert.
 * AsyncStorage is also mocked belt-and-suspenders (it's only reached through
 * supabase, which is stubbed, but the mock costs nothing and matches the
 * project's test convention).
 */

jest.mock('../services/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

import { resolvePanelCellImage } from '../utils/createProductPanel';

describe('resolvePanelCellImage — hard goods (studio cutout wins)', () => {
  it('returns the matched variant panelImage (the colorway cutout the AI saw)', () => {
    const product = {
      category: 'sofa',
      imageUrl: 'http://img/sofa-lifestyle.jpg',
      panelImageUrl: 'http://img/sofa-default-panel.jpg',
      _matchedVariant: {
        label: 'Sage Green',
        panelImage: 'http://img/sage-cutout_AC_SL1000_.jpg',
        mainImage: 'http://img/sage-main.jpg',
      },
    };
    // …and normalizes the Amazon size token to 1500px.
    expect(resolvePanelCellImage(product)).toBe('http://img/sage-cutout_AC_SL1500_.jpg');
  });

  it('falls back to product.panelImageUrl when the variant has no panelImage', () => {
    const product = {
      category: 'coffee-table',
      imageUrl: 'http://img/table-lifestyle.jpg',
      panelImageUrl: 'http://img/table-panel.jpg',
      _matchedVariant: { label: 'Walnut', mainImage: 'http://img/walnut-main.jpg' },
    };
    expect(resolvePanelCellImage(product)).toBe('http://img/table-panel.jpg');
  });

  it('falls back to imageUrl when no panel sources exist at all', () => {
    const product = { category: 'desk', imageUrl: 'http://img/desk.jpg' };
    expect(resolvePanelCellImage(product)).toBe('http://img/desk.jpg');
  });
});

describe('resolvePanelCellImage — lifestyle categories (context shot wins)', () => {
  it('keeps the lifestyle imageUrl for a mirror, NOT a bad variant hero (the "black sphere" fix)', () => {
    const product = {
      category: 'mirror',
      imageUrl: 'http://img/mirror-in-room.jpg',
      _matchedVariant: {
        label: 'Black',
        mainImage: 'http://img/black-sphere-cutout.jpg', // the misleading hero
        swatchImage: 'http://img/mirror-swatch.jpg',
      },
    };
    expect(resolvePanelCellImage(product)).toBe('http://img/mirror-in-room.jpg');
  });

  it('uses the clean panelImageUrl when the lifestyle slot collapsed to a swatch crop', () => {
    const product = {
      category: 'rug',
      imageUrl: 'http://img/rug-swatch.jpg',          // == variant.swatchImage (a texture crop)
      panelImageUrl: 'http://img/rug-clean-panel.jpg',
      _matchedVariant: { label: 'Ivory', swatchImage: 'http://img/rug-swatch.jpg' },
    };
    expect(resolvePanelCellImage(product)).toBe('http://img/rug-clean-panel.jpg');
  });

  it('keeps lifestyle imageUrl for a pendant even when a variant panelImage exists', () => {
    const product = {
      category: 'pendant-light',
      imageUrl: 'http://img/pendant-hung.jpg',
      _matchedVariant: { label: 'Brass', panelImage: 'http://img/pendant-cutout.jpg' },
    };
    expect(resolvePanelCellImage(product)).toBe('http://img/pendant-hung.jpg');
  });
});

describe('resolvePanelCellImage — normalization + guards', () => {
  it('normalizes _AC_UL / _SX / _SR Amazon tokens to _AC_SL1500_', () => {
    expect(resolvePanelCellImage({ category: 'sofa', imageUrl: 'http://img/a_AC_UL320_.jpg' }))
      .toBe('http://img/a_AC_SL1500_.jpg');
    expect(resolvePanelCellImage({ category: 'sofa', imageUrl: 'http://img/b_SX466_.jpg' }))
      .toBe('http://img/b_AC_SL1500_.jpg');
    expect(resolvePanelCellImage({ category: 'sofa', imageUrl: 'http://img/c_SR38,50_.jpg' }))
      .toBe('http://img/c_AC_SL1500_.jpg');
  });

  it('returns null for null / non-object / non-http inputs', () => {
    expect(resolvePanelCellImage(null)).toBeNull();
    expect(resolvePanelCellImage(undefined)).toBeNull();
    expect(resolvePanelCellImage('nope')).toBeNull();
    expect(resolvePanelCellImage({})).toBeNull();                              // no usable url
    expect(resolvePanelCellImage({ category: 'sofa', imageUrl: '/local.jpg' })).toBeNull(); // not http
  });
});
