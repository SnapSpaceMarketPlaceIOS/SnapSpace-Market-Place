#!/usr/bin/env node
// scripts/audit-image-framing.mjs
//
// Build 126 — Image Framing Audit
//
// One-shot script: classify each catalog product's `imageUrl` as
// "full-product framing" vs "zoomed-in detail" via Haiku 4.5 vision.
// For products flagged as zoomed/cropped, score every other URL in
// the product's `images[]` array and propose the best full-product
// shot as the new imageUrl.
//
// Why: Build 125 TestFlight surfaced cards in the Shop Room strip whose
// hero photo was a macro/detail shot (e.g. just the edge of a rug, a
// close-up of a leg, a fabric weave). The user can't tell what the
// product is from a detail shot. The Build 117 audit verified
// panelImageUrl quality for the AI panel; this audit verifies imageUrl
// framing for the user-facing strip.
//
// Output:
//   scripts/framing-audit{,-sample}.json   structured per-product results
//   scripts/framing-audit{,-sample}.md     human-readable summary
//
// A sister script (apply-image-framing-audit.mjs) consumes the JSON to
// patch productCatalog.js's imageUrl fields.

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
const MAX_TOKENS  = 100;
const CONCURRENCY = 3;          // same throttling as retry-metadata-audit (avoid 429)
const RETRY_MAX   = 5;
const RETRY_BACKOFF_MS = 4000;

// Threshold: scores >= this stay; anything below is flagged for replacement.
// Calibrated with awareness that "perfect" full-product shots score 90+,
// "shows full product but slightly off-center" scores 75-85, "shows full
// product with minor crop" 60-75, and "zoomed detail" scores below 50.
// Keeping cutoff at 70 means we replace anything that's not clearly
// full-product framing.
const FRAMING_THRESHOLD = 70;

