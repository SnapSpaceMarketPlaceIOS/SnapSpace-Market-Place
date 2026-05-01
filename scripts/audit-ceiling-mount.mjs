#!/usr/bin/env node
// scripts/audit-ceiling-mount.mjs
//
// Build 132 — Ceiling-Mount Panel-Cell Strict Audit
//
// PROBLEM: Chandelier and pendant-light panel cells in user-facing renders
// (dining-room, kitchen) frequently come from lifestyle photos that show
// the FIXTURE HANGING FROM A CEILING. Those ceiling artifacts (tray
// ceilings, coffered ceilings, wainscoting visible on walls) bleed into
// the rendered room as if they were part of the user's actual ceiling.
//
// User testing (2026-05-01, Scandinavian dining test): user's flat
// ceiling with fan became a tray ceiling with chandelier in the render —
// because the chandelier panel cell showed a chandelier hanging from a
// tray ceiling.
//
// SOLUTION: For chandelier + pendant-light + wall-light products, score
// EVERY candidate URL (imageUrl + panelImageUrl + first 3 of images[]),
// promote the cleanest "fixture-only against neutral background" URL to
// panelImageUrl. Products with no clean candidate get panelImageUrl=null
// (panel falls back to imageUrl, same as today's behavior for the 25
// ceiling-mount products that already have panelImageUrl=null).
//
// COST: ~29 products × ~3 URLs = ~87 vision calls × $0.003 = ~$0.26
// One-time. Not recurring.
//
// USAGE:
//   node scripts/audit-ceiling-mount.mjs           # dry-run
//   node scripts/audit-ceiling-mount.mjs --apply   # rewrites catalog

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) {
  console.error('ERROR: EXPO_PUBLIC_ANTHROPIC_API_KEY not set');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const MODEL       = 'claude-haiku-4-5-20251001';
const MAX_TOKENS  = 100;
const CONCURRENCY = 3;
const RETRY_MAX   = 4;
const RETRY_BACKOFF_MS = 4000;

// Threshold to PROMOTE a URL to panelImageUrl. Below this, no promotion.
const PROMOTE_THRESHOLD = 75;

const CATALOG_PATH = path.join(ROOT, 'src/data/productCatalog.js');
const AUDIT_PATH   = path.join(ROOT, 'scripts/ceiling-mount-audit.json');

const PROMPT = `You are evaluating a ceiling-mounted light fixture's product image for use as a clean reference cell in a 2×2 grid sent to an AI image-edit model.

The model uses each cell to learn "what does THIS light fixture look like." If the cell shows the fixture HANGING FROM A CEILING (tray ceiling, coffered ceiling, painted molding, chandelier medallion, etc.) or surrounded by ROOM CONTEXT (walls, wainscoting, dining table below, etc.), the model interprets those architectural elements as PART OF THE FIXTURE'S CONTEXT and renders them in the user's room.

Score CEILING_CLEANLINESS on a 0-100 scale:
- 95-100: Fixture isolated against pure white/light-gray seamless background. Just the fixture. NO ceiling, NO walls, NO furniture.
- 80-94: Fixture against mostly-clean background with at most a faint ceiling shadow or a thin neutral mounting plate visible.
- 60-79: Fixture clearly the subject but ONE minor element of context visible (faint ceiling line, single wall corner).
- 40-59: Fixture mounted to a visible ceiling panel that's mostly neutral (white drywall ceiling).
- 20-39: Fixture in a styled scene — visible ceiling with architecture (tray, coffered, painted), wainscoting, OR room below.
- 0-19: Tight crop, fully styled lifestyle scene, multiple competing items, or wrong content.

Also detect HARD REJECTION (sets score to 0):
- Text overlays / dimension callouts / brand banners / multi-thumbnail composites / instructional diagrams / "as seen in" badges.

Return JSON ONLY: { "score": 0-100, "rejected": true/false, "reason": "<8 words" }`;

async function scoreUrl(url, attempt = 0) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':          ANTHROPIC_KEY,
        'anthropic-version':  '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url } },
            { type: 'text',  text: PROMPT },
          ],
        }],
      }),
    });
    if (!res.ok) {
      if (res.status === 429 && attempt < RETRY_MAX) {
        await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * (attempt + 1)));
        return scoreUrl(url, attempt + 1);
      }
      return { score: 0, rejected: true, reason: 'http_' + res.status };
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { score: 0, rejected: true, reason: 'no-json' };
    try {
      const parsed = JSON.parse(m[0]);
      return {
        score: Number(parsed.score) || 0,
        rejected: Boolean(parsed.rejected),
        reason: String(parsed.reason || '').substring(0, 60),
      };
    } catch (e) {
      return { score: 0, rejected: true, reason: 'parse-fail' };
    }
  } catch (e) {
    if (attempt < RETRY_MAX) {
      await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * (attempt + 1)));
      return scoreUrl(url, attempt + 1);
    }
    return { score: 0, rejected: true, reason: 'fetch-fail' };
  }
}

