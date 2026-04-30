#!/usr/bin/env node
// scripts/apply-panel-strict-audit.mjs
//
// Build 128 — apply panel-strict-audit.json corrections to productCatalog.js.
//
// For each product flagged in the audit:
//   - bestReplacement set     → swap panelImageUrl to that URL
//   - setNull true            → set panelImageUrl to null (composite fallback)
//   - noChangeNeeded          → leave panelImageUrl alone
//   - panelOk                 → no action
//
// Setting panelImageUrl to null is intentional — it tells pickPanelSource
// in createProductPanel.js to fall back to imageUrl. Combined with the
// framing-v2 audit (which fixes imageUrl framing), the fallback is a
// reasonable second-best when no clean studio shot exists in images[].

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const APPLY = process.argv.includes('--apply');
const AUDIT_PATH = path.join(ROOT, 'scripts/panel-strict-audit.json');
const CATALOG_PATH = path.join(ROOT, 'src/data/productCatalog.js');

function findProductBlock(source, id) {
  const idRe = new RegExp(`\\bid:\\s*['"\`]${id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}['"\`]`);
  const idMatch = idRe.exec(source);
  if (!idMatch) return null;
  let depth = 0;
  let start = -1;
  for (let i = idMatch.index; i >= 0; i--) {
    if (source[i] === '}') depth++;
    else if (source[i] === '{') {
      if (depth === 0) { start = i; break; }
      depth--;
    }
  }
  if (start === -1) return null;
  depth = 0;
  let end = -1;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;
  return { start, end, body: source.slice(start, end + 1) };
}

// Replace OR delete the top-level `panelImageUrl:` field in a product block.
// `newValue` of null deletes the field; a string sets it to that value.
function setPanelImageUrl(body, newValue) {
  let depth = 0;
  let i = 0;
  if (body[0] === '{') { i = 1; depth = 1; }
  while (i < body.length) {
    const c = body[i];
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (depth === 1) {
      const slice = body.slice(i, i + 20);
      if (/^panelImageUrl\s*:/.test(slice)) {
        const m = slice.match(/^panelImageUrl\s*:/);
        let valStart = i + m[0].length;
        while (valStart < body.length && /\s/.test(body[valStart])) valStart++;
        const firstChar = body[valStart];
        let valEnd = valStart;
        if (firstChar === "'" || firstChar === '"' || firstChar === '`') {
          for (let j = valStart + 1; j < body.length; j++) {
            if (body[j] === firstChar && body[j - 1] !== '\\') { valEnd = j + 1; break; }
          }
        } else if (/^null\b/.test(body.slice(valStart))) {
          valEnd = valStart + 4;
        } else {
          for (let j = valStart; j < body.length; j++) {
            if (body[j] === ',' || body[j] === '}' || body[j] === '\n') { valEnd = j; break; }
          }
        }
        if (valEnd <= valStart) return null;
        const newLiteral = newValue === null
          ? 'null'
          : `'${newValue.replace(/'/g, "\\'")}'`;
        return body.slice(0, valStart) + newLiteral + body.slice(valEnd);
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
  const replacements = audit.results.filter(r => !r.error && r.needsReplacement && r.bestReplacement);
  const nullouts = audit.results.filter(r => !r.error && r.needsReplacement && r.setNull && !r.bestReplacement);

  console.log(`Audit: ${audit.results.length} products`);
  console.log(`  Replacements:  ${replacements.length}`);
  console.log(`  Set to null:   ${nullouts.length}`);
  console.log(APPLY ? '🔧 APPLY mode' : '👀 DRY RUN');
  console.log('');

  let catalog = await fs.readFile(CATALOG_PATH, 'utf8');
  let appliedReplacements = 0;
  let appliedNulls = 0;
  let skipped = 0;

  for (const r of replacements) {
    const block = findProductBlock(catalog, r.id);
    if (!block) { skipped++; continue; }
    const newBody = setPanelImageUrl(block.body, r.bestReplacement);
    if (!newBody) { skipped++; continue; }
    catalog = catalog.slice(0, block.start) + newBody + catalog.slice(block.end + 1);
    appliedReplacements++;
    if (appliedReplacements <= 20) {
      console.log(`  [${r.id}] panelImageUrl: ${r.currentScore} → ${r.bestReplacementScore}`);
    }
  }
  for (const r of nullouts) {
    const block = findProductBlock(catalog, r.id);
    if (!block) { skipped++; continue; }
    const newBody = setPanelImageUrl(block.body, null);
    if (!newBody) { skipped++; continue; }
    catalog = catalog.slice(0, block.start) + newBody + catalog.slice(block.end + 1);
    appliedNulls++;
    if (appliedNulls <= 10) {
      console.log(`  [${r.id}] panelImageUrl → null (score ${r.currentScore})`);
    }
  }

  console.log('');
  console.log(`Replacements applied: ${appliedReplacements}`);
  console.log(`Set to null:          ${appliedNulls}`);
  console.log(`Skipped:              ${skipped}`);

  if (APPLY) {
    const bakPath = CATALOG_PATH + '.bak-build128-panel';
    await fs.copyFile(CATALOG_PATH, bakPath);
    await fs.writeFile(CATALOG_PATH, catalog);
    console.log('');
    console.log(`✅ Wrote ${path.relative(ROOT, CATALOG_PATH)}`);
    console.log(`   Backup: ${path.relative(ROOT, bakPath)}`);
  } else {
    console.log('');
    console.log('(Dry run — re-run with --apply)');
  }
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
