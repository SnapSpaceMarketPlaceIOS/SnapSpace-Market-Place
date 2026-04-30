#!/usr/bin/env node
// scripts/revert-imageurl-keep-panel.mjs
//
// Build 121 fix: split the catalog audit's TWO behaviors so users see lifestyle
// photos in Explore/Shop-Room/PDP while the AI panel still consumes the clean
// studio shot.
//
// Build 117 audit overshot — Haiku scored "studio fitness for AI input" and
// my apply script promoted those scores into BOTH `panelImageUrl` (correct
// — for AI panel) AND `imageUrl` / `images[0]` (wrong — for human shoppers).
// Diagram drawings, dimension charts, and packaging photos got promoted
// because they're "clean" for AI vision but useless for selling.
//
// Strategy:
//   1. Start from PRE-AUDIT productCatalog.js (commit 0a12a0c, Build 116 base)
//      — that's where imageUrl + images[] order are exactly the original
//      lifestyle hero arrangement that shoppers love.
//   2. For each product the audit DID swap (chosenImage set, !needsManualPick),
//      inject the `panelImageUrl: '<chosen>'` line right after imageUrl, AND
//      ensure the chosen studio shot is at images[1] (so PDP swipe goes
//      lifestyle → studio → rest).
//   3. Skip products the audit didn't swap (currentImageUrl == chosenImage
//      modulo size suffix, OR audit didn't clear threshold) — pre-audit state
//      is already correct for those.
//
// Net effect: imageUrl + images[0] = lifestyle (pre-audit), images[1] = studio
// shot, panelImageUrl = studio shot. AI panel uses panelImageUrl via the
// existing `pickPanelSource` logic in createProductPanel.js. Shoppers see
// the gorgeous lifestyle photo. AI sees the clean reference. Win-win.
//
// Usage:
//   node scripts/revert-imageurl-keep-panel.mjs --dry-run
//   node scripts/revert-imageurl-keep-panel.mjs

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const CATALOG_PATH   = path.join(ROOT, 'src/data/productCatalog.js');
const AUDIT_PATH     = path.join(ROOT, 'scripts/panel-audit.json');
const LOG_PATH       = path.join(ROOT, 'scripts/revert-imageurl-applied.md');
const PRE_AUDIT_REF  = '0a12a0c';   // Build 116 commit, pre-audit catalog state

const DRY = process.argv.includes('--dry-run');

// Strip Amazon size suffix variants when comparing URLs (e.g. _AC_SL1500_ vs _AC_UL640_)
function urlsEqualIgnoringSize(a, b) {
  if (!a || !b) return false;
  const norm = (u) => u.replace(/_AC_(SL|UL|SX|SR)\d+(_(\d+,\d+)?)?_/g, '_AC_SLNORM_');
  return norm(a) === norm(b);
}

