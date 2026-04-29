#!/usr/bin/env node
// scripts/audit-panel-images.mjs
//
// Build 117 — Panel Image Audit
//
// One-shot script: classify each catalog image as studio shot vs lifestyle
// shot via Haiku 4.5 vision. Picks the highest-scoring image per product as
// the canonical "panel source" for AI rendering input + Shop Room card display.
//
// Why: as observed on Build 116 TestFlight, lifestyle product photos with
// rooms/walls/decor in the background bleed into FAL flux-2-pro/edit's
// architecture interpretation when the user prompts a high-contrast style
// (Dark Luxe, Brutalist, Art Deco). Clean studio shots eliminate the bleed.
//
// Usage:
//   EXPO_PUBLIC_ANTHROPIC_API_KEY=... node scripts/audit-panel-images.mjs --sample 10
//   EXPO_PUBLIC_ANTHROPIC_API_KEY=... node scripts/audit-panel-images.mjs --full
//
// Outputs:
//   scripts/panel-audit{,-sample}.json   structured per-product results
//   scripts/panel-audit{,-sample}.md     human-readable summary table
//
// The script does NOT modify productCatalog.js. A separate apply step
// (apply-panel-audit.mjs) consumes the JSON output to write the catalog.

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
const MAX_TOKENS  = 120;
const CONCURRENCY = 8;     // parallel API calls — Haiku tier is generous
const RETRY_MAX   = 2;     // per-image retry on transient errors
const RETRY_BACKOFF_MS = 1500;

// Heavy categories get a higher confidence threshold — these products
// dominate the user's first impression of a generated room.
const HEAVY_CATEGORIES = new Set([
  'sofa', 'sectional', 'bed', 'dining-table', 'dining-set',
  'sectional-sofa',
]);
// Build 117 calibration (after 10-product sample on 2026-04-29):
// Originally 75/60. Lowered to 65/55 because a "mostly clean studio shot with
// faint floor surface" (typical Haiku score 70-74) is a far better panel
// source than the current lifestyle hero (typical score 25-35). The cost of
// "letting a 65 through" is much smaller than the cost of "rejecting a
// 30→72 upgrade because it has a visible floor."
const HEAVY_THRESHOLD = 65;
const STANDARD_THRESHOLD = 55;

const PROMPT = `You are scoring a product image for use as a clean reference in an AI room-rendering pipeline. flux-2-pro/edit will read this image and try to place the named product into a user's room photo. Lifestyle photos confuse it (it inherits the background scene); studio shots work cleanly.

A "studio shot" gets a HIGH score (90-100). Criteria:
- White, light gray, or solid neutral background
- Product is fully isolated — no other furniture, walls, floor patterns, decor, plants, or art visible
- Centered framing with clean edges
- Even, neutral lighting

"Mostly clean" gets 70-89. Criteria:
- Mostly clean background but a single floor surface or shadow visible
- Product is the only foreground item, no other furniture/decor

"Ambiguous" gets 50-69. Criteria:
- Some context visible (a corner of a wall, a single neighboring item)
- Product is still clearly the subject

"Lifestyle leaning" gets 25-49. Criteria:
- Multiple context elements (rug under coffee table, wall art behind sofa)
- Specific room atmosphere

"Full lifestyle" gets 0-24. Criteria:
- Product placed in a styled room with multiple other items
- The image conveys "what your room could look like" rather than "what this exact item is"

Return ONLY a JSON object on a single line: {"score": <0-100>, "reason": "<one short sentence>"}`;

// ── Anthropic API call ───────────────────────────────────────────────────────
async function scoreImageOnce(url) {
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
          { type: 'text', text: PROMPT },
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
  // Extract first JSON object from the response (Haiku may wrap in markdown).
  const match = text.match(/\{[^{}]*"score"[^{}]*\}/);
  if (!match) {
    throw new Error(`No JSON in response: ${text.slice(0, 120)}`);
  }
  const parsed = JSON.parse(match[0]);
  if (typeof parsed.score !== 'number' || parsed.score < 0 || parsed.score > 100) {
    throw new Error(`Bad score: ${match[0].slice(0, 80)}`);
  }
  return parsed;
}

