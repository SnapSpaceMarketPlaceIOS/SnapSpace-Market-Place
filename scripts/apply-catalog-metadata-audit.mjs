#!/usr/bin/env node
// scripts/apply-catalog-metadata-audit.mjs
//
// Build 125 — apply metadata-audit.json corrections to productCatalog.js.
//
// Reads `scripts/metadata-audit.json`, walks each product entry, and patches:
//   - styles[]:    apply should_remove + should_add (deduped union)
//   - roomType[]:  apply should_remove + should_add
//   - materials[]: apply should_remove + should_add
//   - category:    apply suggested category if present
//
// Strategy: the catalog is large + hand-formatted, so we DON'T re-serialize
// it as JSON (would lose comments + formatting). Instead, anchor each
// product's edit window with `id: '<asin>'` and run a per-block regex that
// locates and rewrites the four target fields. Same approach as Build 117's
// apply-panel-audit.mjs.
//
// Safety:
//   - Dry-run by default. Pass --apply to actually write.
//   - Backs up the original to .bak before writing.
//   - Logs every change before applying.
//
// Usage:
//   node scripts/apply-catalog-metadata-audit.mjs            # dry run
//   node scripts/apply-catalog-metadata-audit.mjs --apply    # apply changes

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const APPLY = process.argv.includes('--apply');
const AUDIT_PATH = path.join(ROOT, 'scripts/metadata-audit.json');
const CATALOG_PATH = path.join(ROOT, 'src/data/productCatalog.js');

// ── Helpers ──────────────────────────────────────────────────────────────────

// Apply add/remove to an array, return new (deduped, ordered).
function applyDelta(current, removeArr, addArr) {
  const removeSet = new Set(removeArr || []);
  const filtered = (current || []).filter(v => !removeSet.has(v));
  const seen = new Set(filtered);
  for (const v of addArr || []) {
    if (!seen.has(v)) {
      filtered.push(v);
      seen.add(v);
    }
  }
  return filtered;
}

// Format a string array as a JS literal: ['a', 'b', 'c']
function formatArrayLiteral(arr) {
  return `[${arr.map(v => `'${String(v).replace(/'/g, "\\'")}'`).join(', ')}]`;
}

