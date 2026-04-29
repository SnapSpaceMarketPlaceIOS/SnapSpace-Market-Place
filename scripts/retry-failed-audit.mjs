#!/usr/bin/env node
// scripts/retry-failed-audit.mjs
//
// Re-audits ONLY products that hit rate-limit failures in the initial pass
// (panel-audit.json). Uses lower concurrency + exponential backoff on 429
// to recover the chosenScore=null products without re-spending Haiku calls
// on the 182 already-clean ones.
//
// Merges results in-place into panel-audit.json. Safe to run multiple times.

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

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 120;
const CONCURRENCY = 3;            // dropped from 8 — much gentler on rate limits
const RETRY_MAX = 5;              // up from 2 — ride out Anthropic's 429 windows
const RETRY_BACKOFF_BASE_MS = 4000;

const HEAVY_CATEGORIES = new Set([
  'sofa', 'sectional', 'bed', 'dining-table', 'dining-set', 'sectional-sofa',
]);
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
    err.retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
    throw err;
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text || '';
  const match = text.match(/\{[^{}]*"score"[^{}]*\}/);
  if (!match) throw new Error(`No JSON in response: ${text.slice(0, 120)}`);
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
      // Don't retry non-429 4xx errors
      if (err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw err;
      }
      if (attempt < RETRY_MAX) {
        // Honor Retry-After header if present, else exponential backoff
        const waitMs = err.retryAfter > 0
          ? err.retryAfter * 1000 + 500
          : RETRY_BACKOFF_BASE_MS * Math.pow(1.6, attempt - 1);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }
  throw lastErr;
}

async function auditProduct(p) {
  const candidateUrls = [
    p.imageUrl,
    ...(Array.isArray(p.images) ? p.images : []),
  ]
    .filter(u => typeof u === 'string' && u.startsWith('http'))
    .filter((u, i, arr) => arr.indexOf(u) === i);

  if (candidateUrls.length === 0) {
    return { id: p.id, name: p.name, category: p.category, error: 'no-images' };
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
  console.log('');
  return results;
}

(async () => {
  // Load existing audit
  const auditPath = path.join(ROOT, 'scripts/panel-audit.json');
  const existing = JSON.parse(await fs.readFile(auditPath, 'utf8'));

  // Identify failures: chosenScore === null (all images errored on 429)
  const failedIds = new Set(
    existing.results.filter(r => r.chosenScore === null && !r.error).map(r => r.id)
  );

  if (failedIds.size === 0) {
    console.log('No 429-failed products to retry. Audit is clean.');
    return;
  }

  console.log(`Retrying ${failedIds.size} previously-failed products at concurrency=${CONCURRENCY}…`);

  // Load catalog same way as audit-panel-images.mjs
  const catalogSrc = path.join(ROOT, 'src/data/productCatalog.js');
  const tmpMjs     = path.join(os.tmpdir(), `productCatalog-retry-${Date.now()}.mjs`);
  await fs.copyFile(catalogSrc, tmpMjs);
  const { PRODUCT_CATALOG } = await import(tmpMjs);
  await fs.unlink(tmpMjs).catch(() => {});

  const targets = PRODUCT_CATALOG.filter(p => failedIds.has(p.id));
  console.log(`Found ${targets.length}/${failedIds.size} matching products in catalog`);

  console.time('retry-elapsed');
  const retryResults = await runWithConcurrency(targets, auditProduct, CONCURRENCY);
  console.timeEnd('retry-elapsed');

  // Merge: replace failed entries with retry results
  const byId = new Map(retryResults.map(r => [r.id, r]));
  const mergedResults = existing.results.map(r => byId.get(r.id) || r);

  // Recompute summary
  const errors        = mergedResults.filter(r => r.error);
  const autoPicked    = mergedResults.filter(r => !r.error && !r.needsManualPick);
  const needsManual   = mergedResults.filter(r => !r.error && r.needsManualPick);
  const heavyManual   = needsManual.filter(r => r.isHeavy);

  const summary = {
    timestamp:        new Date().toISOString(),
    mode:             existing.summary.mode + ' + retry',
    totalProducts:    mergedResults.length,
    autoPicked:       autoPicked.length,
    needsManualPick:  needsManual.length,
    heavyManualPick:  heavyManual.length,
    errors:           errors.length,
    model:            MODEL,
    retried:          targets.length,
  };

  await fs.writeFile(
    auditPath,
    JSON.stringify({ summary, results: mergedResults }, null, 2)
  );

  // Recovery numbers
  const stillFailed = retryResults.filter(r => r.chosenScore === null && !r.error).length;
  const recovered = targets.length - stillFailed;

  console.log('');
  console.log(`Recovered ${recovered}/${targets.length} previously-failed products`);
  console.log(`Total: auto=${summary.autoPicked} manual=${summary.needsManualPick} heavy-manual=${summary.heavyManualPick} errors=${summary.errors}`);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
