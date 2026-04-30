#!/usr/bin/env node
// scripts/audit-catalog-metadata.mjs
//
// Build 125 — Catalog Metadata Audit
//
// One-shot script: verify each product's category / styles / roomType /
// materials tags against what's actually visible in its hero photo (imageUrl).
// Output structured corrections so the matcher's input is photo-truth, not
// upstream descriptor-truth.
//
// Why: the productMatcher scoring (40% style, 30% room, 20% material, 10%
// diversity) trusts the catalog's tags. A product tagged "mid-century" that
// actually looks contemporary pollutes every "mid-century" prompt's strip.
// Build 117 audited image quality; Build 125 audits tag truth.
//
// Conservative by design:
//   - should_remove fires ONLY when the tag is clearly wrong
//   - should_add fires when a missing tag is clearly correct (e.g. a product
//     visually contemporary that lacks the contemporary tag)
//   - Notes column captures any observation that didn't fit in the structured
//     output (e.g. "image is a dimension diagram, not a product photo")
//
// Usage:
//   EXPO_PUBLIC_ANTHROPIC_API_KEY=... node scripts/audit-catalog-metadata.mjs --sample 10
//   EXPO_PUBLIC_ANTHROPIC_API_KEY=... node scripts/audit-catalog-metadata.mjs --full
//
// Outputs:
//   scripts/metadata-audit{,-sample}.json   structured per-product results
//   scripts/metadata-audit{,-sample}.md     human-readable summary table

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

// ── Config ───────────────────────────────────────────────────────────────────
const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) {
  console.error('ERROR: EXPO_PUBLIC_ANTHROPIC_API_KEY not set in env');
  process.exit(1);
}

const MODEL       = 'claude-haiku-4-5-20251001';
const MAX_TOKENS  = 400;        // structured JSON output, room for notes
const CONCURRENCY = 6;          // throttled below Build 117's 8 to avoid 429 spikes
const RETRY_MAX   = 3;          // per-product retry on transient errors / 429
const RETRY_BACKOFF_MS = 2000;

// ── Approved taxonomies (mirror src/data/styleMap.js + productCatalog.js) ───
// Anything outside these lists is rejected by the matcher, so the auditor
// must ONLY suggest values from these vocabularies.
const VALID_CATEGORIES = [
  'sofa', 'sectional', 'accent-chair', 'lounge-chair', 'recliner',
  'coffee-table', 'side-table', 'console-table',
  'dining-table', 'dining-chair', 'bar-stool',
  'bed', 'nightstand', 'dresser', 'wardrobe',
  'desk', 'desk-chair', 'office-chair', 'bookshelf', 'shelving',
  'floor-lamp', 'table-lamp', 'pendant-light', 'chandelier', 'wall-light',
  'rug', 'throw-pillow', 'throw-blanket', 'curtains',
  'mirror', 'wall-art', 'wall-shelf', 'planter', 'vase',
  'tv-stand', 'media-console', 'storage', 'bench', 'ottoman', 'pouf',
];
const VALID_STYLES = [
  'minimalist', 'japandi', 'rustic', 'industrial', 'coastal',
  'art-deco', 'mid-century', 'bohemian', 'scandinavian', 'scandi',
  'dark-luxe', 'biophilic', 'transitional', 'contemporary', 'modern',
  'farmhouse', 'mediterranean', 'wabi-sabi', 'maximalist',
  'french-country', 'glam', 'luxury',
];
const VALID_ROOM_TYPES = [
  'living-room', 'bedroom', 'kitchen', 'dining-room', 'office',
  'bathroom', 'outdoor', 'nursery', 'entryway',
];
const VALID_MATERIALS = [
  'wood', 'marble', 'velvet', 'linen', 'leather', 'rattan', 'concrete',
  'brass', 'copper', 'ceramic', 'glass', 'wicker', 'metal', 'fabric',
  'plastic', 'cotton', 'wool', 'jute', 'bamboo', 'stone',
];

