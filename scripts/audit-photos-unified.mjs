#!/usr/bin/env node
// scripts/audit-photos-unified.mjs
//
// Build 129 — Unified Photo Audit (Two-Funnel Architecture)
//
// One audit pass that scores every URL across imageUrl, panelImageUrl, and
// images[] for each product on TWO axes simultaneously:
//
//   • lifestyle_score  — environmental appeal: full product visible in a
//                        beautiful styled scene with context, sells the vibe
//   • studio_score     — AI-readability: clean isolation on neutral
//                        background, no other items, full silhouette
//
// PLUS a hard-rejection signal independent of both scores:
//   • rejected         — true if image has text overlays, dimension callouts,
//                        instructional diagrams, multi-thumbnail composites,
//                        or brand-cover graphics. These are auto-poison
//                        regardless of any other quality.
//
// Per-product picking logic:
//   imageUrl  ← highest lifestyle_score among non-rejected URLs
//               fallback to highest studio_score if no good lifestyle
//   panelImageUrl ← highest studio_score among non-rejected URLs
//               null if no URL clears studio_score >= 80
//
// This replaces the four prior scattered audits (Build 117 panel, Build 126
// framing, Build 128 panel-strict, Build 128 framing-v2) with ONE consistent
// rule set. No more contradictory thresholds across audits.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) {
  console.error('ERROR: EXPO_PUBLIC_ANTHROPIC_API_KEY not set');
  process.exit(1);
}

const MODEL       = 'claude-haiku-4-5-20251001';
const MAX_TOKENS  = 200;
const CONCURRENCY = 3;
const RETRY_MAX   = 5;
const RETRY_BACKOFF_MS = 4000;

// Pick thresholds. Below these, we won't promote a URL to the slot — even
// the best-of-bad-options gets nullified rather than pretending it's good.
const STUDIO_PROMOTE_THRESHOLD    = 75;   // panelImageUrl needs ≥ 75 studio
const LIFESTYLE_PROMOTE_THRESHOLD = 60;   // imageUrl needs ≥ 60 lifestyle
const STUDIO_FALLBACK_THRESHOLD   = 75;   // imageUrl can fall back to studio ≥ 75 if no lifestyle qualifies

const PROMPT = `You are scoring a product image for an interior-design app's catalog. The app uses each product image in TWO different surfaces with different needs:

(A) USER-FACING surface — Explore page, Shop Room cards. Wants beautiful, aspirational marketing-style images that SELL the product in context.
(B) AI-FACING surface — Hidden 2×2 reference panel sent to flux-2-pro/edit. Wants CLEAN ISOLATED studio shots with no other items, no context.

Score the image on TWO INDEPENDENT axes (0-100 each). Same image can score high on both, neither, or just one.

LIFESTYLE_SCORE (0-100) — fitness for user-facing display:
- 90-100: Full product visible in a beautifully styled scene (rug + art + plants + curtains around a sofa). Magazine-quality. Aspirational.
- 70-89: Full product visible with minimal styling context (one or two complementary items). Clean and attractive.
- 50-69: Full product visible against neutral wall/floor or in minimal scene. Acceptable but not aspirational.
- 30-49: Full product visible on plain studio background. Functional, boring.
- 10-29: Tight crop / partial product visible. Not appealing as a hero photo.
- 0-9: Wrong content (diagram, packaging, no product subject).

STUDIO_SCORE (0-100) — fitness for AI-facing 2×2 panel:
- 90-100: Single product, white or light-gray neutral background, NO other items at all, centered, even lighting, full silhouette visible.
- 70-89: Single product on mostly clean background with at most a faint floor surface or shadow.
- 50-69: Product is the clear subject but minor context visible (corner of wall, single neighboring item).
- 30-49: Lifestyle scene with multiple items competing for attention.
- 10-29: Tight crop of part of the product, OR busy scene with many items.
- 0-9: Wrong content.

HARD REJECTION — independent of both scores. Set rejected=true if ANY:
- Text or numbers overlaid on the image (brand names, "Stain-Resistant", "Easy Assembly", marketing copy, badges)
- Dimension callouts (measurement numbers with arrows or ruler marks: 8ft, 27.5", etc.)
- Multi-angle composites (multiple thumbnails of the same product stitched together — front/side/back grid)
- Feature icons (small graphics promoting product features near text)
- Instructional diagrams (arrows showing assembly, exploded views)
- Watermarks or brand-cover title graphics over the product

Rejected images are POISON for both surfaces — flux reads the text as prompt directives, users see brand graphics instead of products. Reject regardless of how clean the rest looks.

Return ONLY a single-line JSON object:
{"rejected": true|false, "rejection_reason": "text|dimensions|composite|infographic|diagram|watermark|null", "lifestyle_score": <0-100>, "studio_score": <0-100>, "notes": "<one short sentence>"}`;

