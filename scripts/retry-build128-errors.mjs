#!/usr/bin/env node
// scripts/retry-build128-errors.mjs
//
// Retries the 37 products that hit HTTP 429 in panel-strict + framing-v2
// audits. Uses concurrency=1 + 8s backoff to guarantee no further rate-limit
// hits. Merges results back into the JSON files so apply scripts work
// directly off the corrected output.

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
const RETRY_BACKOFF_MS = 8000;
const MAX_ATTEMPTS = 5;

const PANEL_PROMPT = `You are scoring a product image as a reference cell for an AI room-rendering pipeline. The model (flux-2-pro/edit) will read this image as a 256-pixel cell in a 2×2 panel and try to place ONLY the named product into a user's room photo.

This audit is STRICTER than a generic "studio shot" check. Score 0-100. Anything that violates the disqualifiers gets a HARD REJECT regardless of how clean the rest of the image looks.

HARD DISQUALIFIERS (auto-cap score at 30 if ANY of these are present):
- ANY text or numbers overlaid on the image: brand names, feature labels ("Stain-Resistant", "Open Storage", "Easy Organization"), marketing copy, badges
- Dimension callouts: measurement numbers with arrows or ruler marks (e.g. "8ft", "27.5\"", "10ft × 8ft")
- Multi-angle composites: multiple thumbnails of the same product stitched into one image (e.g. front view + side view + back view in a grid)
- Feature icons: small graphics promoting product features
- Watermark or logo placed over the product itself

ACCEPT TIERS (only if ZERO disqualifiers):
- Score 90-100: Perfect — single product, white/light-gray background, no other items, centered framing
- Score 80-89: Acceptable — slight floor surface or subtle shadow but product fully isolated
- Score 60-79: Borderline — minor context but no other products visible
- Score 40-59: Lifestyle leaning
- Score 0-39: Full lifestyle scene OR ANY disqualifier

Return ONLY a JSON object on a single line: {"score": <0-100>, "reason": "<one short sentence>"}`;

const FRAMING_PROMPT = `You are scoring a product image for use as the user-facing hero photo in a shopping app's product card.

Score 90-100: Perfect — entire product visible, generous margins, centered, single product
Score 80-89: Strong — whole product visible with at most a tight margin
Score 60-79: Tight or context-heavy — visible but heavily cropped or in styled scene
Score 40-59: Partial — leg/edge cut off or fills frame too tight
Score 10-39: Macro/detail shot
Score 0-9: Wrong content (diagram, packaging, no product)

Return ONLY a JSON object on a single line: {"score": <0-100>, "reason": "<one short sentence>"}`;

async function scoreImage(url, promptText) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL, max_tokens: 120,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'url', url } },
            { type: 'text', text: promptText },
          ]}],
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
      const m = text.match(/\{[^{}]*"score"[^{}]*\}/);
      if (!m) throw new Error(`No JSON: ${text.slice(0, 120)}`);
      const parsed = JSON.parse(m[0]);
      if (typeof parsed.score !== 'number') throw new Error('Bad score');
      return parsed;
    } catch (err) {
      lastErr = err;
      if (err.status >= 400 && err.status < 500 && err.status !== 429) throw err;
      if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * attempt));
    }
  }
  throw lastErr;
}

async function retryPanel(p) {
  const url = p.panelImageUrl;
  if (!url) return { id: p.id, name: p.name, error: 'no-panelImageUrl' };
  let currentResult;
  try {
    currentResult = await scoreImage(url, PANEL_PROMPT);
  } catch (err) {
    return { id: p.id, name: p.name, error: `api-error: ${err.message.slice(0, 100)}` };
  }
  if (currentResult.score >= 80) {
    return { id: p.id, name: p.name, currentPanel: url, currentScore: currentResult.score, currentReason: currentResult.reason, needsReplacement: false };
  }
  const candidateUrls = (Array.isArray(p.images) ? p.images : [])
    .filter(u => typeof u === 'string' && u.startsWith('http') && u !== url)
    .filter((u, i, arr) => arr.indexOf(u) === i);
  const candidateScores = [];
  for (const u of candidateUrls) {
    try {
      const r = await scoreImage(u, PANEL_PROMPT);
      candidateScores.push({ url: u, score: r.score, reason: r.reason });
    } catch (err) {
      candidateScores.push({ url: u, score: -1, reason: `error: ${err.message.slice(0, 80)}` });
    }
  }
  const valid = candidateScores.filter(s => s.score >= 0).sort((a,b) => b.score - a.score);
  const best = valid[0];
  const useReplacement = best && best.score >= 80;
  const setNull = !useReplacement && currentResult.score < 50;
  return {
    id: p.id, name: p.name, currentPanel: url, currentScore: currentResult.score, currentReason: currentResult.reason,
    needsReplacement: true, candidateScores, bestReplacement: useReplacement ? best.url : null,
    bestReplacementScore: useReplacement ? best.score : null, setNull,
  };
}