const PROMPT = `You are an interior-design metadata auditor. You'll see a product photo and the product's current metadata tags. Verify each tag against what's actually visible in the photo, and output structured corrections.

CRITICAL RULES:
- Be CONSERVATIVE with "should_remove": only flag a tag for removal if you're highly confident it's wrong (e.g. product is tagged "leather" but is clearly fabric).
- Be LIBERAL with "should_add": if a product visually fits a tag from the approved list but isn't tagged, add it. Especially for "contemporary" and "modern" — these are catch-all aesthetics that often go untagged.
- Never invent tags. Only use values from the approved lists below.
- "category" can have at most one suggested value. Styles / roomType / materials are multi-valued.
- If the image looks like a dimension diagram, line drawing, packaging shot, or otherwise NOT a real product photo, set "imageQuality" to "diagram" and skip the tag analysis (return empty arrays). Otherwise "imageQuality" is "good".

APPROVED CATEGORIES: ${VALID_CATEGORIES.join(', ')}
APPROVED STYLES: ${VALID_STYLES.join(', ')}
APPROVED ROOM TYPES: ${VALID_ROOM_TYPES.join(', ')}
APPROVED MATERIALS: ${VALID_MATERIALS.join(', ')}

Return ONLY a valid JSON object on a single line — no markdown, no commentary. Schema:
{
  "imageQuality": "good" | "diagram",
  "category": { "verified": true|false, "suggested": null|"<approved>" },
  "styles":    { "should_remove": [...], "should_add": [...] },
  "roomType":  { "should_remove": [...], "should_add": [...] },
  "materials": { "should_remove": [...], "should_add": [...] },
  "notes": "<one short sentence or empty string>"
}`;