async function scoreImageOnce(url) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
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
  const startIdx = text.indexOf('{');
  if (startIdx === -1) throw new Error(`No JSON: ${text.slice(0, 120)}`);
  let depth = 0; let endIdx = -1;
  for (let i = startIdx; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  if (endIdx === -1) throw new Error('Unbalanced JSON');
  const parsed = JSON.parse(text.slice(startIdx, endIdx + 1));
  return {
    rejected: parsed.rejected === true,
    rejection_reason: typeof parsed.rejection_reason === 'string' ? parsed.rejection_reason : null,
    lifestyle_score: typeof parsed.lifestyle_score === 'number' ? parsed.lifestyle_score : 0,
    studio_score: typeof parsed.studio_score === 'number' ? parsed.studio_score : 0,
    notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 200) : '',
  };
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
  // Collect all unique http URLs to score: imageUrl, panelImageUrl, images[].
  const urlSet = new Set();
  if (typeof p.imageUrl === 'string' && p.imageUrl.startsWith('http')) urlSet.add(p.imageUrl);
  if (typeof p.panelImageUrl === 'string' && p.panelImageUrl.startsWith('http')) urlSet.add(p.panelImageUrl);
  for (const u of (Array.isArray(p.images) ? p.images : [])) {
    if (typeof u === 'string' && u.startsWith('http')) urlSet.add(u);
  }
  const urls = [...urlSet];
  if (urls.length === 0) return { id: p.id, name: p.name, error: 'no-urls' };

  const scores = {};
  let scoreError = null;
  for (const u of urls) {
    try {
      scores[u] = await scoreImage(u);
    } catch (err) {
      scoreError = err.message.slice(0, 100);
      scores[u] = { rejected: true, rejection_reason: 'api-error', lifestyle_score: 0, studio_score: 0, notes: scoreError };
    }
  }

  // Filter to non-rejected URLs only
  const clean = urls.filter(u => !scores[u].rejected);

  // Pick imageUrl: highest lifestyle, fall back to highest studio
  let pickedImageUrl = null;
  let imageUrlReason = null;
  if (clean.length > 0) {
    const byLifestyle = [...clean].sort((a, b) => scores[b].lifestyle_score - scores[a].lifestyle_score);
    const topL = byLifestyle[0];
    if (scores[topL].lifestyle_score >= LIFESTYLE_PROMOTE_THRESHOLD) {
      pickedImageUrl = topL;
      imageUrlReason = `lifestyle ${scores[topL].lifestyle_score}`;
    } else {
      const byStudio = [...clean].sort((a, b) => scores[b].studio_score - scores[a].studio_score);
      const topS = byStudio[0];
      if (scores[topS].studio_score >= STUDIO_FALLBACK_THRESHOLD) {
        pickedImageUrl = topS;
        imageUrlReason = `studio fallback ${scores[topS].studio_score}`;
      } else {
        pickedImageUrl = topL;
        imageUrlReason = `best available, lifestyle ${scores[topL].lifestyle_score}, studio ${scores[topL].studio_score}`;
      }
    }
  }

  // Pick panelImageUrl: highest studio. Null if nothing clean clears threshold.
  let pickedPanelUrl = null;
  let panelReason = null;
  if (clean.length > 0) {
    const byStudio = [...clean].sort((a, b) => scores[b].studio_score - scores[a].studio_score);
    const topS = byStudio[0];
    if (scores[topS].studio_score >= STUDIO_PROMOTE_THRESHOLD) {
      pickedPanelUrl = topS;
      panelReason = `studio ${scores[topS].studio_score}`;
    } else {
      panelReason = `no studio clean enough (best ${scores[topS].studio_score})`;
    }
  } else {
    panelReason = 'all URLs rejected';
  }

  return {
    id: p.id,
    name: (p.name || '').slice(0, 80),
    category: p.category,
    urls,
    scores,
    currentImageUrl: p.imageUrl || null,
    currentPanelImageUrl: typeof p.panelImageUrl === 'string' ? p.panelImageUrl : (p.panelImageUrl === null ? null : 'unset'),
    pickedImageUrl,
    imageUrlReason,
    pickedPanelUrl,
    panelReason,
    imageUrlChanged: (p.imageUrl || null) !== pickedImageUrl,
    panelImageUrlChanged: ((typeof p.panelImageUrl === 'string' ? p.panelImageUrl : null) !== pickedPanelUrl),
    error: scoreError,
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
  const args = process.argv.slice(2);
  const sampleSize = (() => {
    const i = args.indexOf('--sample');
    if (i === -1) return null;
    return parseInt(args[i + 1] || '10', 10);
  })();
  const isFull = args.includes('--full');
  if (!sampleSize && !isFull) {
    console.error('Usage: node scripts/audit-photos-unified.mjs --sample [N] | --full');
    process.exit(1);
  }

  const catalogSrc = path.join(ROOT, 'src/data/productCatalog.js');
  const tmpMjs = path.join(os.tmpdir(), `productCatalog-${Date.now()}.mjs`);
  await fs.copyFile(catalogSrc, tmpMjs);
  const { PRODUCT_CATALOG } = await import(tmpMjs);
  await fs.unlink(tmpMjs).catch(() => {});

  const targets = sampleSize ? PRODUCT_CATALOG.slice(0, sampleSize) : PRODUCT_CATALOG;

  console.log(`Unified photo audit: ${targets.length} products${sampleSize ? ` (SAMPLE)` : ' (FULL)'}…`);
  console.log(`Concurrency ${CONCURRENCY} | Studio promote ≥${STUDIO_PROMOTE_THRESHOLD} | Lifestyle promote ≥${LIFESTYLE_PROMOTE_THRESHOLD}`);
  console.time('unified-audit-elapsed');
  const results = await runWithConcurrency(targets, auditProduct, CONCURRENCY);
  console.timeEnd('unified-audit-elapsed');

  const errors = results.filter(r => r.error);
  const imageChanges = results.filter(r => !r.error && r.imageUrlChanged && r.pickedImageUrl);
  const panelChanges = results.filter(r => !r.error && r.panelImageUrlChanged);
  const panelNullouts = results.filter(r => !r.error && r.pickedPanelUrl === null);

  const summary = {
    timestamp: new Date().toISOString(),
    mode: sampleSize ? `sample-${sampleSize}` : 'full',
    totalProducts: results.length,
    imageUrlChanges: imageChanges.length,
    panelImageUrlChanges: panelChanges.length,
    panelImageUrlNullouts: panelNullouts.length,
    errors: errors.length,
    studioPromoteThreshold: STUDIO_PROMOTE_THRESHOLD,
    lifestylePromoteThreshold: LIFESTYLE_PROMOTE_THRESHOLD,
    studioFallbackThreshold: STUDIO_FALLBACK_THRESHOLD,
    model: MODEL,
  };

  const fileSuffix = sampleSize ? '-sample' : '';
  const jsonPath = path.join(ROOT, `scripts/unified-photo-audit${fileSuffix}.json`);
  const mdPath = path.join(ROOT, `scripts/unified-photo-audit${fileSuffix}.md`);
  await fs.writeFile(jsonPath, JSON.stringify({ summary, results }, null, 2));

  const md = [];
  md.push(`# Unified Photo Audit ${sampleSize ? `(Sample of ${sampleSize})` : '(Full Catalog)'}`);
  md.push('');
  md.push(`**Generated:** ${summary.timestamp}`);
  md.push(`**Thresholds:** studio≥${STUDIO_PROMOTE_THRESHOLD}, lifestyle≥${LIFESTYLE_PROMOTE_THRESHOLD}`);
  md.push('');
  md.push('## Summary');
  md.push(`| Metric | Count |`);
  md.push(`|---|---|`);
  md.push(`| Total | ${summary.totalProducts} |`);
  md.push(`| imageUrl changed | ${summary.imageUrlChanges} |`);
  md.push(`| panelImageUrl changed | ${summary.panelImageUrlChanges} |`);
  md.push(`| panelImageUrl set to null | ${summary.panelImageUrlNullouts} |`);
  md.push(`| Errors | ${summary.errors} |`);
  md.push('');

  if (imageChanges.length > 0) {
    md.push('## imageUrl Changes (Top 50)');
    md.push(`| ID | Reason |`);
    md.push(`|---|---|`);
    imageChanges.slice(0, 50).forEach(r => {
      md.push(`| \`${r.id}\` | ${r.imageUrlReason} |`);
    });
    md.push('');
  }

  await fs.writeFile(mdPath, md.join('\n'));

  console.log('');
  console.log(`imageUrl changes:        ${summary.imageUrlChanges}/${summary.totalProducts}`);
  console.log(`panelImageUrl changes:   ${summary.panelImageUrlChanges}`);
  console.log(`panelImageUrl nullouts:  ${summary.panelImageUrlNullouts}`);
  console.log(`Errors:                  ${summary.errors}`);
  console.log('');
  console.log(`Reports:`);
  console.log(`  ${path.relative(ROOT, jsonPath)}`);
  console.log(`  ${path.relative(ROOT, mdPath)}`);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
