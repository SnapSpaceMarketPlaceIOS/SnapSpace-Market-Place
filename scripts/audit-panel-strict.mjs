#!/usr/bin/env node
// scripts/audit-panel-strict.mjs
//
// Build 128 — Strict Panel Image Audit
//
// One-shot script: re-audit every product's `panelImageUrl` with a STRICT
// rejection prompt that flags the failure modes Build 117's audit missed.
// For any flagged product, score every URL in `images[]` and pick the
// cleanest single-product studio shot. If none qualify, set panelImageUrl
// to null so the composite-products edge function pulls from the backup
// pool instead.
//
// Why a re-audit: Build 117 scored "studio cleanliness" (white background,
// isolated product) but did NOT reject:
//   • Text overlays — brand names, feature callouts ("Stain-Resistant"),
//     marketing copy ("Hidden storage")
//   • Dimension callouts — measurement labels with ruler marks (8ft × 10ft,
//     27.5", etc.)
//   • Multi-thumbnail composites — multiple angles of the same product
//     stitched into one image
//   • Marketing infographic layouts — feature icons, badges, logos
//
// These all score HIGH on Haiku's "studio shot" metric (white bg + isolated
// product) but are TERRIBLE FAL inputs because:
//   1. Text gets read by flux's vision-language head as prompt directives
//   2. Dimensions confuse the rendering geometry
//   3. Multi-thumbnails make flux render multiple instances
//
// Output: scripts/panel-strict-audit.json + .md
// Apply via: scripts/apply-panel-strict-audit.mjs

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
const MAX_TOKENS  = 120;
const CONCURRENCY = 3;
const RETRY_MAX   = 5;
const RETRY_BACKOFF_MS = 4000;

// Strict acceptance threshold. Anything below scores as "reject" — the
// product gets nulled out OR replaced from images[].
const ACCEPT_THRESHOLD = 80;

const PROMPT = `You are scoring a product image as a reference cell for an AI room-rendering pipeline. The model (flux-2-pro/edit) will read this image as a 256-pixel cell in a 2×2 panel and try to place ONLY the named product into a user's room photo.

This audit is STRICTER than a generic "studio shot" check. Score 0-100. Anything that violates the disqualifiers gets a HARD REJECT regardless of how clean the rest of the image looks.

HARD DISQUALIFIERS (auto-cap score at 30 if ANY of these are present):
- ANY text or numbers overlaid on the image: brand names, feature labels ("Stain-Resistant", "Open Storage", "Easy Organization"), marketing copy, badges
- Dimension callouts: measurement numbers with arrows or ruler marks (e.g. "8ft", "27.5\"", "10ft × 8ft")
- Multi-angle composites: multiple thumbnails of the same product stitched into one image (e.g. front view + side view + back view in a grid)
- Feature icons: small graphics promoting product features (water-drop, hands, leaf icons next to text)
- Watermark or logo placed over the product itself

ACCEPT TIERS (only if ZERO disqualifiers):
- Score 90-100: Perfect — single product, white/light-gray background, no other items, centered framing, even lighting
- Score 80-89: Acceptable — slight floor surface or subtle shadow, but product is fully isolated and unambiguous
- Score 60-79: Borderline — minor context (corner of a wall, floor pattern) but no other products visible
- Score 40-59: Lifestyle leaning — product is in a styled scene with rugs/curtains/decor visible
- Score 0-39: Full lifestyle scene OR ANY disqualifier present

Return ONLY a JSON object on a single line: {"score": <0-100>, "reason": "<one short sentence — call out the specific disqualifier if any>"}`;

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
  const match = text.match(/\{[^{}]*"score"[^{}]*\}/);
  if (!match) throw new Error(`No JSON: ${text.slice(0, 120)}`);
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
      if (err.status >= 400 && err.status < 500 && err.status !== 429) throw err;
      if (attempt < RETRY_MAX) await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * attempt));
    }
  }
  throw lastErr;
}

