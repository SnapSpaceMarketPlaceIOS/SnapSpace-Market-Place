/**
 * promptBuilders.js — Provider-neutral prompt construction helpers.
 *
 * Build 63 (Gate A): extracted from replicate.js so FAL is the only live
 * generation provider without any dependency on the Replicate module. These
 * functions are pure strings + aspect-ratio math — they never call any AI
 * API. Both fal.js (live) and replicate.js (orphaned, kept for reference)
 * consume them.
 *
 * ── Contents ──────────────────────────────────────────────────────────────
 *   getQualityPrefix()       — editorial quality prefix with rotating light
 *   buildFinalPrompt()       — enriched design-intent fragment (user + hints)
 *   buildPanelPrompt()       — 2×2 panel edit prompt (Ring 1 path)
 *   buildFlux2MaxPrompt()    — individual product refs edit prompt (Ring 2)
 *   pickAspectRatio()        — snap source WxH to supported flux bucket
 *
 * ── Why provider-neutral ──────────────────────────────────────────────────
 * All four prompt strings describe an "edit" operation in model-agnostic
 * language (preserve architecture + place products + maintain style intent).
 * FAL's flux-2-pro/edit and Replicate's flux-2-max both accept the same
 * phrasing. The aspect-ratio bucket list matches flux's supported values
 * and works for either backend.
 */

import { describeProductForPrompt } from '../utils/productDescriptor';

// ── Prompt quality tokens ────────────────────────────────────────────────────
// flux weights EARLY tokens highest. Leading with editorial/sharpness cues
// biases the whole generation toward magazine-quality output. We keep these
// lists short and specific — "8k" and other common LLM noise tokens actually
// degrade flux output, so they are intentionally excluded.
//
// Build 62: the lighting token rotates per-generation across an editorial
// pool to give the same prompt visibly different output moods (was the #1
// "feels like the same room" complaint). Light is a low-risk variation
// because it doesn't change product/architecture semantics — flux can
// "warm afternoon" or "soft morning" the SAME room arrangement and the
// user perceives a different result. We swap ONLY the light token; every
// other word in the prefix stays identical so editorial quality is unchanged.
//
// Build 71 (Commit A): the prefix mode now ALSO swaps between EDITORIAL and
// COZY when the user's prompt reads as warm/lived-in rather than editorial.
// Previously every generation led with "Architectural Digest style" which
// fought cozy prompts toward a staged, magazine look. Mood detection uses
// word-boundary keyword match on the user prompt — COZY keywords swap both
// the opening tokens AND the lighting pool (no "cinematic editorial light"
// when the user asked for a warm reading nook).
const EDITORIAL_LIGHT = [
  'natural light',                     // original baseline — kept in pool
  'warm afternoon light',
  'soft morning light',
  'golden hour glow',
  'north-facing diffused daylight',
  'cinematic editorial light',
];

const COZY_LIGHT = [
  'warm afternoon sidelight',
  'golden hour glow',
  'soft morning window light',
  'warm lamp glow',
  'hearth-side ambient light',
];