// Find the slice of source that defines a single product object identified by `id: '<id>'`.
// Returns { start, end, body } or null. Greedy from the opening brace BEFORE the id
// line to the matching closing brace. Uses brace-depth counting so nested objects
// (variants[], details{}, etc.) don't trip us up.
function findProductBlock(source, id) {
  // Match  id: 'B0FGD5615L', or  id: "B0FGD5615L",
  const idRe = new RegExp(`\\bid:\\s*['"\`]${id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}['"\`]`);
  const idMatch = idRe.exec(source);
  if (!idMatch) return null;

  // Walk backward from id position to find the opening `{` that starts this object.
  // Count braces on the way back to land on the matching opener for the immediate
  // enclosing object (depth resets to 0 there).
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

  // Walk forward from start to find matching closing brace.
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

// Replace a top-level `field:` assignment INSIDE a product block.
// Only matches the field at depth 1 (immediately inside the block) — won't
// touch e.g. a `category:` nested in `details: {}`. Returns new body or null.
function replaceFieldInBlock(body, field, newLiteral) {
  // The body always opens with `{`. Walk forward, tracking depth, and find
  // the FIRST occurrence of `<field>:` at depth 1.
  let depth = 0;
  let i = 0;
  // Skip the opening brace
  if (body[0] === '{') { i = 1; depth = 1; }
  while (i < body.length) {
    const c = body[i];
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (depth === 1) {
      // Look for `<field>:` starting at this position
      const slice = body.slice(i, i + field.length + 16);
      const re = new RegExp(`^${field}\\s*:`);
      const m = slice.match(re);
      if (m) {
        // Find the value's start (skip whitespace after colon)
        let valStart = i + m[0].length;
        while (valStart < body.length && /\s/.test(body[valStart])) valStart++;

        // Find the value's end. For arrays: matching `]`. For strings: matching quote.
        // For numbers/identifiers: until `,` or newline-then-non-whitespace.
        const firstChar = body[valStart];
        let valEnd = valStart;
        if (firstChar === '[') {
          let bd = 0;
          for (let j = valStart; j < body.length; j++) {
            if (body[j] === '[') bd++;
            else if (body[j] === ']') {
              bd--;
              if (bd === 0) { valEnd = j + 1; break; }
            }
          }
        } else if (firstChar === '{') {
          let bd = 0;
          for (let j = valStart; j < body.length; j++) {
            if (body[j] === '{') bd++;
            else if (body[j] === '}') {
              bd--;
              if (bd === 0) { valEnd = j + 1; break; }
            }
          }
        } else if (firstChar === "'" || firstChar === '"' || firstChar === '`') {
          for (let j = valStart + 1; j < body.length; j++) {
            if (body[j] === firstChar && body[j - 1] !== '\\') { valEnd = j + 1; break; }
          }
        } else {
          // bareword/number — terminate at comma or close-brace at depth 0
          for (let j = valStart; j < body.length; j++) {
            if (body[j] === ',' || body[j] === '}' || body[j] === '\n') { valEnd = j; break; }
          }
        }
        if (valEnd <= valStart) return null;
        return body.slice(0, valStart) + newLiteral + body.slice(valEnd);
      }
    }
    i++;
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const auditRaw = await fs.readFile(AUDIT_PATH, 'utf8').catch(() => null);
  if (!auditRaw) {
    console.error(`ERROR: ${AUDIT_PATH} not found. Run audit first:`);
    console.error(`  node scripts/audit-catalog-metadata.mjs --full`);
    process.exit(1);
  }
  const audit = JSON.parse(auditRaw);
  const results = audit.results || [];
  const withChanges = results.filter(r => !r.error && r.hasChanges);

  console.log(`Audit: ${results.length} products | ${withChanges.length} with changes`);
  console.log(APPLY ? '🔧 APPLY mode (will write)' : '👀 DRY RUN (no writes)');
  console.log('');

  let catalog = await fs.readFile(CATALOG_PATH, 'utf8');
  let appliedCount = 0;
  let skippedCount = 0;
  const styleAddCounts = {};
  const styleRemCounts = {};
  const matAddCounts = {};
  const matRemCounts = {};
  const catChanges = [];

  for (const r of withChanges) {
    const block = findProductBlock(catalog, r.id);
    if (!block) {
      console.warn(`  SKIP ${r.id}: block not found`);
      skippedCount++;
      continue;
    }

    let newBody = block.body;
    const changes = [];

    // styles
    if (r.audit.styles.should_add.length || r.audit.styles.should_remove.length) {
      const next = applyDelta(r.currentStyles, r.audit.styles.should_remove, r.audit.styles.should_add);
      const replaced = replaceFieldInBlock(newBody, 'styles', formatArrayLiteral(next));
      if (replaced) {
        newBody = replaced;
        changes.push(`styles: ${formatArrayLiteral(r.currentStyles)} → ${formatArrayLiteral(next)}`);
        r.audit.styles.should_add.forEach(s => { styleAddCounts[s] = (styleAddCounts[s] || 0) + 1; });
        r.audit.styles.should_remove.forEach(s => { styleRemCounts[s] = (styleRemCounts[s] || 0) + 1; });
      } else {
        console.warn(`  ${r.id}: styles field not found in block`);
      }
    }

    // roomType
    if (r.audit.roomType.should_add.length || r.audit.roomType.should_remove.length) {
      const next = applyDelta(r.currentRoomType, r.audit.roomType.should_remove, r.audit.roomType.should_add);
      const replaced = replaceFieldInBlock(newBody, 'roomType', formatArrayLiteral(next));
      if (replaced) {
        newBody = replaced;
        changes.push(`roomType: → ${formatArrayLiteral(next)}`);
      }
    }

    // materials
    if (r.audit.materials.should_add.length || r.audit.materials.should_remove.length) {
      const next = applyDelta(r.currentMaterials, r.audit.materials.should_remove, r.audit.materials.should_add);
      const replaced = replaceFieldInBlock(newBody, 'materials', formatArrayLiteral(next));
      if (replaced) {
        newBody = replaced;
        changes.push(`materials: → ${formatArrayLiteral(next)}`);
        r.audit.materials.should_add.forEach(m => { matAddCounts[m] = (matAddCounts[m] || 0) + 1; });
        r.audit.materials.should_remove.forEach(m => { matRemCounts[m] = (matRemCounts[m] || 0) + 1; });
      }
    }

    // category — only if suggested AND distinct from current
    if (r.audit.category.suggested && r.audit.category.suggested !== r.currentCategory) {
      const replaced = replaceFieldInBlock(newBody, 'category', `'${r.audit.category.suggested}'`);
      if (replaced) {
        newBody = replaced;
        changes.push(`category: '${r.currentCategory}' → '${r.audit.category.suggested}'`);
        catChanges.push(`${r.id}: ${r.currentCategory} → ${r.audit.category.suggested}`);
      }
    }

    if (changes.length === 0) {
      skippedCount++;
      continue;
    }

    // Write the new block back into catalog
    catalog = catalog.slice(0, block.start) + newBody + catalog.slice(block.end + 1);
    appliedCount++;
    if (appliedCount <= 20) {
      console.log(`  [${r.id}] ${(r.name || '').slice(0, 40)}`);
      changes.forEach(c => console.log(`    ${c}`));
    }
  }

  console.log('');
  console.log(`Applied:  ${appliedCount} products`);
  console.log(`Skipped:  ${skippedCount}`);
  console.log('');
  console.log('Style additions:');
  Object.entries(styleAddCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([s,n]) => console.log(`  +${s}: ${n}`));
  if (Object.keys(styleRemCounts).length > 0) {
    console.log('Style removals:');
    Object.entries(styleRemCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([s,n]) => console.log(`  -${s}: ${n}`));
  }
  if (Object.keys(matAddCounts).length > 0) {
    console.log('Material additions:');
    Object.entries(matAddCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([m,n]) => console.log(`  +${m}: ${n}`));
  }
  if (catChanges.length > 0) {
    console.log(`Category changes (${catChanges.length}):`);
    catChanges.slice(0, 20).forEach(c => console.log(`  ${c}`));
  }

  if (APPLY) {
    const bakPath = CATALOG_PATH + '.bak-build125';
    await fs.copyFile(CATALOG_PATH, bakPath);
    await fs.writeFile(CATALOG_PATH, catalog);
    console.log('');
    console.log(`✅ Wrote ${CATALOG_PATH}`);
    console.log(`   Backup: ${path.relative(ROOT, bakPath)}`);
  } else {
    console.log('');
    console.log('(Dry run — no changes written. Re-run with --apply to commit.)');
  }
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