async function auditProduct(p) {
  const currentPanel = p.panelImageUrl;
  if (!currentPanel || !currentPanel.startsWith('http')) {
    return { id: p.id, name: p.name, error: 'no-panelImageUrl' };
  }

  // Score the current panel image
  let currentResult;
  try {
    currentResult = await scoreImage(currentPanel);
  } catch (err) {
    return { id: p.id, name: (p.name || '').slice(0, 80), error: `api-error: ${(err.message || '').slice(0, 100)}` };
  }

  // If current passes the strict threshold, no action needed.
  if (currentResult.score >= ACCEPT_THRESHOLD) {
    return {
      id: p.id,
      name: (p.name || '').slice(0, 80),
      currentPanel,
      currentScore: currentResult.score,
      currentReason: currentResult.reason,
      needsReplacement: false,
    };
  }

  // Below threshold — score every other URL in images[] for a replacement.
  // De-dupe and exclude the current panel + the imageUrl (which is a
  // separate user-facing concern handled by the framing audit).
  const candidateUrls = (Array.isArray(p.images) ? p.images : [])
    .filter(u => typeof u === 'string' && u.startsWith('http'))
    .filter(u => u !== currentPanel)
    .filter((u, i, arr) => arr.indexOf(u) === i);

  const candidateScores = [];
  for (const url of candidateUrls) {
    try {
      const r = await scoreImage(url);
      candidateScores.push({ url, score: r.score, reason: r.reason });
    } catch (err) {
      candidateScores.push({ url, score: -1, reason: `error: ${(err.message || '').slice(0, 100)}` });
    }
  }

  const valid = candidateScores.filter(s => s.score >= 0);
  valid.sort((a, b) => b.score - a.score);
  const best = valid[0];

  // Replace if a candidate clears the strict threshold OR is meaningfully
  // better than the current panel. If nothing in images[] clears 80, set
  // panelImageUrl to null — the composite-products edge function falls
  // back to its 6-URL backup pool, which the client builds from images[]
  // anyway, but the FALLBACK has its own broken-image skip logic.
  const useReplacement = best && best.score >= ACCEPT_THRESHOLD;
  const setNull = !useReplacement && currentResult.score < 50;

  return {
    id: p.id,
    name: (p.name || '').slice(0, 80),
    currentPanel,
    currentScore: currentResult.score,
    currentReason: currentResult.reason,
    needsReplacement: true,
    candidateScores,
    bestReplacement: useReplacement ? best.url : null,
    bestReplacementScore: useReplacement ? best.score : null,
    setNull,
  };
}