const COZY_KEYWORDS = [
  'cozy', 'cosy', 'warm', 'lived-in', 'lived in', 'casual', 'inviting',
  'homey', 'intimate', 'snug', 'rustic', 'farmhouse', 'cottage', 'hygge',
  'comfortable',
];
const COZY_REGEX = new RegExp(
  `\\b(${COZY_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i'
);

function isCozyPrompt(userPrompt) {
  return typeof userPrompt === 'string' && COZY_REGEX.test(userPrompt);
}

/**
 * Returns the quality prefix with a randomly-rotated lighting descriptor.
 * Called ONCE per generation (NOT per retry — retries reuse the same
 * rotation so the prompt-hash stays stable).
 *
 * @param {string} [userPrompt] - User's raw/expanded prompt. Used to pick
 *   EDITORIAL vs COZY mode. Optional for backward compatibility — callers
 *   that pass nothing get the original EDITORIAL behavior.
 */
export function getQualityPrefix(userPrompt) {
  if (isCozyPrompt(userPrompt)) {
    const light = COZY_LIGHT[Math.floor(Math.random() * COZY_LIGHT.length)];
    return `Lived-in interior photography, ${light}, soft tactile detail, inviting atmosphere, documentary style.`;
  }
  const light = EDITORIAL_LIGHT[Math.floor(Math.random() * EDITORIAL_LIGHT.length)];
  return `Editorial architectural photography, ultra-sharp focus, crisp detail, ${light}, magazine-quality interior, Architectural Digest style.`;
}

// Phase 1 of the AI fidelity plan: plain-English fidelity imperatives,
// appended to the end of every edit prompt.
//
// Why we rewrote this in plain English:
// Build 71 used parenthetical weighting like `(directive:1.7)` — that's the
// Stable Diffusion 1.5 / Automatic1111 convention. FAL's flux-2-pro/edit API
// docs do NOT mention support for this syntax. Verified against
// https://fal.ai/models/fal-ai/flux-2-pro/edit/api in 2026-04-26: only `prompt`,
// `image_urls`, `image_size`, `seed`, `safety_tolerance`, `enable_safety_checker`,
// `output_format`, and `sync_mode` are accepted. There's no documented prompt-
// weighting parser. The `(directive:1.7)` text was almost certainly being
// tokenized literally — wasting attention budget on `(`, `:`, `1`, `.`, `7`, `)`.
//
// Plain English wins on three axes:
//   1. Every flux variant respects clear imperatives. No reliance on
//      undocumented syntax.
//   2. Tokens become semantically meaningful instead of literal punctuation.
//   3. We can add anchor language flux's vision-language head reads more
//      directly — the "all 4 products must appear" clause is the most
//      important addition and impossible to express through (text:weight).
//
// What's pinned:
//   - Architecture preservation (room geometry must not drift)
//   - No new decor objects (suppress phantom side tables, vases, plants)
//   - Exact reproduction of every panel product (no substitutions)
//   - All 4 products must appear in the final image (the new anchor — this
//     directly targets the 2-3/4 hit rate by giving flux an explicit count
//     constraint instead of leaving omission as an acceptable outcome)
// Build 115 simplification: the prior FIDELITY_DIRECTIVES were ~80 words of
// stacked negations and meta-instructions ("ignore words elsewhere"). flux is
// a diffusion model, not an instruction-tuned LLM — meta-negation
// paradoxically amplifies attention on the words you said to ignore.
//
// New design: short, positive imperatives. The architecture-preservation
// clause is owned by the wrapper (see buildPanelPrompt), so this constant
// only carries the panel-fidelity anchor.
export const FIDELITY_DIRECTIVES =
  'All 4 products must appear, matching their reference cells exactly. No substitutions, no omissions, no new decor.';

// Single-product variant — same simplification.
export const FIDELITY_DIRECTIVES_SINGLE =
  'The product must match the reference exactly. No substitutions, no new decor.';

// Cap total prompt words. Lowered 200 → 120: shorter prompts have
// dramatically less token-attention dilution. flux weights early tokens
// most, and at 120 words every clause is in the high-attention region.
const MAX_PROMPT_WORDS = 120;

/**
 * Build the enriched design-intent prompt that is passed INTO the final
 * scene-edit wrapper (buildPanelPrompt / buildFlux2MaxPrompt).
 *
 * Content order — early tokens get more attention from flux:
 *   [Furniture list] → [Color palette] → [User style intent]
 *
 * Quality and architecture-preservation tokens are NOT added here — the
 * outer wrapper owns those so they are never duplicated.
 *
 * @param {string} userPrompt     - The user's raw prompt
 * @param {string} [productHints] - Detailed furniture descriptions from catalog matching
 * @param {string} [colorPalette] - Dominant color palette extracted from matched products
 * @returns {string} The design-intent fragment
 */
export function buildFinalPrompt(userPrompt, productHints, colorPalette) {
  const parts = [];

  if (productHints) {
    parts.push(`Room contains exactly: ${productHints}. No other furniture.`);
  }

  if (colorPalette) {
    parts.push(`Color palette: ${colorPalette}.`);
  }

  // Product hints and color palette are high-priority (early tokens get more
  // attention from flux). User prompt is supplementary style intent.
  const highPriority = parts.join(' ');
  const highPriorityWords = highPriority.split(/\s+/).filter(Boolean);

  const userText = userPrompt || 'Modern minimalist interior design.';
  const userWords = userText.split(/\s+/).filter(Boolean);

  // Budget: total cap minus high-priority content
  const userBudget = MAX_PROMPT_WORDS - highPriorityWords.length;

  if (userBudget <= 0) {
    return highPriorityWords.slice(0, MAX_PROMPT_WORDS).join(' ');
  }

  const trimmedUser = userWords.length > userBudget
    ? userWords.slice(0, userBudget).join(' ')
    : userText;

  return [highPriority, trimmedUser].filter(Boolean).join(' ');
}

/**
 * Build the flux prompt when product references are in a 2×2 panel.
 *
 * The panel (image 2) contains a 2×2 grid of product reference images.
 * Each cell is described with a RICH descriptor (color + material + shape +
 * type + category) extracted from the catalog metadata. This is critical:
 *
 * Previously the prompt said only "top-left: sofa" and flux's text prior
 * ("sofa") out-weighted the 256×256 panel thumbnail when the user's own
 * text also mentioned "sofa". Result: flux generated a generic sofa, not
 * the specific catalog product. Now the prompt says
 *   "top-left: cognac leather oversized loveseat sofa"
 * which locks flux to the correct silhouette.
 *
 * Token order matters: flux weights early tokens heavily. We lead with
 * quality → architecture preserve → detailed refs → user text wrapped as
 * supplementary style intent (not primary content definition).
 *
 * @param {string}   userPrompt - User's raw design prompt
 * @param {object[]} products   - Products with category/tags/materials/name
 * @returns {string} Structured prompt for panel-based edit input
 */
export function buildPanelPrompt(userPrompt, products) {
  const posLabels = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const entries = (products || []).slice(0, 4).map((p, i) => {
    // Phase 1: close the "furniture" fallback leak. Previously a missing
    // descriptor + missing category fell back to the bare word "furniture",
    // giving flux training-data freedom to render anything generically
    // matching the user's style words. Now we surface a warning AND swap in
    // language that explicitly points flux at the panel cell rather than
    // its training prior.
    const desc = describeProductForPrompt(p);
    if (!desc) {
      console.warn(
        `[promptBuilder/panel] Missing descriptor for product ${p?.id || '(no id)'} ` +
        `category=${p?.category || '(none)'} — using panel-anchored fallback`,
      );
    }
    const safeDesc = desc || 'the exact product shown in this cell of the reference panel';
    // Phase 1: ordinal tag pairs with positional label so flux tracks
    // 4 distinct items rather than treating them as a fungible list.
    return `Product ${i + 1} (${posLabels[i]}): ${safeDesc}`;
  });

  // Build 115: tightened reference clause. Was ~50 words of layered
  // imperatives + negations; now ~30 words of positive directives. flux
  // doesn't need the "do not swap positions" anti-instruction because
  // positional labels (top-left, etc.) already pin the cell binding.
  const refLine = entries.length > 0
    ? `Image 2 is a 2×2 reference grid: ${entries.join('; ')}. Render all 4 products in the room, matching each one's color, material, silhouette, and proportions to its panel cell.`
    : 'Replace furniture with pieces that complement the room style.';

  // Strip trailing punctuation before re-adding our own terminator.
  const cleanedPrompt = (userPrompt || '').replace(/[.\s]+$/, '');

  // Build 115: scope the user prompt as MOOD ONLY in one short clause.
  // Previously this ran ~60 words with stacked "never to walls / never to
  // floor / never to ceiling / etc." negations — flux read them all as
  // attention weight on those exact surfaces. The new framing is a single
  // positive scope: "Style mood: [user words]" tells flux these words
  // describe ATMOSPHERE, not objects.
  const styleIntent = cleanedPrompt
    ? `Style mood (lighting and atmosphere only): ${cleanedPrompt}.`
    : '';

  // Build 115 wrapper: 4 short sections, ~90 words total.
  //   1. Quality framing
  //   2. Architecture preserve (one short clause, no enumeration)
  //   3. Panel reference + fidelity anchor
  //   4. Style mood (user prompt scoped to atmosphere)
  //
  // Down from ~200 words; every token now lands in flux's high-attention
  // region. Architecture preservation kept short — the model knows what
  // "preserve image 1's room" means without 6 redundant clauses.
  return [
    getQualityPrefix(cleanedPrompt),
    'Scene edit: preserve image 1\'s walls, floor, ceiling, windows, lighting, and camera angle unchanged.',
    refLine,
    FIDELITY_DIRECTIVES,
    styleIntent,
  ].filter(Boolean).join(' ');
}

