#!/usr/bin/env node
// scripts/audit-panel-strict-v2.mjs
//
// Build 130 — Strict Panel Cell Audit (Theory: panel cells fight each other
// when they contain room scenes; FAL synthesizes its own room rather than
// treating cells as discrete product references).
//
// What this audits:
//   For each product in productCatalog.js that has a non-null panelImageUrl,
//   re-score the URL against a STRICTER criterion:
//     - Pure product on plain ground (white/light-gray)
//     - NO surrounding furniture, walls, decor, props, plants, books
//     - NO color text overlays
//
// What this CHANGES:
//   - Products that fail the strict criterion get panelImageUrl = null,
//     causing them to fall back to imageUrl in the panel (lifestyle photo,
//     same as today for products without panelImageUrl).
//   - Products that pass keep their current panelImageUrl.
//
// This is a TIGHTENING of the Build 129 unified audit — same scoring axis
// (studio_score) but a stricter pass threshold for panel-suitability.
//
// COST ESTIMATE (run only with explicit user approval):
//   ~280 products × ~1 URL each (just panelImageUrl) = ~280 vision calls
//   Haiku 4.5: ~1500 input tokens × $1/M = ~$0.42 in
//   Plus ~100 output tokens × $5/M × 280 = ~$0.14 out
//   TOTAL: ~$0.55–$0.80
//
// USAGE:
//   node scripts/audit-panel-strict-v2.mjs --dry-run   # writes JSON, no catalog change
//   node scripts/audit-panel-strict-v2.mjs --apply     # rewrites productCatalog.js
//
// SAFETY:
//   - Always run --dry-run first; review panel-strict-v2-audit.json
//   - --apply creates a .bak-build130 backup before writing
//   - Concurrent calls capped at 3, retry max 5, backoff 4000ms

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) {
  console.error('ERROR: EXPO_PUBLIC_ANTHROPIC_API_KEY not set');
  console.error('       export EXPO_PUBLIC_ANTHROPIC_API_KEY=sk-ant-... and retry.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const MODEL       = 'claude-haiku-4-5-20251001';
const MAX_TOKENS  = 100;
const CONCURRENCY = 3;
const RETRY_MAX   = 5;
const RETRY_BACKOFF_MS = 4000;

// Strict pass threshold. Below this, panelImageUrl is nullified.
// Tighter than Build 129's 75 — we want only TRULY clean studio shots
// to feed FAL's panel.
const STRICT_PASS_THRESHOLD = 80;

const CATALOG_PATH = path.join(ROOT, 'src/data/productCatalog.js');
const AUDIT_PATH   = path.join(ROOT, 'scripts/panel-strict-v2-audit.json');

const PROMPT = `You are evaluating a product image's fitness as a STRICT 2×2 reference panel cell for an AI image-edit model (FAL flux-2-pro/edit).

The model treats each cell as: "render THIS exact product into the room photo." If the cell contains room context (walls, floors, other furniture, decor, plants, books, lamps, art, rugs, curtains), the model gets confused and either renders the wrong product, swaps colors, or invents a new room scene.

Score 0-100 on STRICT_STUDIO_FITNESS:
- 95-100: Single product on PURE white or light-gray seamless background, no shadows beyond a soft floor shadow, NO other items visible, NO text/dimensions, full silhouette centered. Photo studio quality.
- 80-94: Single product on mostly clean background; minor floor shadow or single seamless backdrop OK; no surrounding furniture/walls/decor.
- 60-79: Product clearly the subject but ONE neighboring object visible (a single small prop, faint corner of a wall, or stylized backdrop element).
- 40-59: Product visible in a small styled vignette (one rug + one wall, or product + 1 plant). Multiple items competing.
- 20-39: Product is part of a full room scene (sofa with art on wall + plant + lamp + window).
- 0-19: Tight crop, partial product, busy multi-product image, or wrong content (diagram/packaging).

Also detect HARD REJECTION (sets the result to 0 regardless of other signals):
- Text overlays / dimension callouts / brand banners / size charts / instruction diagrams / multi-thumbnail composites / "as seen in" badges.

Return JSON ONLY:
{ "score": 0-100, "rejected": true/false, "reason": "<8 words" }`;

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
      const t = await res.text();
      return { score: 0, rejected: true, reason: `http_${res.status}`, error: t.substring(0, 100) };
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { score: 0, rejected: true, reason: 'no-json', raw: text.substring(0, 100) };
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
    return { score: 0, rejected: true, reason: 'fetch-fail', error: String(e).substring(0, 100) };
  }
}