async function getCatalog() {
  const { PRODUCT_CATALOG } = await import('file://' + CATALOG_PATH);
  return PRODUCT_CATALOG.filter(p =>
    ['chandelier', 'pendant-light', 'wall-light'].includes(p.category)
  );
}

async function main() {
  console.log('Build 132 — Ceiling-Mount Panel-Cell Audit');
  console.log('============================================');
  const products = await getCatalog();
  console.log('Found ' + products.length + ' ceiling-mount products');
  console.log(APPLY ? '🔧 APPLY mode — will rewrite catalog' : '👀 DRY RUN — writes JSON only');

  // Build URL list: for each product, score imageUrl + panelImageUrl + first 3 images[].
  const tasks = [];
  for (const p of products) {
    const urls = new Set();
    if (p.imageUrl) urls.add(p.imageUrl);
    if (p.panelImageUrl) urls.add(p.panelImageUrl);
    if (Array.isArray(p.images)) {
      for (const u of p.images.slice(0, 3)) if (u) urls.add(u);
    }
    for (const url of urls) tasks.push({ id: p.id, category: p.category, name: p.name, url });
  }
  console.log('Total URLs to score: ' + tasks.length);
  console.log('Estimated cost: $' + (tasks.length * 0.003).toFixed(2));
  console.log('');

  const results = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      const t = tasks[idx];
      const score = await scoreUrl(t.url);
      results[idx] = { ...t, ...score };
      if ((idx + 1) % 10 === 0 || idx === tasks.length - 1) {
        console.log('  [' + (idx + 1) + '/' + tasks.length + '] ' + t.id + ' score=' + score.score);
      }
    }
  }
  await Promise.all(Array(CONCURRENCY).fill(0).map(() => worker()));

  // Group by product, pick best URL for panelImageUrl.
  const byProduct = {};
  for (const r of results) {
    if (!byProduct[r.id]) byProduct[r.id] = { id: r.id, category: r.category, name: r.name, urls: [] };
    byProduct[r.id].urls.push({ url: r.url, score: r.score, rejected: r.rejected, reason: r.reason });
  }
  const decisions = [];
  for (const id of Object.keys(byProduct)) {
    const product = byProduct[id];
    product.urls.sort((a, b) => b.score - a.score);
    const best = product.urls[0];
    const newPanelUrl = (best && !best.rejected && best.score >= PROMOTE_THRESHOLD) ? best.url : null;
    decisions.push({ id, category: product.category, name: product.name, newPanelUrl, bestScore: best?.score || 0, urls: product.urls });
  }

  await fs.writeFile(AUDIT_PATH, JSON.stringify({ threshold: PROMOTE_THRESHOLD, decisions }, null, 2));
  console.log('');
  console.log('✅ Wrote audit JSON: ' + path.relative(ROOT, AUDIT_PATH));
  const promoted = decisions.filter(d => d.newPanelUrl).length;
  const nullified = decisions.filter(d => !d.newPanelUrl).length;
  console.log('Will set panelImageUrl: ' + promoted);
  console.log('Will null-out panelImageUrl: ' + nullified);

  if (!APPLY) {
    console.log('');
    console.log('(Dry run — review JSON, then re-run with --apply.)');
    return;
  }

  // Apply: rewrite each product's panelImageUrl in the catalog source.
  console.log('');
  console.log('Applying changes to catalog...');
  let catalog = await fs.readFile(CATALOG_PATH, 'utf8');
  await fs.copyFile(CATALOG_PATH, CATALOG_PATH + '.bak-build132');

  let applied = 0;
  for (const d of decisions) {
    const idRe = new RegExp(`\\bid:\\s*['"\`]${d.id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}['"\`]`);
    const m = idRe.exec(catalog);
    if (!m) continue;
    const window = catalog.slice(m.index, m.index + 4000);
    const newPanelLiteral = d.newPanelUrl
      ? `panelImageUrl: '${d.newPanelUrl.replace(/'/g, "\\'")}'`
      : `panelImageUrl: null`;
    let newWindow;
    if (/panelImageUrl:\s*(?:['"`][^'"`]+['"`]|null)/.test(window)) {
      newWindow = window.replace(/panelImageUrl:\s*(?:['"`][^'"`]+['"`]|null)/, newPanelLiteral);
    } else {
      // Insert panelImageUrl after imageUrl if it doesn't exist yet
      newWindow = window.replace(/(imageUrl:\s*['"`][^'"`]+['"`],?)/, '$1\n    ' + newPanelLiteral + ',');
    }
    if (newWindow !== window) {
      catalog = catalog.slice(0, m.index) + newWindow + catalog.slice(m.index + 4000);
      applied++;
    }
  }
  await fs.writeFile(CATALOG_PATH, catalog);
  console.log('✅ Applied ' + applied + ' changes. Backup: src/data/productCatalog.js.bak-build132');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
