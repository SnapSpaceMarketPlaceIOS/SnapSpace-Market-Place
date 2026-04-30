#!/usr/bin/env node
// scripts/retry-metadata-audit.mjs
//
// Build 125 — retry only the 429-failed entries from metadata-audit.json
// with reduced concurrency + longer backoff. Merges results back into the
// same JSON file so apply-catalog-metadata-audit.mjs can run cleanly.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) {
  console.error('ERROR: EXPO_PUBLIC_ANTHROPIC_API_KEY not set in env');
  process.exit(1);
}

const MODEL       = 'claude-haiku-4-5-20251001';
const MAX_TOKENS  = 400;
const CONCURRENCY = 2;          // halved from full audit's 6 to avoid 429
const RETRY_MAX   = 5;          // up from 3 — each retry waits longer
const RETRY_BACKOFF_MS = 5000;  // up from 2s — gives rate window time to reset

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
- Be CONSERVATIVE with "should_remove": only flag a tag for removal if you're highly confident it's wrong.
- Be LIBERAL with "should_add": especially for "contemporary" and "modern" — these are catch-all aesthetics that often go untagged.
- Never invent tags. Only use values from the approved lists below.
- "category" can have at most one suggested value. Styles / roomType / materials are multi-valued.
- If the image looks like a dimension diagram, line drawing, packaging shot, or otherwise NOT a real product photo, set "imageQuality" to "diagram" and skip the tag analysis.

APPROVED CATEGORIES: ${VALID_CATEGORIES.join(', ')}
APPROVED STYLES: ${VALID_STYLES.join(', ')}
APPROVED ROOM TYPES: ${VALID_ROOM_TYPES.join(', ')}
APPROVED MATERIALS: ${VALID_MATERIALS.join(', ')}

Return ONLY a valid JSON object on a single line:
{
  "imageQuality": "good" | "diagram",
  "category": { "verified": true|false, "suggested": null|"<approved>" },
  "styles":    { "should_remove": [...], "should_add": [...] },
  "roomType":  { "should_remove": [...], "should_add": [...] },
  "materials": { "should_remove": [...], "should_add": [...] },
  "notes": "<one short sentence or empty string>"
}`;

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
  const startIdx = text.indexOf('{');
  if (startIdx === -1) throw new Error(`No JSON in response: ${text.slice(0, 120)}`);
  let depth = 0; let endIdx = -1;
  for (let i = startIdx; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  if (endIdx === -1) throw new Error('Unbalanced JSON');
  return JSON.parse(text.slice(startIdx, endIdx + 1));
}

async function auditWithRetry(product) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    try {
      return await auditOnce(product);
    } catch (err) {
      lastErr = err;
      if (err.status >= 400 && err.status < 500 && err.status !== 429) throw err;
      if (attempt < RETRY_MAX) {
        const backoff = RETRY_BACKOFF_MS * attempt;
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

function sanitizeArray(arr, allowed) {
  if (!Array.isArray(arr)) return [];
  const set = new Set(allowed);
  return arr.filter(v => typeof v === 'string' && set.has(v));
}

function sanitizeAudit(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    imageQuality: raw.imageQuality === 'diagram' ? 'diagram' : 'good',
    category: {
      verified: raw.category?.verified !== false,
      suggested: (raw.category?.suggested && VALID_CATEGORIES.includes(raw.category.suggested))
        ? raw.category.suggested : null,
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
}

async function auditProduct(p) {
  if (!p.imageUrl || !p.imageUrl.startsWith('http')) return { id: p.id, name: p.name, error: 'no-imageUrl' };
  let raw;
  try {
    raw = await auditWithRetry(p);
  } catch (err) {
    return { id: p.id, name: (p.name || '').slice(0, 80), error: `api-error: ${(err.message || '').slice(0, 100)}` };
  }
  const audit = sanitizeAudit(raw);
  if (!audit) return { id: p.id, name: (p.name || '').slice(0, 80), error: 'sanitize-failed', raw };
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
    id: p.id, name: (p.name || '').slice(0, 80),
    currentCategory: p.category, currentStyles: p.styles || [],
    currentRoomType: p.roomType || [], currentMaterials: p.materials || [],
    audit, hasChanges,
  };
}

async function runWithConcurrency(items, fn, n) {
  const results = new Array(items.length);
  let next = 0; let done = 0;
  await Promise.all(Array(n).fill(0).map(async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
      done++;
      if (done % 5 === 0 || done === items.length) process.stdout.write(`  [${done}/${items.length}]\r`);
    }
  }));
  console.log('');
  return results;
}

(async () => {
  const auditPath = path.join(ROOT, 'scripts/metadata-audit.json');
  const auditRaw = await fs.readFile(auditPath, 'utf8');
  const audit = JSON.parse(auditRaw);

  const failedIds = new Set(audit.results.filter(r => r.error && /429/.test(r.error)).map(r => r.id));
  console.log(`${failedIds.size} products failed with 429 — retrying with concurrency=${CONCURRENCY}, backoff=${RETRY_BACKOFF_MS}ms`);

  const catalogSrc = path.join(ROOT, 'src/data/productCatalog.js');
  const tmpMjs = path.join(os.tmpdir(), `productCatalog-${Date.now()}.mjs`);
  await fs.copyFile(catalogSrc, tmpMjs);
  const { PRODUCT_CATALOG } = await import(tmpMjs);
  await fs.unlink(tmpMjs).catch(() => {});

  const targets = PRODUCT_CATALOG.filter(p => failedIds.has(p.id));
  console.log(`Retrying ${targets.length} products...`);
  console.time('retry-elapsed');
  const newResults = await runWithConcurrency(targets, auditProduct, CONCURRENCY);
  console.timeEnd('retry-elapsed');

  // Merge into existing audit
  const byId = new Map(newResults.map(r => [r.id, r]));
  audit.results = audit.results.map(r => byId.has(r.id) ? byId.get(r.id) : r);

  // Recompute summary
  const errors = audit.results.filter(r => r.error);
  const noChanges = audit.results.filter(r => !r.error && !r.hasChanges);
  const withChanges = audit.results.filter(r => !r.error && r.hasChanges);
  const diagrams = audit.results.filter(r => !r.error && r.audit?.imageQuality === 'diagram');
  audit.summary.timestamp = new Date().toISOString();
  audit.summary.noChanges = noChanges.length;
  audit.summary.withChanges = withChanges.length;
  audit.summary.diagrams = diagrams.length;
  audit.summary.errors = errors.length;

  await fs.writeFile(auditPath, JSON.stringify(audit, null, 2));

  const stillFailed = newResults.filter(r => r.error);
  console.log('');
  console.log(`After retry:`);
  console.log(`  Recovered:     ${newResults.length - stillFailed.length}/${newResults.length}`);
  console.log(`  Still failed:  ${stillFailed.length}`);
  console.log(`  Total errors:  ${errors.length}`);
  console.log(`  With changes:  ${withChanges.length}`);
  console.log(`  No changes:    ${noChanges.length}`);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