// ── Anthropic API call ───────────────────────────────────────────────────────
async function auditOnce(product) {
  const url = product.imageUrl;
  const userMessage = [
    `Product name: ${product.name || '(no name)'}`,
    `Current category: ${product.category || '(none)'}`,
    `Current styles: ${(product.styles || []).join(', ') || '(none)'}`,
    `Current roomType: ${(product.roomType || []).join(', ') || '(none)'}`,
    `Current materials: ${(product.materials || []).join(', ') || '(none)'}`,
    '',
    PROMPT,
  ].join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url } },
          { type: 'text',  text: userMessage },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text || '';
  // Extract first balanced JSON object — Haiku may wrap in code fences.
  const startIdx = text.indexOf('{');
  if (startIdx === -1) {
    throw new Error(`No JSON in response: ${text.slice(0, 120)}`);
  }
  // Find matching closing brace by counting depth
  let depth = 0;
  let endIdx = -1;
  for (let i = startIdx; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) { endIdx = i; break; }
    }
  }
  if (endIdx === -1) {
    throw new Error(`Unbalanced JSON in response: ${text.slice(0, 120)}`);
  }
  const jsonStr = text.slice(startIdx, endIdx + 1);
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Bad JSON: ${jsonStr.slice(0, 120)}`);
  }
  return parsed;
}

async function auditWithRetry(product) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    try {
      return await auditOnce(product);
    } catch (err) {
      lastErr = err;
      // Don't retry 4xx errors except 429 (rate limit)
      if (err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw err;
      }
      if (attempt < RETRY_MAX) {
        await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * attempt));
      }
    }
  }
  throw lastErr;
}

// ── Sanitization: strip suggestions outside the approved vocabulary ──────────
// Haiku occasionally hallucinates a synonym ("midcentury" instead of
// "mid-century"). We drop anything not in the approved list rather than
// risk writing a tag the matcher will silently ignore.
function sanitizeArray(arr, allowed) {
  if (!Array.isArray(arr)) return [];
  const set = new Set(allowed);
  return arr.filter(v => typeof v === 'string' && set.has(v));
}

function sanitizeAudit(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const out = {
    imageQuality: raw.imageQuality === 'diagram' ? 'diagram' : 'good',
    category: {
      verified: raw.category?.verified !== false,
      suggested: (raw.category?.suggested && VALID_CATEGORIES.includes(raw.category.suggested))
        ? raw.category.suggested
        : null,
    },
    styles: {
      should_remove: sanitizeArray(raw.styles?.should_remove, VALID_STYLES),
      should_add:    sanitizeArray(raw.styles?.should_add,    VALID_STYLES),
    },
    roomType: {
      should_remove: sanitizeArray(raw.roomType?.should_remove, VALID_ROOM_TYPES),
      should_add:    sanitizeArray(raw.roomType?.should_add,    VALID_ROOM_TYPES),
    },
    materials: {
      should_remove: sanitizeArray(raw.materials?.should_remove, VALID_MATERIALS),
      should_add:    sanitizeArray(raw.materials?.should_add,    VALID_MATERIALS),
    },
    notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 200) : '',
  };
  return out;
}

// ── Per-product audit ────────────────────────────────────────────────────────
async function auditProduct(p) {
  if (!p.imageUrl || !p.imageUrl.startsWith('http')) {
    return { id: p.id, name: p.name, error: 'no-imageUrl' };
  }

  let raw;
  try {
    raw = await auditWithRetry(p);
  } catch (err) {
    return {
      id: p.id,
      name: (p.name || '').slice(0, 80),
      error: `api-error: ${(err.message || '').slice(0, 100)}`,
    };
  }

  const audit = sanitizeAudit(raw);
  if (!audit) {
    return {
      id: p.id,
      name: (p.name || '').slice(0, 80),
      error: 'sanitize-failed',
      raw,
    };
  }

  const hasChanges = (
    !audit.category.verified ||
    audit.category.suggested != null ||
    audit.styles.should_remove.length > 0 ||
    audit.styles.should_add.length > 0 ||
    audit.roomType.should_remove.length > 0 ||
    audit.roomType.should_add.length > 0 ||
    audit.materials.should_remove.length > 0 ||
    audit.materials.should_add.length > 0 ||
    audit.imageQuality === 'diagram'
  );

  return {
    id:               p.id,
    name:             (p.name || '').slice(0, 80),
    currentCategory:  p.category,
    currentStyles:    p.styles || [],
    currentRoomType:  p.roomType || [],
    currentMaterials: p.materials || [],
    audit,
    hasChanges,
  };
}

// ── Concurrency runner ───────────────────────────────────────────────────────
async function runWithConcurrency(items, fn, n) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array(n).fill(0).map(async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]);
        done++;
        if (done % 5 === 0 || done === items.length) {
          process.stdout.write(`  [${done}/${items.length}]\r`);
        }
      }
    })
  );
  console.log(''); // newline after progress
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2);
  const sampleSize = (() => {
    const i = args.indexOf('--sample');
    if (i === -1) return null;
    return parseInt(args[i + 1] || '10', 10);
  })();
  const isFull = args.includes('--full');

  if (!sampleSize && !isFull) {
    console.error('Usage: node scripts/audit-catalog-metadata.mjs --sample [N] | --full');
    process.exit(1);
  }

  const catalogSrc = path.join(ROOT, 'src/data/productCatalog.js');
  const tmpMjs     = path.join(os.tmpdir(), `productCatalog-${Date.now()}.mjs`);
  await fs.copyFile(catalogSrc, tmpMjs);
  const { PRODUCT_CATALOG } = await import(tmpMjs);
  await fs.unlink(tmpMjs).catch(() => {});

  const targets = sampleSize
    ? PRODUCT_CATALOG.slice(0, sampleSize)
    : PRODUCT_CATALOG;

  console.log(`Auditing ${targets.length} products${sampleSize ? ` (SAMPLE — first ${sampleSize})` : ' (FULL)'}…`);
  console.log(`Model: ${MODEL} | Concurrency: ${CONCURRENCY}`);
  console.time('audit-elapsed');
  const results = await runWithConcurrency(targets, auditProduct, CONCURRENCY);
  console.timeEnd('audit-elapsed');

  const errors      = results.filter(r => r.error);
  const noChanges   = results.filter(r => !r.error && !r.hasChanges);
  const withChanges = results.filter(r => !r.error && r.hasChanges);
  const diagrams    = results.filter(r => !r.error && r.audit?.imageQuality === 'diagram');

  // Aggregate stats: how many products gained "contemporary"? Lost "mid-century"? etc.
  const styleAdds = {};
  const styleRems = {};
  withChanges.forEach(r => {
    r.audit.styles.should_add.forEach(s => { styleAdds[s] = (styleAdds[s] || 0) + 1; });
    r.audit.styles.should_remove.forEach(s => { styleRems[s] = (styleRems[s] || 0) + 1; });
  });

  const summary = {
    timestamp:      new Date().toISOString(),
    mode:           sampleSize ? `sample-${sampleSize}` : 'full',
    totalProducts:  results.length,
    noChanges:      noChanges.length,
    withChanges:    withChanges.length,
    diagrams:       diagrams.length,
    errors:         errors.length,
    styleAdditions: Object.fromEntries(Object.entries(styleAdds).sort((a,b) => b[1]-a[1])),
    styleRemovals:  Object.fromEntries(Object.entries(styleRems).sort((a,b) => b[1]-a[1])),
    model:          MODEL,
  };

  const fileSuffix = sampleSize ? '-sample' : '';
  const jsonPath = path.join(ROOT, `scripts/metadata-audit${fileSuffix}.json`);
  const mdPath   = path.join(ROOT, `scripts/metadata-audit${fileSuffix}.md`);

  await fs.writeFile(jsonPath, JSON.stringify({ summary, results }, null, 2));

  // ── Markdown report ─────────────────────────────────────────────────────
  const md = [];
  md.push(`# Catalog Metadata Audit ${sampleSize ? `(Sample of ${sampleSize})` : '(Full Catalog)'}`);
  md.push('');
  md.push(`**Generated:** ${summary.timestamp}`);
  md.push(`**Model:** ${MODEL}`);
  md.push(`**Mode:** ${summary.mode}`);
  md.push('');
  md.push('## Summary');
  md.push('');
  md.push(`| Metric | Count |`);
  md.push(`|---|---|`);
  md.push(`| Total products | ${summary.totalProducts} |`);
  md.push(`| No changes needed | ${summary.noChanges} |`);
  md.push(`| With changes | ${summary.withChanges} |`);
  md.push(`| ⚠ Diagram/non-product images | ${summary.diagrams} |`);
  md.push(`| Errors | ${summary.errors} |`);
  md.push('');

  md.push('## Style Tag Additions (Top 10)');
  md.push('');
  md.push(`| Style | Add Count |`);
  md.push(`|---|---|`);
  Object.entries(summary.styleAdditions).slice(0, 10).forEach(([s, n]) => {
    md.push(`| \`${s}\` | ${n} |`);
  });
  md.push('');

  md.push('## Style Tag Removals (Top 10)');
  md.push('');
  md.push(`| Style | Remove Count |`);
  md.push(`|---|---|`);
  Object.entries(summary.styleRemovals).slice(0, 10).forEach(([s, n]) => {
    md.push(`| \`${s}\` | ${n} |`);
  });
  md.push('');

  if (diagrams.length > 0) {
    md.push('## ⚠ Diagram / Non-Product Images');
    md.push('');
    md.push('These should have their imageUrl swapped to a real product photo.');
    md.push('');
    md.push(`| ID | Name | Notes |`);
    md.push(`|---|---|---|`);
    diagrams.forEach(r => {
      md.push(`| \`${r.id}\` | ${r.name} | ${r.audit.notes.replace(/\|/g, '\\|')} |`);
    });
    md.push('');
  }

  md.push('## Products With Changes');
  md.push('');
  md.push(`| ID | Cat | Style +/− | Room +/− | Mat +/− | Notes |`);
  md.push(`|---|---|---|---|---|---|`);
  withChanges.forEach(r => {
    const a = r.audit;
    const styleDelta = `+${a.styles.should_add.join(',') || '—'} / −${a.styles.should_remove.join(',') || '—'}`;
    const roomDelta = `+${a.roomType.should_add.join(',') || '—'} / −${a.roomType.should_remove.join(',') || '—'}`;
    const matDelta = `+${a.materials.should_add.join(',') || '—'} / −${a.materials.should_remove.join(',') || '—'}`;
    const cat = a.category.suggested ? `${r.currentCategory}→${a.category.suggested}` : (a.category.verified ? '✓' : '⚠');
    md.push(`| \`${r.id}\` | ${cat} | ${styleDelta} | ${roomDelta} | ${matDelta} | ${a.notes.replace(/\|/g, '\\|').slice(0, 60)} |`);
  });
  md.push('');

  if (errors.length > 0) {
    md.push('## Errors');
    md.push('');
    md.push(`| ID | Error |`);
    md.push(`|---|---|`);
    errors.forEach(r => {
      md.push(`| \`${r.id}\` | ${r.error} |`);
    });
    md.push('');
  }

  await fs.writeFile(mdPath, md.join('\n'));

  console.log('');
  console.log(`No changes:       ${summary.noChanges}/${summary.totalProducts}`);
  console.log(`With changes:     ${summary.withChanges}`);
  console.log(`Diagram images:   ${summary.diagrams}`);
  console.log(`Errors:           ${summary.errors}`);
  console.log('');
  console.log(`Top style adds:`);
  Object.entries(summary.styleAdditions).slice(0, 5).forEach(([s, n]) => {
    console.log(`  +${s}: ${n}`);
  });
  console.log('');
  console.log(`Reports:`);
  console.log(`  ${path.relative(ROOT, jsonPath)}`);
  console.log(`  ${path.relative(ROOT, mdPath)}`);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
