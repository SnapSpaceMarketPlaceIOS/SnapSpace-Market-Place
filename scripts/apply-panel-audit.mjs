#!/usr/bin/env node
// scripts/apply-panel-audit.mjs
//
// Build 117 — Apply the panel-image audit output to productCatalog.js.
//
// Reads `scripts/panel-audit.json` (output of audit-panel-images.mjs) and
// rewrites `src/data/productCatalog.js` to add `panelImageUrl` and promote
// the audit-chosen studio shot to be `imageUrl` (hero) per product.
//
// Strategy — minimum surface area:
//   - Only touch products that cleared the audit threshold (chosenImage set).
//   - For each, locate the product block in productCatalog.js by `id:`/`asin:`
//     match and inject a `panelImageUrl` field below `imageUrl`.
//   - Promote audit-chosen URL to `imageUrl` (and prepend to `images[]`)
//     so Shop Room cards display the studio shot. The original lifestyle
//     hero shifts down in `images[]` so PDP gallery still shows it.
//   - Products that did NOT clear threshold are left UNCHANGED. They keep
//     today's behavior — no regression risk.
//
// Safety:
//   - Operates on text. Reads catalog as a string, makes targeted regex
//     substitutions per product, writes back. No JS evaluation, no AST.
//   - Validates that each substitution actually matched (refuses to write
//     if the file shape changed unexpectedly).
//   - Output diff is auditable per product.
//
// Usage:
//   node scripts/apply-panel-audit.mjs --dry-run   # report intended changes, write nothing
//   node scripts/apply-panel-audit.mjs             # write changes to catalog
//
// Outputs:
//   scripts/panel-audit-applied.md   — apply log: which products got swapped, which skipped

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const CATALOG_PATH = path.join(ROOT, 'src/data/productCatalog.js');
const AUDIT_PATH   = path.join(ROOT, 'scripts/panel-audit.json');
const LOG_PATH     = path.join(ROOT, 'scripts/panel-audit-applied.md');

const DRY = process.argv.includes('--dry-run');

// Strip trailing Amazon size suffix variations so we don't double-promote
// the same image just because the SL size differs (e.g. _AC_SL1500 vs _AC_UL640).
function urlsEqualIgnoringSize(a, b) {
  const norm = (u) => u.replace(/_AC_(SL|UL|SX|SR)\d+(_(\d+,\d+)?)?_/g, '_AC_SLNORM_');
  return norm(a) === norm(b);
}

