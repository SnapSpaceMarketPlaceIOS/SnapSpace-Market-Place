/**
 * productCatalog.js — lazy facade over productCatalogData.js.
 *
 * Build 147 (C1): the 2.87 MB catalog array used to live here and was
 * pulled into the cold-start critical path by every consumer that did
 * `import { PRODUCT_CATALOG } from '../data/productCatalog'`. Hermes
 * deserialized the bytecode for all 617 product literals before the
 * first frame could render — inferred 250–600 ms on iPhone 14 Pro.
 *
 * Now: the data array + helpers live in `productCatalogData.js`. This
 * facade lazy-`require()`s that file the first time any consumer asks
 * for the catalog. Until then, the heavy bytecode stays cold.
 *
 * Migration pattern (new code):
 *   import { getCatalog, getProductsByIds } from '../data/productCatalog';
 *   const all = getCatalog();                  // O(1) after first call
 *   const liked = getProductsByIds(likedIds);  // safe at boot — deferred
 *
 * Backwards compatibility:
 *   `PRODUCT_CATALOG` is intentionally NOT exported here. Top-level ESM
 *   imports of that binding would trigger module evaluation and reload
 *   the regression we just fixed. Old call sites have been migrated.
 *   If you need the array as a value (not a function call), use
 *   `getCatalog()` — it returns the same memoized reference.
 *
 * Helpers re-exported: `getCatalog`, `getProductById`, `getProductsByIds`,
 * `getProductsByCategory`, `getProductsByRoomType`, `getProductsByStyle`,
 * `isEnriched`, `getVariantColorContext`.
 *
 * Performance note: `require()` is CommonJS-style and lazy. ESM `import`
 * resolves modules at link time (eager). Keeping all data-module access
 * behind `require()` is what makes the lazy load work — switching any of
 * the helpers below to a top-level `import './productCatalogData'` would
 * undo the optimization.
 */

let _mod = null;

function _data() {
  if (!_mod) {
    _mod = require('./productCatalogData');
  }
  return _mod;
}

/**
 * Returns the full catalog array. Triggers a one-time module-load on
 * first call (~250–600 ms inferred on cold cache, iPhone 14 Pro). All
 * subsequent calls return the same memoized reference in O(1).
 */
export function getCatalog() {
  return _data().PRODUCT_CATALOG;
}

export function getProductById(id) {
  return _data().getProductById(id);
}

export function getProductsByIds(ids = []) {
  return _data().getProductsByIds(ids);
}

export function getProductsByCategory(category) {
  return _data().getProductsByCategory(category);
}

export function getProductsByRoomType(roomType) {
  return _data().getProductsByRoomType(roomType);
}

export function getProductsByStyle(style) {
  return _data().getProductsByStyle(style);
}

export function isEnriched(product) {
  return _data().isEnriched(product);
}

export function getVariantColorContext(product) {
  return _data().getVariantColorContext(product);
}