// Inline catalog parser — extracts id + panelImageUrl pairs without requiring
// the catalog to be JSON. Same approach as the Build 129 unified audit.
async function parseCatalog() {
  const source = await fs.readFile(CATALOG_PATH, 'utf8');
  const products = [];
  // Walk every product block. id + panelImageUrl extraction only.
  const idRe = /\bid:\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = idRe.exec(source)) !== null) {
    const id = m[1];
    // Find the panelImageUrl within ~3000 chars after this id
    const window = source.slice(m.index, m.index + 3000);
    const pm = window.match(/panelImageUrl:\s*(?:['"`]([^'"`]+)['"`]|null)/);
    if (!pm) continue;
    const panelImageUrl = pm[1] || null;
    if (panelImageUrl) products.push({ id, panelImageUrl });
  }
  // Dedupe by id (variants might collide on regex)
  const seen = new Set();
  return products.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

async function main() {
  console.log('Build 130 — Strict Panel Cell Audit');
  console.log('====================================');
  const products = await parseCatalog();
  console.log(`Found ${products.length} products with panelImageUrl set (will be audited)`);
  console.log(APPLY ? '🔧 APPLY mode — will rewrite catalog' : '👀 DRY RUN — writes JSON only');
  console.log('');

  const results = [];
  let i = 0;
  async function worker() {
    while (i < products.length) {
      const idx = i++;
      const p = products[idx];
      const score = await scoreUrl(p.panelImageUrl);
      results[idx] = { id: p.id, panelImageUrl: p.panelImageUrl, ...score };
      if ((idx + 1) % 20 === 0 || idx === products.length - 1) {
        console.log(`  [${idx + 1}/${products.length}] avg score so far: ${(results.filter(r => r).reduce((a, r) => a + r.score, 0) / (idx + 1)).toFixed(1)}`);
      }
    }
  }
  await Promise.all(Array(CONCURRENCY).fill(0).map(() => worker()));

  // Compute changes — products that fail the strict threshold get nullified.
  const toNull = results.filter(r => r.rejected || r.score < STRICT_PASS_THRESHOLD);
  console.log('');
  console.log(`Strict threshold: ${STRICT_PASS_THRESHOLD}`);
  console.log(`Total audited:   ${results.length}`);
  console.log(`Pass:            ${results.length - toNull.length}`);
  console.log(`Will null-out:   ${toNull.length}`);
  console.log('');

  await fs.writeFile(AUDIT_PATH, JSON.stringify({ threshold: STRICT_PASS_THRESHOLD, results }, null, 2));
  console.log(`✅ Wrote audit JSON: ${path.relative(ROOT, AUDIT_PATH)}`);

  if (!APPLY) {
    console.log('');
    console.log('(Dry run — to commit nullouts, re-run with --apply.)');
    return;
  }

  // Apply: read catalog, set panelImageUrl=null for failing products
  console.log('');
  console.log('Applying nullouts to catalog...');
  let catalog = await fs.readFile(CATALOG_PATH, 'utf8');
  const bak = CATALOG_PATH + '.bak-build130';
  await fs.copyFile(CATALOG_PATH, bak);

  let applied = 0;
  for (const r of toNull) {
    const idRe = new RegExp(`\\bid:\\s*['"\`]${r.id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}['"\`]`);
    const m = idRe.exec(catalog);
    if (!m) continue;
    const window = catalog.slice(m.index, m.index + 3000);
    const newWindow = window.replace(/panelImageUrl:\s*['"`][^'"`]+['"`]/, 'panelImageUrl: null');
    if (newWindow !== window) {
      catalog = catalog.slice(0, m.index) + newWindow + catalog.slice(m.index + 3000);
      applied++;
    }
  }
  await fs.writeFile(CATALOG_PATH, catalog);
  console.log(`✅ Applied ${applied} nullouts. Backup: ${path.relative(ROOT, bak)}`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