async function scoreImage(url) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    try {
      return await scoreImageOnce(url);
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

// ── Per-product audit ────────────────────────────────────────────────────────
async function auditProduct(p, indexLabel) {
  const candidateUrls = [
    p.imageUrl,
    ...(Array.isArray(p.images) ? p.images : []),
  ]
    .filter(u => typeof u === 'string' && u.startsWith('http'))
    .filter((u, i, arr) => arr.indexOf(u) === i); // de-dupe

  if (candidateUrls.length === 0) {
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      error: 'no-images',
    };
  }

  const isHeavy   = HEAVY_CATEGORIES.has(p.category);
  const threshold = isHeavy ? HEAVY_THRESHOLD : STANDARD_THRESHOLD;

  const scores = [];
  for (const url of candidateUrls) {
    try {
      const result = await scoreImage(url);
      scores.push({ url, score: result.score, reason: result.reason });
    } catch (err) {
      scores.push({ url, score: -1, reason: `error: ${(err.message || '').slice(0, 100)}` });
    }
  }

  const valid = scores.filter(s => s.score >= 0);
  valid.sort((a, b) => b.score - a.score);
  const best = valid[0] || null;
  const meetsThreshold = best ? best.score >= threshold : false;

  return {
    id:               p.id,
    name:             (p.name || '').slice(0, 80),
    category:         p.category,
    isHeavy,
    threshold,
    chosenImage:      meetsThreshold ? best.url : null,
    chosenScore:      best?.score ?? null,
    chosenReason:     best?.reason ?? null,
    needsManualPick:  !meetsThreshold,
    currentImageUrl:  p.imageUrl,
    allScores:        scores,
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
        results[i] = await fn(items[i], `${i + 1}/${items.length}`);
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
    console.error('Usage: node scripts/audit-panel-images.mjs --sample [N] | --full');
    process.exit(1);
  }

  // Load catalog by copying to .mjs and dynamic-importing.
  // productCatalog.js uses `export const` (ESM syntax) but package.json has
  // no `"type": "module"` — Node refuses to parse `.js` files as ESM by
  // default. The .mjs extension forces ESM regardless of package.json.
  const catalogSrc = path.join(ROOT, 'src/data/productCatalog.js');
  const tmpMjs     = path.join(os.tmpdir(), `productCatalog-${Date.now()}.mjs`);
  await fs.copyFile(catalogSrc, tmpMjs);
  const { PRODUCT_CATALOG } = await import(tmpMjs);
  await fs.unlink(tmpMjs).catch(() => {});

  const targets = sampleSize
    ? PRODUCT_CATALOG.slice(0, sampleSize)
    : PRODUCT_CATALOG;

  console.log(`Auditing ${targets.length} products${sampleSize ? ` (SAMPLE — first ${sampleSize})` : ' (FULL)'}…`);
  console.log(`Model: ${MODEL} | Concurrency: ${CONCURRENCY} | Heavy threshold: ${HEAVY_THRESHOLD} | Standard: ${STANDARD_THRESHOLD}`);
  console.time('audit-elapsed');
  const results = await runWithConcurrency(targets, auditProduct, CONCURRENCY);
  console.timeEnd('audit-elapsed');

  const errors        = results.filter(r => r.error);
  const autoPicked    = results.filter(r => !r.error && !r.needsManualPick);
  const needsManual   = results.filter(r => !r.error && r.needsManualPick);
  const heavyManual   = needsManual.filter(r => r.isHeavy);

  const summary = {
    timestamp:        new Date().toISOString(),
    mode:             sampleSize ? `sample-${sampleSize}` : 'full',
    totalProducts:    results.length,
    autoPicked:       autoPicked.length,
    needsManualPick:  needsManual.length,
    heavyManualPick:  heavyManual.length,
    errors:           errors.length,
    model:            MODEL,
  };

  const fileSuffix = sampleSize ? '-sample' : '';
  const jsonPath = path.join(ROOT, `scripts/panel-audit${fileSuffix}.json`);
  const mdPath   = path.join(ROOT, `scripts/panel-audit${fileSuffix}.md`);

  await fs.writeFile(jsonPath, JSON.stringify({ summary, results }, null, 2));

  // ── Markdown report ─────────────────────────────────────────────────────
  const md = [];
  md.push(`# Panel Image Audit ${sampleSize ? `(Sample of ${sampleSize})` : '(Full Catalog)'}`);
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
  md.push(`| Auto-picked (≥ threshold) | ${summary.autoPicked} |`);
  md.push(`| Needs manual pick | ${summary.needsManualPick} |`);
  md.push(`| ⚠ Heavy products needing manual | ${summary.heavyManualPick} |`);
  md.push(`| Errors | ${summary.errors} |`);
  md.push('');

  if (heavyManual.length > 0) {
    md.push('## ⚠ Heavy Products Needing Manual Pick');
    md.push('');
    md.push(`These are sofas/beds/dining tables that didn't clear the ${HEAVY_THRESHOLD} threshold. The user's eye lands on these first — review carefully.`);
    md.push('');
    md.push(`| ID | Name | Category | Best Score | Best URL | Reason |`);
    md.push(`|---|---|---|---|---|---|`);
    heavyManual.forEach(r => {
      const reason = (r.chosenReason || '').replace(/\|/g, '\\|').slice(0, 80);
      md.push(`| \`${r.id}\` | ${r.name} | ${r.category} | ${r.chosenScore ?? 'err'} | \`${(r.chosenImage || (r.allScores?.[0]?.url) || '').slice(-60)}\` | ${reason} |`);
    });
    md.push('');
  }

  md.push('## All Products');
  md.push('');
  md.push(`| ID | Category | H | Score | Status | Image (last 50 chars of URL) |`);
  md.push(`|---|---|---|---|---|---|`);
  results.forEach(r => {
    if (r.error) {
      md.push(`| \`${r.id}\` | ${r.category} | | — | ❌ ${r.error} | — |`);
      return;
    }
    const status = r.needsManualPick ? '⚠ MANUAL' : '✓ auto';
    const heavy  = r.isHeavy ? 'Y' : '';
    const url    = (r.chosenImage || r.allScores?.[0]?.url || '').slice(-50);
    md.push(`| \`${r.id}\` | ${r.category} | ${heavy} | ${r.chosenScore ?? 'err'} | ${status} | \`${url}\` |`);
  });
  md.push('');

  await fs.writeFile(mdPath, md.join('\n'));

  console.log('');
  console.log(`Auto-picked:      ${summary.autoPicked}/${summary.totalProducts}`);
  console.log(`Needs manual:     ${summary.needsManualPick}`);
  console.log(`Heavy + manual:   ${summary.heavyManualPick}`);
  console.log(`Errors:           ${summary.errors}`);
  console.log('');
  console.log(`Reports:`);
  console.log(`  ${path.relative(ROOT, jsonPath)}`);
  console.log(`  ${path.relative(ROOT, mdPath)}`);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