(async () => {
  const auditRaw = await fs.readFile(AUDIT_PATH, 'utf8');
  const audit    = JSON.parse(auditRaw);
  const eligible = audit.results.filter(r => r.chosenImage && !r.needsManualPick && !r.error);

  console.log(`Audit input: ${audit.results.length} products, ${eligible.length} eligible for swap`);

  let catalog = await fs.readFile(CATALOG_PATH, 'utf8');
  const original = catalog;

  const log = [];
  let swappedCount = 0;
  let skippedAlreadyMatchedCount = 0;
  let notFoundCount = 0;

  for (const r of eligible) {
    // ── Locate the product block by id ──────────────────────────────────────
    // Some products have `id: 'XXX', asin: 'XXX',` on the same line; others
    // have just `id: 'XXX',` with asin on a later line or absent. Anchor only
    // on `id: 'XXX',` to handle both shapes. The non-greedy `[\s\S]*?` then
    // finds the FIRST `imageUrl: '` after the id, which is always the product's
    // top-level imageUrl (variants use `mainImage:` and `swatchImage:`, never
    // bare `imageUrl:`, so there's no ambiguity).
    const idStr      = r.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockRegex = new RegExp(
      `(    id: '${idStr}',[\\s\\S]*?\\n    imageUrl: ')([^']+)(',\\n    images: \\[\\n)([\\s\\S]*?)(\\n    \\],)`,
      'g',
    );

    const match = blockRegex.exec(catalog);
    if (!match) {
      log.push(`- ❌ \`${r.id}\` (${r.category}): block not found in catalog (regex shape changed?)`);
      notFoundCount++;
      continue;
    }

    const [whole, before, currentImageUrl, mid, imagesArrayBody, end] = match;

    // If audit picked the SAME image already in imageUrl (modulo Amazon size
    // suffix), there's nothing to do. Skip without churn.
    if (urlsEqualIgnoringSize(currentImageUrl, r.chosenImage)) {
      log.push(`- ⏭ \`${r.id}\` (${r.category}): audit pick == current imageUrl, no change`);
      skippedAlreadyMatchedCount++;
      continue;
    }

    // ── Build the replacement block ─────────────────────────────────────────
    // Goal:
    //   imageUrl       → r.chosenImage  (studio shot; renders in cards too)
    //   images[]       → [r.chosenImage, ...originals minus r.chosenImage]
    //   panelImageUrl  → r.chosenImage  (explicit field for createProductPanel)
    //
    // The original imageUrl typically appears in images[] already as one of
    // the gallery entries (sized differently). We dedupe in-place so the
    // gallery doesn't grow; if r.chosenImage is already in images[], we
    // promote it to first position; otherwise we prepend it.

    // Parse images[] body — array of URL strings on individual lines.
    const imageLines = imagesArrayBody.split('\n')
      .map(l => l.match(/^\s*'([^']+)',?\s*$/))
      .filter(Boolean)
      .map(m => m[1]);

    // Filter: keep entries that are NOT a size-variant of r.chosenImage.
    const otherImages = imageLines.filter(u => !urlsEqualIgnoringSize(u, r.chosenImage));
    // Always keep the original imageUrl (lifestyle hero) if it's not the
    // chosenImage — preserves PDP swipe richness.
    if (!urlsEqualIgnoringSize(currentImageUrl, r.chosenImage) &&
        !otherImages.some(u => urlsEqualIgnoringSize(u, currentImageUrl))) {
      otherImages.unshift(currentImageUrl);
    }
    const newImagesArray = [r.chosenImage, ...otherImages];

    // Format new images array body — match the catalog's existing 6-space indent.
    const newImagesBody = newImagesArray.map(u => `      '${u}',`).join('\n');

    // Inject panelImageUrl line right after the (new) imageUrl line.
    const replacement =
      before +
      r.chosenImage +
      `',\n    panelImageUrl: '${r.chosenImage}',\n    images: [\n` +
      newImagesBody +
      end;

    // Apply the substitution. Using `replace` with the literal `whole` string
    // ensures we don't accidentally hit a different product block.
    if (!catalog.includes(whole)) {
      log.push(`- ❌ \`${r.id}\`: block string drift between regex match and replace`);
      notFoundCount++;
      continue;
    }
    catalog = catalog.replace(whole, replacement);

    log.push(
      `- ✓ \`${r.id}\` (${r.category}, score ${r.chosenScore}): ` +
      `imageUrl ${currentImageUrl.split('/').pop()?.slice(0, 30)} → ` +
      `${r.chosenImage.split('/').pop()?.slice(0, 30)}`
    );
    swappedCount++;
  }

  // ── Write outputs ─────────────────────────────────────────────────────────
  const summary = [
    `# Panel Audit Apply Log`,
    ``,
    `**Generated:** ${new Date().toISOString()}`,
    `**Mode:** ${DRY ? 'DRY RUN (no file write)' : 'APPLIED'}`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Count |`,
    `|---|---|`,
    `| Eligible for swap | ${eligible.length} |`,
    `| Swapped | ${swappedCount} |`,
    `| Skipped (already matched) | ${skippedAlreadyMatchedCount} |`,
    `| Not found / drift | ${notFoundCount} |`,
    ``,
    `## Per-product log`,
    ``,
    ...log,
    ``,
  ].join('\n');

  await fs.writeFile(LOG_PATH, summary);

  if (DRY) {
    console.log(`DRY RUN — no file written. ${swappedCount} would-swap, ${skippedAlreadyMatchedCount} no-op, ${notFoundCount} drift.`);
    console.log(`Log: ${path.relative(ROOT, LOG_PATH)}`);
    return;
  }

  if (notFoundCount > 0) {
    console.error(`ABORTING WRITE: ${notFoundCount} products had block-shape drift. Investigate before retrying.`);
    console.error(`Log: ${path.relative(ROOT, LOG_PATH)}`);
    process.exit(2);
  }

  await fs.writeFile(CATALOG_PATH, catalog);

  // Quick sanity-check: file should now be larger by roughly swappedCount * 80 bytes.
  const sizeBefore = original.length;
  const sizeAfter  = catalog.length;
  console.log(`Catalog written: ${sizeBefore} → ${sizeAfter} bytes (${sizeAfter - sizeBefore > 0 ? '+' : ''}${sizeAfter - sizeBefore})`);
  console.log(`Swapped: ${swappedCount} | Skipped (no-op): ${skippedAlreadyMatchedCount}`);
  console.log(`Log: ${path.relative(ROOT, LOG_PATH)}`);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