/**
 * Build the flux prompt when each product is passed as a separate input
 * image (Ring 2 fallback — fires when the 2×2 panel is unavailable).
 *
 * Unlike buildPanelPrompt, this function describes products WITHOUT
 * referencing a 2×2 grid. Each product is addressed by its image index
 * (image 2, image 3, ...) since we send room + 4 separate product refs.
 *
 * @param {string}   userPrompt - User's raw design prompt
 * @param {object[]} products   - Products with category/tags/materials/name
 * @returns {string} Structured prompt for individual-refs edit input
 */
export function buildFlux2MaxPrompt(userPrompt, products) {
  const entries = (products || []).slice(0, 4).map((p, i) => {
    // Phase 1: same fallback fix as buildPanelPrompt — never bare "furniture".
    const desc = describeProductForPrompt(p);
    if (!desc) {
      console.warn(
        `[promptBuilder/refs] Missing descriptor for product ${p?.id || '(no id)'} ` +
        `category=${p?.category || '(none)'} — using image-anchored fallback`,
      );
    }
    const safeDesc = desc || `the exact product shown in image ${i + 2}`;
    // Phase 1: ordinal tag for tracking. Image 1 is the room, so products
    // start at image 2.
    return `Product ${i + 1} (image ${i + 2}) is a ${safeDesc}`;
  });

  // Build 115: refs path mirrors the panel path — short positive imperatives,
  // no anti-instructions, positional binding via image index.
  const refLine = entries.length > 0
    ? `Place these 4 products into image 1's room: ${entries.join('; ')}. Match each product's color, material, silhouette, and proportions to its reference image.`
    : 'Replace furniture with pieces that complement the room style.';

  // Strip trailing punctuation before re-adding our own terminator (matches
  // buildPanelPrompt's behavior — prevents "...prompt..." double-period).
  const cleanedUserPrompt = (userPrompt || '').replace(/[.\s]+$/, '');
  const styleIntent = cleanedUserPrompt
    ? `Style mood (lighting and atmosphere only): ${cleanedUserPrompt}.`
    : '';

  // Same 4-section structure as buildPanelPrompt.
  return [
    getQualityPrefix(userPrompt),
    'Scene edit: preserve image 1\'s walls, floor, ceiling, windows, lighting, and camera angle unchanged.',
    refLine,
    FIDELITY_DIRECTIVES,
    styleIntent,
  ].filter(Boolean).join(' ');
}

/**
 * Pick the flux aspect ratio bucket closest to the source image.
 * flux only accepts a fixed set of ratios — we snap to the nearest.
 *
 * @param {number} width  - Source image width in px
 * @param {number} height - Source image height in px
 * @returns {string}      - One of flux's supported aspect ratios
 */
export function pickAspectRatio(width, height) {
  if (!width || !height) return 'match_input_image';
  const r = width / height;

  const buckets = [
    { name: '21:9', aspect: 21 / 9 },
    { name: '16:9', aspect: 16 / 9 },
    { name: '3:2',  aspect: 3 / 2  },
    { name: '4:3',  aspect: 4 / 3  },
    { name: '1:1',  aspect: 1      },
    { name: '3:4',  aspect: 3 / 4  },
    { name: '2:3',  aspect: 2 / 3  },
    { name: '9:16', aspect: 9 / 16 },
    { name: '9:21', aspect: 9 / 21 },
  ];

  let best = buckets[0];
  let bestDelta = Math.abs(Math.log(r / best.aspect));
  for (const b of buckets) {
    const d = Math.abs(Math.log(r / b.aspect));
    if (d < bestDelta) {
      best = b;
      bestDelta = d;
    }
  }
  return best.name;
}
