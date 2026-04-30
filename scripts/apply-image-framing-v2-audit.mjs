#!/usr/bin/env node
// scripts/apply-image-framing-v2-audit.mjs
//
// Build 128 — apply framing-v2-audit.json corrections.
//
// Replaces imageUrl with bestReplacement when set. No score-delta guard
// (already enforced in the audit script: only sets bestReplacement when
// alternative beats the current hero).

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const APPLY = process.argv.includes('--apply');
const AUDIT_PATH = path.join(ROOT, 'scripts/framing-v2-audit.json');
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
  const candidates = audit.results.filter(r => !r.error && r.needsReplacement && r.bestReplacement);

  console.log(`Audit: ${audit.results.length} products | ${candidates.length} qualify for swap`);
  console.log(APPLY ? '🔧 APPLY mode' : '👀 DRY RUN');
  console.log('');

  let catalog = await fs.readFile(CATALOG_PATH, 'utf8');
  let applied = 0;
  let skipped = 0;

  for (const r of candidates) {
    const block = findProductBlock(catalog, r.id);
    if (!block) { skipped++; continue; }
    const newBody = replaceImageUrlInBlock(block.body, r.bestReplacement);
    if (!newBody) { skipped++; continue; }
    catalog = catalog.slice(0, block.start) + newBody + catalog.slice(block.end + 1);
    applied++;
    if (applied <= 30) {
      console.log(`  [${r.id}] imageUrl: ${r.heroScore} → ${r.bestReplacementScore}`);
    }
  }

  console.log('');
  console.log(`Applied: ${applied}`);
  console.log(`Skipped: ${skipped}`);

  if (APPLY) {
    const bakPath = CATALOG_PATH + '.bak-build128-framing';
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
