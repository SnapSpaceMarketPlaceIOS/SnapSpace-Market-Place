#!/usr/bin/env node
// scripts/apply-photos-unified.mjs
//
// Build 129 — apply unified-photo-audit.json corrections.
//
// Updates BOTH imageUrl AND panelImageUrl per the audit's picks:
//   - imageUrl  ← pickedImageUrl  (highest lifestyle score, fallback to studio)
//   - panelImageUrl ← pickedPanelUrl (highest studio score, or null if none)
//
// Dry-run by default. --apply to write. Backup at .bak-build129.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const APPLY = process.argv.includes('--apply');
const AUDIT_PATH = path.join(ROOT, 'scripts/unified-photo-audit.json');
const CATALOG_PATH = path.join(ROOT, 'src/data/productCatalog.js');

function findProductBlock(source, id) {
  const idRe = new RegExp(`\\bid:\\s*['"\`]${id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}['"\`]`);
  const idMatch = idRe.exec(source);
  if (!idMatch) return null;
  let depth = 0; let start = -1;
  for (let i = idMatch.index; i >= 0; i--) {
    if (source[i] === '}') depth++;
    else if (source[i] === '{') {
      if (depth === 0) { start = i; break; }
      depth--;
    }
  }
  if (start === -1) return null;
  depth = 0; let end = -1;
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

// Replace OR insert OR delete a top-level field at depth 1.
//   newValue: string → set to that string
//   newValue: null   → set to literal null
//   newValue: undefined → delete the field entirely (currently unused but kept for symmetry)
function setField(body, fieldName, newValue) {
  let depth = 0; let i = 0;
  if (body[0] === '{') { i = 1; depth = 1; }
  while (i < body.length) {
    const c = body[i];
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (depth === 1) {
      const slice = body.slice(i, i + fieldName.length + 16);
      const re = new RegExp(`^${fieldName}\\s*:`);
      const m = slice.match(re);
      if (m) {
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
  if (!auditRaw) { console.error(`ERROR: ${AUDIT_PATH} not found`); process.exit(1); }
  const audit = JSON.parse(auditRaw);

  const candidates = audit.results.filter(r => !r.error || (r.imageUrlChanged || r.panelImageUrlChanged));
  // We allow products with errors to still apply IF they have a valid pick.
  // A scoreError on one of their URLs doesn't invalidate picks made from other URLs.

  console.log(`Audit: ${audit.results.length} products`);
  console.log(APPLY ? '🔧 APPLY mode' : '👀 DRY RUN');
  console.log('');

  let catalog = await fs.readFile(CATALOG_PATH, 'utf8');
  let imgApplied = 0, panelApplied = 0, panelNulled = 0, skipped = 0;

  for (const r of candidates) {
    if (!r.imageUrlChanged && !r.panelImageUrlChanged) continue;
    const block = findProductBlock(catalog, r.id);
    if (!block) { skipped++; continue; }
    let body = block.body;
    let changes = [];

    // imageUrl swap
    if (r.imageUrlChanged && r.pickedImageUrl) {
      const replaced = setField(body, 'imageUrl', r.pickedImageUrl);
      if (replaced) {
        body = replaced;
        imgApplied++;
        changes.push(`imageUrl: ${r.imageUrlReason}`);
      }
    }

    // panelImageUrl swap (or null-out)
    if (r.panelImageUrlChanged) {
      const replaced = setField(body, 'panelImageUrl', r.pickedPanelUrl); // null or string
      if (replaced) {
        body = replaced;
        if (r.pickedPanelUrl === null) {
          panelNulled++;
          changes.push(`panelImageUrl: null (${r.panelReason})`);
        } else {
          panelApplied++;
          changes.push(`panelImageUrl: ${r.panelReason}`);
        }
      }
      // If panelImageUrl field doesn't exist in this product's block at all
      // (245+ legacy products), setField returns null — we skip silently.
      // Future enhancement: insert a panelImageUrl field for these products.
    }

    if (changes.length > 0) {
      catalog = catalog.slice(0, block.start) + body + catalog.slice(block.end + 1);
      if (imgApplied + panelApplied + panelNulled <= 30) {
        console.log(`[${r.id}] ${changes.join(' | ')}`);
      }
    }
  }

  console.log('');
  console.log(`imageUrl applied:        ${imgApplied}`);
  console.log(`panelImageUrl swapped:   ${panelApplied}`);
  console.log(`panelImageUrl nulled:    ${panelNulled}`);
  console.log(`Skipped (no field):      ${skipped}`);

  if (APPLY) {
    const bakPath = CATALOG_PATH + '.bak-build129';
    await fs.copyFile(CATALOG_PATH, bakPath);
    await fs.writeFile(CATALOG_PATH, catalog);
    console.log('');
    console.log(`✅ Wrote ${path.relative(ROOT, CATALOG_PATH)}`);
    console.log(`   Backup: ${path.relative(ROOT, bakPath)}`);
  } else {
    console.log('');
    console.log('(Dry run — re-run with --apply to commit.)');
  }
})().catch(err => { console.error('FATAL:', err); process.exit(1); });