async function runWithConcurrency(items, fn, n) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
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
  const args = process.argv.slice(2);
  const sampleSize = (() => {
    const i = args.indexOf('--sample');
    if (i === -1) return null;
    return parseInt(args[i + 1] || '10', 10);
  })();
  const isFull = args.includes('--full');
  if (!sampleSize && !isFull) {
    console.error('Usage: node scripts/audit-panel-strict.mjs --sample [N] | --full');
    process.exit(1);
  }

  const catalogSrc = path.join(ROOT, 'src/data/productCatalog.js');
  const tmpMjs = path.join(os.tmpdir(), `productCatalog-${Date.now()}.mjs`);
  await fs.copyFile(catalogSrc, tmpMjs);
  const { PRODUCT_CATALOG } = await import(tmpMjs);
  await fs.unlink(tmpMjs).catch(() => {});

  const targets = sampleSize ? PRODUCT_CATALOG.slice(0, sampleSize) : PRODUCT_CATALOG;

  console.log(`Strict panel audit: ${targets.length} products${sampleSize ? ` (SAMPLE)` : ' (FULL)'}…`);
  console.log(`Threshold: ${ACCEPT_THRESHOLD} | Concurrency: ${CONCURRENCY}`);
  console.time('strict-panel-audit');
  const results = await runWithConcurrency(targets, auditProduct, CONCURRENCY);
  console.timeEnd('strict-panel-audit');

  const errors = results.filter(r => r.error);
  const ok = results.filter(r => !r.error && !r.needsReplacement);
  const replaced = results.filter(r => !r.error && r.needsReplacement && r.bestReplacement);
  const nulled = results.filter(r => !r.error && r.needsReplacement && r.setNull && !r.bestReplacement);
  const noChangeNeeded = results.filter(r => !r.error && r.needsReplacement && !r.setNull && !r.bestReplacement);

  const summary = {
    timestamp: new Date().toISOString(),
    mode: sampleSize ? `sample-${sampleSize}` : 'full',
    totalProducts: results.length,
    panelOk: ok.length,
    replacementAvailable: replaced.length,
    setNull: nulled.length,
    noChangeNeeded: noChangeNeeded.length,
    errors: errors.length,
    threshold: ACCEPT_THRESHOLD,
    model: MODEL,
  };

  const fileSuffix = sampleSize ? '-sample' : '';
  const jsonPath = path.join(ROOT, `scripts/panel-strict-audit${fileSuffix}.json`);
  const mdPath = path.join(ROOT, `scripts/panel-strict-audit${fileSuffix}.md`);
  await fs.writeFile(jsonPath, JSON.stringify({ summary, results }, null, 2));

  const md = [];
  md.push(`# Strict Panel Image Audit ${sampleSize ? `(Sample of ${sampleSize})` : '(Full Catalog)'}`);
  md.push('');
  md.push(`**Generated:** ${summary.timestamp}`);
  md.push(`**Threshold:** ${ACCEPT_THRESHOLD} (strict — rejects text/dimensions/composites)`);
  md.push('');
  md.push('## Summary');
  md.push('');
  md.push(`| Metric | Count |`);
  md.push(`|---|---|`);
  md.push(`| Total products | ${summary.totalProducts} |`);
  md.push(`| Panel OK (no change) | ${summary.panelOk} |`);
  md.push(`| Replacement available | ${summary.replacementAvailable} |`);
  md.push(`| Set null (composite fallback) | ${summary.setNull} |`);
  md.push(`| Below threshold but no good alternative | ${summary.noChangeNeeded} |`);
  md.push(`| Errors | ${summary.errors} |`);
  md.push('');

  if (replaced.length > 0) {
    md.push('## Replacements Available');
    md.push('');
    md.push(`| ID | Old | New | Reason rejected |`);
    md.push(`|---|---|---|---|`);
    replaced.slice(0, 80).forEach(r => {
      md.push(`| \`${r.id}\` | ${r.currentScore} | ${r.bestReplacementScore} | ${(r.currentReason || '').replace(/\|/g, '\\|').slice(0, 80)} |`);
    });
    md.push('');
  }

  if (nulled.length > 0) {
    md.push('## Set To Null (no good alternative)');
    md.push('');
    md.push(`| ID | Score | Reason |`);
    md.push(`|---|---|---|`);
    nulled.slice(0, 60).forEach(r => {
      md.push(`| \`${r.id}\` | ${r.currentScore} | ${(r.currentReason || '').replace(/\|/g, '\\|').slice(0, 100)} |`);
    });
    md.push('');
  }

  await fs.writeFile(mdPath, md.join('\n'));

  console.log('');
  console.log(`Panel OK:                      ${summary.panelOk}/${summary.totalProducts}`);
  console.log(`Replacements available:        ${summary.replacementAvailable}`);
  console.log(`Set to null (will use pool):   ${summary.setNull}`);
  console.log(`No good alternative kept as-is:${summary.noChangeNeeded}`);
  console.log(`Errors:                        ${summary.errors}`);
  console.log('');
  console.log(`Reports:`);
  console.log(`  ${path.relative(ROOT, jsonPath)}`);
  console.log(`  ${path.relative(ROOT, mdPath)}`);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