(async () => {
  // 1. Load the panel-audit JSON for the swap decisions
  const auditRaw = await fs.readFile(AUDIT_PATH, 'utf8');
  const audit    = JSON.parse(auditRaw);
  const eligible = audit.results.filter(r => r.chosenImage && !r.needsManualPick && !r.error);
  console.log(`Audit input: ${audit.results.length} products | ${eligible.length} eligible for revert + studio injection`);

  // 2. Get the PRE-AUDIT catalog (Build 116 state, before my apply script ran)
  const preAuditCatalog = execSync(`git show ${PRE_AUDIT_REF}:src/data/productCatalog.js`, {
    cwd: ROOT,
    maxBuffer: 50 * 1024 * 1024,
  }).toString();
  console.log(`Pre-audit catalog loaded: ${preAuditCatalog.length} bytes`);

  // 3. Sanity-verify pre-audit catalog parses (catch any git weirdness early)
  const tmpPreAudit = path.join(os.tmpdir(), `pre-audit-${Date.now()}.mjs`);
  await fs.writeFile(tmpPreAudit, preAuditCatalog);
  const { PRODUCT_CATALOG: preProducts } = await import(tmpPreAudit);
  await fs.unlink(tmpPreAudit).catch(() => {});
  console.log(`Pre-audit catalog parses cleanly: ${preProducts.length} products`);

  // 4. Build a quick-lookup map of pre-audit imageUrls (sanity ref for revert)
  const preMap = new Map(preProducts.map(p => [p.id, { imageUrl: p.imageUrl, imagesLen: (p.images || []).length }]));

  // 5. Apply the targeted edits to the pre-audit catalog source.
  //    For each eligible audit product:
  //      a) Find its product block by id
  //      b) Inject `panelImageUrl: '<chosenImage>',` after imageUrl
  //      c) If chosenImage isn't already in images[], insert it at index 1
  let catalog       = preAuditCatalog;
  let injectedCount = 0;
  let skippedCount  = 0;
  let notFoundCount = 0;
  const log = [];

  for (const r of eligible) {
    const idStr      = r.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockRegex = new RegExp(
      `(    id: '${idStr}',[\\s\\S]*?\\n    imageUrl: ')([^']+)(',\\n    images: \\[\\n)([\\s\\S]*?)(\\n    \\],)`,
    );
    const m = catalog.match(blockRegex);
    if (!m) {
      log.push(`- ❌ \`${r.id}\` (${r.category}): block not found in pre-audit catalog`);
      notFoundCount++;
      continue;
    }
    const [whole, before, currentImageUrl, mid, imagesArrayBody, end] = m;

    // If chosenImage is already the current imageUrl (modulo size suffix),
    // there's nothing to inject for this product — its pre-audit state
    // already had the studio shot as the hero. Skip cleanly.
    if (urlsEqualIgnoringSize(currentImageUrl, r.chosenImage)) {
      log.push(`- ⏭ \`${r.id}\` (${r.category}): pre-audit hero == audit pick, no injection needed`);
      skippedCount++;
      continue;
    }

    // Parse images[] body — array of URL string lines
    const imageLines = imagesArrayBody.split('\n')
      .map(l => l.match(/^\s*'([^']+)',?\s*$/))
      .filter(Boolean)
      .map(x => x[1]);

    // Determine new images[] order:
    //   [0] = lifestyle hero (currentImageUrl, unchanged)
    //   [1] = chosen studio shot (insert here unless already in array)
    //   [2+] = remaining originals (preserve order, drop any duplicate of chosen)
    const studioAlreadyPresent = imageLines.some(u => urlsEqualIgnoringSize(u, r.chosenImage));
    let newImages;
    if (studioAlreadyPresent) {
      // Studio shot already in the array; just move it to position [1]
      const without = imageLines.filter(u => !urlsEqualIgnoringSize(u, r.chosenImage));
      newImages = [without[0], r.chosenImage, ...without.slice(1)];
    } else {
      // Studio shot NOT in array — insert at position [1]
      newImages = [imageLines[0], r.chosenImage, ...imageLines.slice(1)];
    }

    // Format new images[] body — match catalog's existing 6-space indent
    const newImagesBody = newImages.map(u => `      '${u}',`).join('\n');

    // Build replacement block:
    //   imageUrl: 'lifestyle' (unchanged)
    //   panelImageUrl: 'studio' (new line)
    //   images: [lifestyle, studio, ...rest]
    const replacement =
      before +
      currentImageUrl +
      `',\n    panelImageUrl: '${r.chosenImage}',\n    images: [\n` +
      newImagesBody +
      end;

    catalog = catalog.replace(whole, replacement);
    log.push(
      `- ✓ \`${r.id}\` (${r.category}, score ${r.chosenScore}): ` +
      `imageUrl=${currentImageUrl.split('/').pop()?.slice(0, 28)} | ` +
      `panelImageUrl=${r.chosenImage.split('/').pop()?.slice(0, 28)}`
    );
    injectedCount++;
  }

  // 6. Sanity-check the merged result before writing
  const tmpFinal = path.join(os.tmpdir(), `final-cat-${Date.now()}.mjs`);
  await fs.writeFile(tmpFinal, catalog);
  let finalProducts;
  try {
    const m = await import(tmpFinal);
    finalProducts = m.PRODUCT_CATALOG;
  } catch (e) {
    await fs.unlink(tmpFinal).catch(() => {});
    console.error(`FATAL: merged catalog failed to parse: ${e.message}`);
    process.exit(2);
  }
  await fs.unlink(tmpFinal).catch(() => {});

  if (finalProducts.length !== preProducts.length) {
    console.error(`FATAL: product count drift ${preProducts.length} → ${finalProducts.length}`);
    process.exit(3);
  }

  // Verify a few sample products show the expected shape
  let sampleVerifyFail = 0;
  for (const r of eligible.slice(0, 5)) {
    const p = finalProducts.find(x => x.id === r.id);
    if (!p) { console.error(`Sample fail: ${r.id} not in merged catalog`); sampleVerifyFail++; continue; }
    if (urlsEqualIgnoringSize(r.currentImageUrl, r.chosenImage)) continue;  // skip ones that no-op'd
    if (p.panelImageUrl !== r.chosenImage) { console.error(`Sample fail: ${r.id} panelImageUrl mismatch`); sampleVerifyFail++; }
    if (p.imageUrl === r.chosenImage)      { console.error(`Sample fail: ${r.id} imageUrl is studio not lifestyle`); sampleVerifyFail++; }
    if (p.images[0] === r.chosenImage)     { console.error(`Sample fail: ${r.id} images[0] is studio not lifestyle`); sampleVerifyFail++; }
  }
  if (sampleVerifyFail > 0) {
    console.error(`FATAL: ${sampleVerifyFail} sample verification failures — refusing to write`);
    process.exit(4);
  }

  // 7. Write summary log
  const summary = [
    `# Build 121 — imageUrl Revert Apply Log`,
    ``,
    `**Generated:** ${new Date().toISOString()}`,
    `**Mode:** ${DRY ? 'DRY RUN (no file write)' : 'APPLIED'}`,
    `**Pre-audit base:** ${PRE_AUDIT_REF}`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Count |`,
    `|---|---|`,
    `| Eligible audit picks | ${eligible.length} |`,
    `| panelImageUrl injected (lifestyle preserved) | ${injectedCount} |`,
    `| Skipped (pre-audit hero already == audit pick) | ${skippedCount} |`,
    `| Block not found / drift | ${notFoundCount} |`,
    `| Final catalog parses | ${finalProducts.length} products ✓ |`,
    ``,
    `## Per-product log`,
    ``,
    ...log,
    ``,
  ].join('\n');
  await fs.writeFile(LOG_PATH, summary);

  if (DRY) {
    console.log(`DRY RUN — no catalog write. ${injectedCount} would inject, ${skippedCount} no-op, ${notFoundCount} drift.`);
    console.log(`Log: ${path.relative(ROOT, LOG_PATH)}`);
    return;
  }

  if (notFoundCount > 0) {
    console.error(`ABORTING WRITE: ${notFoundCount} block-shape drifts. Investigate before retrying.`);
    process.exit(5);
  }

  await fs.writeFile(CATALOG_PATH, catalog);
  console.log(`Catalog written: ${preAuditCatalog.length} → ${catalog.length} bytes`);
  console.log(`Injected: ${injectedCount} | Skipped: ${skippedCount}`);
  console.log(`Log: ${path.relative(ROOT, LOG_PATH)}`);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