async function retryFraming(p) {
  const url = p.imageUrl;
  if (!url) return { id: p.id, name: p.name, error: 'no-imageUrl' };
  let heroResult;
  try {
    heroResult = await scoreImage(url, FRAMING_PROMPT);
  } catch (err) {
    return { id: p.id, name: p.name, error: `api-error: ${err.message.slice(0, 100)}` };
  }
  if (heroResult.score >= 80) {
    return { id: p.id, name: p.name, currentImageUrl: url, heroScore: heroResult.score, heroReason: heroResult.reason, needsReplacement: false };
  }
  const candidateUrls = (Array.isArray(p.images) ? p.images : [])
    .filter(u => typeof u === 'string' && u.startsWith('http') && u !== url)
    .filter((u, i, arr) => arr.indexOf(u) === i);
  if (candidateUrls.length === 0) {
    return { id: p.id, name: p.name, currentImageUrl: url, heroScore: heroResult.score, heroReason: heroResult.reason, needsReplacement: true, candidateScores: [], bestReplacement: null, bestReplacementScore: null, noAlternativesAvailable: true };
  }
  const candidateScores = [];
  for (const u of candidateUrls) {
    try {
      const r = await scoreImage(u, FRAMING_PROMPT);
      candidateScores.push({ url: u, score: r.score, reason: r.reason });
    } catch (err) {
      candidateScores.push({ url: u, score: -1, reason: `error: ${err.message.slice(0, 80)}` });
    }
  }
  const valid = candidateScores.filter(s => s.score >= 0).sort((a,b) => b.score - a.score);
  const best = valid[0];
  const useReplacement = best && best.score > heroResult.score;
  return {
    id: p.id, name: p.name, currentImageUrl: url, heroScore: heroResult.score, heroReason: heroResult.reason,
    needsReplacement: true, candidateScores,
    bestReplacement: useReplacement ? best.url : null, bestReplacementScore: useReplacement ? best.score : null,
    bestMeetsThreshold: best ? best.score >= 80 : false,
  };
}

(async () => {
  const catalogSrc = path.join(ROOT, 'src/data/productCatalog.js');
  const tmpMjs = path.join(os.tmpdir(), `productCatalog-${Date.now()}.mjs`);
  await fs.copyFile(catalogSrc, tmpMjs);
  const { PRODUCT_CATALOG } = await import(tmpMjs);
  await fs.unlink(tmpMjs).catch(() => {});

  // ── Panel retry ──
  const panelPath = path.join(ROOT, 'scripts/panel-strict-audit.json');
  const panelAudit = JSON.parse(await fs.readFile(panelPath, 'utf8'));
  const panelFailedIds = new Set(
    panelAudit.results.filter(r => r.error && /HTTP 429|No JSON/i.test(r.error)).map(r => r.id)
  );
  const panelTargets = PRODUCT_CATALOG.filter(p => panelFailedIds.has(p.id));
  console.log(`Panel retry: ${panelTargets.length} products (concurrency=1)`);
  for (let i = 0; i < panelTargets.length; i++) {
    const r = await retryPanel(panelTargets[i]);
    const idx = panelAudit.results.findIndex(x => x.id === r.id);
    if (idx >= 0) panelAudit.results[idx] = r;
    process.stdout.write(`  panel [${i+1}/${panelTargets.length}]\r`);
  }
  console.log('');

  // ── Framing retry ──
  const framingPath = path.join(ROOT, 'scripts/framing-v2-audit.json');
  const framingAudit = JSON.parse(await fs.readFile(framingPath, 'utf8'));
  const framingFailedIds = new Set(
    framingAudit.results.filter(r => r.error && /HTTP 429|No JSON/i.test(r.error)).map(r => r.id)
  );
  const framingTargets = PRODUCT_CATALOG.filter(p => framingFailedIds.has(p.id));
  console.log(`Framing retry: ${framingTargets.length} products (concurrency=1)`);
  for (let i = 0; i < framingTargets.length; i++) {
    const r = await retryFraming(framingTargets[i]);
    const idx = framingAudit.results.findIndex(x => x.id === r.id);
    if (idx >= 0) framingAudit.results[idx] = r;
    process.stdout.write(`  framing [${i+1}/${framingTargets.length}]\r`);
  }
  console.log('');

  // Recompute summaries
  const pErr = panelAudit.results.filter(r => r.error && !/no-panelImageUrl/.test(r.error));
  const pOk = panelAudit.results.filter(r => !r.error && !r.needsReplacement);
  const pRepl = panelAudit.results.filter(r => !r.error && r.needsReplacement && r.bestReplacement);
  const pNull = panelAudit.results.filter(r => !r.error && r.needsReplacement && r.setNull && !r.bestReplacement);
  panelAudit.summary.panelOk = pOk.length;
  panelAudit.summary.replacementAvailable = pRepl.length;
  panelAudit.summary.setNull = pNull.length;
  panelAudit.summary.errors = pErr.length;
  await fs.writeFile(panelPath, JSON.stringify(panelAudit, null, 2));

  const fErr = framingAudit.results.filter(r => r.error);
  const fOk = framingAudit.results.filter(r => !r.error && !r.needsReplacement);
  const fRepl = framingAudit.results.filter(r => !r.error && r.needsReplacement && r.bestReplacement);
  const fNoAlt = framingAudit.results.filter(r => !r.error && r.needsReplacement && !r.bestReplacement);
  framingAudit.summary.heroOk = fOk.length;
  framingAudit.summary.replacementAvailable = fRepl.length;
  framingAudit.summary.noAlternativesAvailable = fNoAlt.length;
  framingAudit.summary.errors = fErr.length;
  await fs.writeFile(framingPath, JSON.stringify(framingAudit, null, 2));

  console.log('');
  console.log(`After retry:`);
  console.log(`  Panel — OK: ${pOk.length} | Repl: ${pRepl.length} | Null: ${pNull.length} | Real errors: ${pErr.length}`);
  console.log(`  Framing — OK: ${fOk.length} | Repl: ${fRepl.length} | NoAlt: ${fNoAlt.length} | Real errors: ${fErr.length}`);
})().catch(err => { console.error('FATAL:', err); process.exit(1); });
