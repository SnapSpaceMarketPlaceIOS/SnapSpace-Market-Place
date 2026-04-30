#!/usr/bin/env node
// scripts/apply-image-framing-audit.mjs
//
// Build 126 — apply framing-audit.json to swap zoomed-in `imageUrl` values
// for full-product alternatives from each product's `images[]` array.
//
// Conservative apply rules:
//   - Only swap if `bestReplacement` is set AND the new score is at least
//     20 points higher than the current hero score (avoid lateral swaps).
//   - Re-write ONLY the imageUrl field. Do not touch images[], variants,
//     panelImageUrl, or any other field.
//   - Dry-run by default; --apply to write. Backup at .bak-build126.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const APPLY = process.argv.includes('--apply');
const AUDIT_PATH = path.join(ROOT, 'scripts/framing-audit.json');
const CATALOG_PATH = path.join(ROOT, 'src/data/productCatalog.js');

const MIN_SCORE_DELTA = 20;     // require new score >= old + 20

function findProductBlock(source, id) {
  const idRe = new RegExp(`\\bid:\\s*['"\`]${id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}['"\`]`);
  const idMatch = idRe.exec(source);
  if (!idMatch) return null;

  let depth = 0;
  let start = -1;
  for (let i = idMatch.index; i >= 0; i--) {
    const c = source[i];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) { start = i; break; }
      depth--;
    }
  }
  if (start === -1) return null;

  depth = 0;
  let end = -1;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;

  return { start, end, body: source.slice(start, end + 1) };
}

// Replace top-level `imageUrl:` value within a product block. Same depth-1
// matching as apply-catalog-metadata-audit.mjs so nested imageUrl fields
// (in variants[]) aren't affected.
function replaceImageUrlInBlock(body, newUrl) {
  let depth = 0;
  let i = 0;
  if (body[0] === '{') { i = 1; depth = 1; }
  while (i < body.length) {
    const c = body[i];
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (depth === 1) {
      const slice = body.slice(i, i + 16);
      if (/^imageUrl\s*:/.test(slice)) {
        const m = slice.match(/^imageUrl\s*:/);
        let valStart = i + m[0].length;
        while (valStart < body.length && /\s/.test(body[valStart])) valStart++;
        const firstChar = body[valStart];
        if (firstChar !== "'" && firstChar !== '"' && firstChar !== '`') return null;
        let valEnd = valStart;
        for (let j = valStart + 1; j < body.length; j++) {
          if (body[j] === firstChar && body[j - 1] !== '\\') { valEnd = j + 1; break; }
        }
        if (valEnd <= valStart) return null;
        return body.slice(0, valStart) + `'${newUrl.replace(/'/g, "\\'")}'` + body.slice(valEnd);
      }
    }
    i++;
  }
  return null;
}

(async () => {
  const auditRaw = await fs.readFile(AUDIT_PATH, 'utf8').catch(() => null);
  if (!auditRaw) {
    console.error(`ERROR: ${AUDIT_PATH} not found`);
    process.exit(1);
  }
  const audit = JSON.parse(auditRaw);
  const candidates = audit.results.filter(r =>
    !r.error && r.needsReplacement && r.bestReplacement &&
    typeof r.heroScore === 'number' && typeof r.bestReplacementScore === 'number' &&
    (r.bestReplacementScore - r.heroScore) >= MIN_SCORE_DELTA,
  );

  console.log(`Audit: ${audit.results.length} products | ${candidates.length} qualify for swap (score delta >= ${MIN_SCORE_DELTA})`);
  console.log(APPLY ? '🔧 APPLY mode' : '👀 DRY RUN');
  console.log('');

  let catalog = await fs.readFile(CATALOG_PATH, 'utf8');
  let appliedCount = 0;
  let skippedCount = 0;

  for (const r of candidates) {
    const block = findProductBlock(catalog, r.id);
    if (!block) {
      console.warn(`  SKIP ${r.id}: block not found`);
      skippedCount++;
      continue;
    }
    const newBody = replaceImageUrlInBlock(block.body, r.bestReplacement);
    if (!newBody) {
      console.warn(`  SKIP ${r.id}: imageUrl field not found`);
      skippedCount++;
      continue;
    }
    catalog = catalog.slice(0, block.start) + newBody + catalog.slice(block.end + 1);
    appliedCount++;
    if (appliedCount <= 30) {
      console.log(`  [${r.id}] score ${r.heroScore} → ${r.bestReplacementScore}`);
    }
  }

  console.log('');
  console.log(`Applied:  ${appliedCount}`);
  console.log(`Skipped:  ${skippedCount}`);

  if (APPLY) {
    const bakPath = CATALOG_PATH + '.bak-build126';
    await fs.copyFile(CATALOG_PATH, bakPath);
    await fs.writeFile(CATALOG_PATH, catalog);
    console.log('');
    console.log(`✅ Wrote ${path.relative(ROOT, CATALOG_PATH)}`);
    console.log(`   Backup: ${path.relative(ROOT, bakPath)}`);
  } else {
    console.log('');
    console.log('(Dry run — re-run with --apply to commit.)');
  }
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
