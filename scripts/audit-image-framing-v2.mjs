#!/usr/bin/env node
// scripts/audit-image-framing-v2.mjs
//
// Build 128 — Image Framing Audit v2
//
// Re-audit every product's `imageUrl` for full-product framing. Stricter
// than Build 126's v1 audit:
//   - Threshold raised from 70 → 80 (Build 126's 70 let "tight crops" pass)
//   - No score-delta guard (Build 126 required new ≥ old + 20, which
//     blocked beneficial swaps when the alternative was modestly better)
//   - Re-scores ALL 479 products (not just the borderline ones)
//
// Why: Build 127 TestFlight surfaced multiple Shop Room cards still
// showing zoomed/cropped photos (SAFAVIEH Couture Elyss tight crop,
// JACH 104" L-Shape showing only 2 cushions, HULALA Mid-Century cut off).
// These were likely scored 70-79 in v1 and accepted under the lenient
// threshold, OR scored below 70 but no alternative cleared the +20 delta.

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
const CONCURRENCY = 3;
const RETRY_MAX   = 5;
const RETRY_BACKOFF_MS = 4000;

const FRAMING_THRESHOLD = 80;       // up from v1's 70

const PROMPT = `You are scoring a product image for use as the user-facing hero photo in a shopping app's product card. The card is the user's first signal of what the product is — it must show the FULL product clearly with breathing room.

Score 90-100 ("Perfect full-product framing"):
- Entire product visible from edge to edge
- Generous padding around the product (>=10% margin on each side)
- Single product, no clutter or other items competing for attention
- Centered or near-centered composition

Score 80-89 ("Strong full-product framing"):
- Whole product visible with at most a tight margin
- Clearly recognizable as the product without ambiguity
- Single product is the dominant subject

Score 60-79 ("Tight or context-heavy"):
- Whole product visible but heavily cropped to edges OR
- Product is recognizable but in a styled scene with other items
- Acceptable but not ideal

Score 40-59 ("Partial product / detail crop"):
- A leg, edge, corner, or section is cut off
- OR product fills the frame so tightly that you can't see its silhouette
- User can guess the product but not see it fully

Score 10-39 ("Macro / detail shot"):
- Close-up of a section (fabric weave, hardware, corner)
- Cannot tell what the product is at a glance

Score 0-9 ("Wrong content"):
- Image is a dimension diagram, packaging shot, lifestyle scene with no product subject, or wrong item

Return ONLY a JSON object on a single line: {"score": <0-100>, "reason": "<one short sentence>"}`;

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
  const heroUrl = p.imageUrl;
  if (!heroUrl || !heroUrl.startsWith('http')) {
    return { id: p.id, name: p.name, error: 'no-imageUrl' };
  }

  let heroResult;
  try {
    heroResult = await scoreImage(heroUrl);
  } catch (err) {
    return { id: p.id, name: (p.name || '').slice(0, 80), error: `api-error: ${(err.message || '').slice(0, 100)}` };
  }

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

  // v2 — accept any improvement; no score-delta guard. The hero is already
  // below threshold by definition (we wouldn't be here otherwise), so any
  // higher-scoring alternative is a net win even if marginal.
  const useReplacement = best && best.score > heroResult.score;

  return {
    id: p.id,
    name: (p.name || '').slice(0, 80),
    currentImageUrl: heroUrl,
    heroScore: heroResult.score,
    heroReason: heroResult.reason,
    needsReplacement: true,
    candidateScores,
    bestReplacement: useReplacement ? best.url : null,
    bestReplacementScore: useReplacement ? best.score : null,
    bestMeetsThreshold: best ? best.score >= FRAMING_THRESHOLD : false,
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
    console.error('Usage: node scripts/audit-image-framing-v2.mjs --sample [N] | --full');
    process.exit(1);
  }

  const catalogSrc = path.join(ROOT, 'src/data/productCatalog.js');
  const tmpMjs = path.join(os.tmpdir(), `productCatalog-${Date.now()}.mjs`);
  await fs.copyFile(catalogSrc, tmpMjs);
  const { PRODUCT_CATALOG } = await import(tmpMjs);
  await fs.unlink(tmpMjs).catch(() => {});

  const targets = sampleSize ? PRODUCT_CATALOG.slice(0, sampleSize) : PRODUCT_CATALOG;

  console.log(`Framing audit v2: ${targets.length} products${sampleSize ? ` (SAMPLE)` : ' (FULL)'}…`);
  console.log(`Threshold: ${FRAMING_THRESHOLD} (up from v1's 70) | No score-delta guard | Concurrency: ${CONCURRENCY}`);
  console.time('framing-v2-elapsed');
  const results = await runWithConcurrency(targets, auditProduct, CONCURRENCY);
  console.timeEnd('framing-v2-elapsed');

  const errors = results.filter(r => r.error);
  const heroOk = results.filter(r => !r.error && !r.needsReplacement);
  const replaced = results.filter(r => !r.error && r.needsReplacement && r.bestReplacement);
  const noAlt = results.filter(r => !r.error && r.needsReplacement && !r.bestReplacement);

  const summary = {
    timestamp: new Date().toISOString(),
    mode: sampleSize ? `sample-${sampleSize}` : 'full',
    totalProducts: results.length,
    heroOk: heroOk.length,
    replacementAvailable: replaced.length,
    noAlternativesAvailable: noAlt.length,
    errors: errors.length,
    threshold: FRAMING_THRESHOLD,
    model: MODEL,
  };

  const fileSuffix = sampleSize ? '-sample' : '';
  const jsonPath = path.join(ROOT, `scripts/framing-v2-audit${fileSuffix}.json`);
  const mdPath = path.join(ROOT, `scripts/framing-v2-audit${fileSuffix}.md`);
  await fs.writeFile(jsonPath, JSON.stringify({ summary, results }, null, 2));

  const md = [];
  md.push(`# Image Framing Audit v2 ${sampleSize ? `(Sample)` : '(Full Catalog)'}`);
  md.push('');
  md.push(`**Generated:** ${summary.timestamp}`);
  md.push(`**Threshold:** ${FRAMING_THRESHOLD} (strict — no score-delta guard)`);
  md.push('');
  md.push('## Summary');
  md.push(`| Metric | Count |`);
  md.push(`|---|---|`);
  md.push(`| Total | ${summary.totalProducts} |`);
  md.push(`| Hero OK | ${summary.heroOk} |`);
  md.push(`| Replacement available | ${summary.replacementAvailable} |`);
  md.push(`| No alternative | ${summary.noAlternativesAvailable} |`);
  md.push(`| Errors | ${summary.errors} |`);
  md.push('');

  if (replaced.length > 0) {
    md.push('## Replacements');
    md.push(`| ID | Old | New | Reason |`);
    md.push(`|---|---|---|---|`);
    replaced.slice(0, 100).forEach(r => {
      md.push(`| \`${r.id}\` | ${r.heroScore} | ${r.bestReplacementScore} | ${(r.heroReason || '').replace(/\|/g, '\\|').slice(0, 80)} |`);
    });
  }

  await fs.writeFile(mdPath, md.join('\n'));

  console.log('');
  console.log(`Hero OK:                ${summary.heroOk}/${summary.totalProducts}`);
  console.log(`Replacements available: ${summary.replacementAvailable}`);
  console.log(`No alternative:         ${summary.noAlternativesAvailable}`);
  console.log(`Errors:                 ${summary.errors}`);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