const PROMPT = `You are scoring a product image for use as the user-facing hero photo in a shopping app's product card. The card is the user's first signal of what the product is — it must show the FULL product clearly.

Score 90-100 ("Perfect full-product framing"):
- Entire product visible from edge to edge
- Generous padding/whitespace around the product
- Centered or near-centered composition
- Single product, no clutter

Score 70-89 ("Acceptable full-product framing"):
- Whole product visible but slightly tight crop
- Or product fills most of frame with minor edge proximity
- Still immediately recognizable as the product

Score 40-69 ("Tight crop / partial product"):
- Major portion of product visible but a leg, edge, or section is cropped off
- User can probably guess the product but not see it fully
- Or framing is so wide that the product is small and hard to read

Score 10-39 ("Detail shot / macro"):
- Close-up of a section (fabric weave, hardware, corner detail)
- Cannot tell what the product is at a glance
- User would need to tap through to figure it out

Score 0-9 ("Wrong content"):
- Image is a dimension diagram, packaging, lifestyle scene with no clear product subject, or the wrong item entirely

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
      if (attempt < RETRY_MAX) {
        await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * attempt));
      }
    }
  }
  throw lastErr;
}

// ── Per-product audit ────────────────────────────────────────────────────────
async function auditProduct(p) {
  const heroUrl = p.imageUrl;
  if (!heroUrl || !heroUrl.startsWith('http')) {
    return { id: p.id, name: p.name, error: 'no-imageUrl' };
  }

  // Score the current hero
  let heroResult;
  try {
    heroResult = await scoreImage(heroUrl);
  } catch (err) {
    return { id: p.id, name: (p.name || '').slice(0, 80), error: `api-error: ${(err.message || '').slice(0, 100)}` };
  }

  // If the hero is acceptable, no action needed.
  if (heroResult.score >= FRAMING_THRESHOLD) {
    return {
      id: p.id,
      name: (p.name || '').slice(0, 80),
      currentImageUrl: heroUrl,
      heroScore: heroResult.score,
      heroReason: heroResult.reason,
      needsReplacement: false,
    };
  }

  // Hero is below threshold — score every other URL in images[] and pick
  // the best replacement. Skip URLs we've already scored (the hero itself
  // appears in images[] for most products) and skip the panel URL (which
  // may itself be a studio-shot detail not intended as a hero).
  const candidateUrls = (Array.isArray(p.images) ? p.images : [])
    .filter(u => typeof u === 'string' && u.startsWith('http'))
    .filter(u => u !== heroUrl)
    .filter((u, i, arr) => arr.indexOf(u) === i);

  if (candidateUrls.length === 0) {
    return {
      id: p.id,
      name: (p.name || '').slice(0, 80),
      currentImageUrl: heroUrl,
      heroScore: heroResult.score,
      heroReason: heroResult.reason,
      needsReplacement: true,
      candidateScores: [],
      bestReplacement: null,
      bestReplacementScore: null,
      noAlternativesAvailable: true,
    };
  }

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

  return {
    id: p.id,
    name: (p.name || '').slice(0, 80),
    currentImageUrl: heroUrl,
    heroScore: heroResult.score,
    heroReason: heroResult.reason,
    needsReplacement: true,
    candidateScores,
    bestReplacement: best && best.score > heroResult.score ? best.url : null,
    bestReplacementScore: best && best.score > heroResult.score ? best.score : null,
    bestReplacementMeetsThreshold: best ? best.score >= FRAMING_THRESHOLD : false,
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
      if (done % 5 === 0 || done === items.length) {
        process.stdout.write(`  [${done}/${items.length}]\r`);
      }
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
    console.error('Usage: node scripts/audit-image-framing.mjs --sample [N] | --full');
    process.exit(1);
  }

  const catalogSrc = path.join(ROOT, 'src/data/productCatalog.js');
  const tmpMjs = path.join(os.tmpdir(), `productCatalog-${Date.now()}.mjs`);
  await fs.copyFile(catalogSrc, tmpMjs);
  const { PRODUCT_CATALOG } = await import(tmpMjs);
  await fs.unlink(tmpMjs).catch(() => {});

  const targets = sampleSize ? PRODUCT_CATALOG.slice(0, sampleSize) : PRODUCT_CATALOG;

  console.log(`Auditing ${targets.length} products${sampleSize ? ` (SAMPLE — first ${sampleSize})` : ' (FULL)'}…`);
  console.log(`Model: ${MODEL} | Concurrency: ${CONCURRENCY} | Threshold: ${FRAMING_THRESHOLD}`);
  console.time('framing-audit-elapsed');
  const results = await runWithConcurrency(targets, auditProduct, CONCURRENCY);
  console.timeEnd('framing-audit-elapsed');

  const errors = results.filter(r => r.error);
  const heroOk = results.filter(r => !r.error && !r.needsReplacement);
  const needsReplaceWithCandidate = results.filter(r => !r.error && r.needsReplacement && r.bestReplacement);
  const needsReplaceNoAlt = results.filter(r => !r.error && r.needsReplacement && !r.bestReplacement);

  const summary = {
    timestamp: new Date().toISOString(),
    mode: sampleSize ? `sample-${sampleSize}` : 'full',
    totalProducts: results.length,
    heroOk: heroOk.length,
    needsReplaceWithCandidate: needsReplaceWithCandidate.length,
    needsReplaceNoAlt: needsReplaceNoAlt.length,
    errors: errors.length,
    threshold: FRAMING_THRESHOLD,
    model: MODEL,
  };

  const fileSuffix = sampleSize ? '-sample' : '';
  const jsonPath = path.join(ROOT, `scripts/framing-audit${fileSuffix}.json`);
  const mdPath = path.join(ROOT, `scripts/framing-audit${fileSuffix}.md`);

  await fs.writeFile(jsonPath, JSON.stringify({ summary, results }, null, 2));

  const md = [];
  md.push(`# Image Framing Audit ${sampleSize ? `(Sample of ${sampleSize})` : '(Full Catalog)'}`);
  md.push('');
  md.push(`**Generated:** ${summary.timestamp}`);
  md.push(`**Model:** ${MODEL}`);
  md.push(`**Threshold:** ${FRAMING_THRESHOLD}`);
  md.push('');
  md.push('## Summary');
  md.push('');
  md.push(`| Metric | Count |`);
  md.push(`|---|---|`);
  md.push(`| Total products | ${summary.totalProducts} |`);
  md.push(`| Hero OK (no replacement needed) | ${summary.heroOk} |`);
  md.push(`| Replacement available | ${summary.needsReplaceWithCandidate} |`);
  md.push(`| Replacement NOT available (manual) | ${summary.needsReplaceNoAlt} |`);
  md.push(`| Errors | ${summary.errors} |`);
  md.push('');

  if (needsReplaceWithCandidate.length > 0) {
    md.push('## Replacements Available');
    md.push('');
    md.push(`| ID | Old Score | New Score | Reason |`);
    md.push(`|---|---|---|---|`);
    needsReplaceWithCandidate.slice(0, 60).forEach(r => {
      md.push(`| \`${r.id}\` | ${r.heroScore} | ${r.bestReplacementScore} | ${(r.heroReason || '').replace(/\|/g, '\\|').slice(0, 80)} |`);
    });
    md.push('');
  }

  if (needsReplaceNoAlt.length > 0) {
    md.push('## Manual Pick Needed');
    md.push('');
    md.push(`| ID | Score | Reason |`);
    md.push(`|---|---|---|`);
    needsReplaceNoAlt.forEach(r => {
      md.push(`| \`${r.id}\` | ${r.heroScore} | ${(r.heroReason || '').replace(/\|/g, '\\|').slice(0, 100)} |`);
    });
    md.push('');
  }

  await fs.writeFile(mdPath, md.join('\n'));

  console.log('');
  console.log(`Hero OK:                    ${summary.heroOk}/${summary.totalProducts}`);
  console.log(`Replacement available:      ${summary.needsReplaceWithCandidate}`);
  console.log(`Replacement NOT available:  ${summary.needsReplaceNoAlt}`);
  console.log(`Errors:                     ${summary.errors}`);
  console.log('');
  console.log(`Reports:`);
  console.log(`  ${path.relative(ROOT, jsonPath)}`);
  console.log(`  ${path.relative(ROOT, mdPath)}`);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
