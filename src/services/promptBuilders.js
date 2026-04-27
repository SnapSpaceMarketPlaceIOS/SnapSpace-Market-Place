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
export const FIDELITY_DIRECTIVES =
  'Preserve all architecture exactly. Do not introduce any new decor objects. Copy each piece of furniture from the reference panel exactly. All 4 products must appear in the final image; do not omit any. The reference panel is the ONLY source of truth for furniture — ignore any furniture descriptions, color words, or material words elsewhere in this prompt. Those words describe lighting and atmosphere only; they never override the panel.';

// Single-product variant for generateSingleProductInRoom (1 ref, not 4).
// Same architecture/no-new-decor pins, but the all-4 anchor is replaced
// with a single-product fidelity clause.
export const FIDELITY_DIRECTIVES_SINGLE =
  'Preserve all architecture exactly. Do not introduce any new decor objects. The product in the final image must match the reference exactly. The reference image is the ONLY source of truth for the product — ignore any product descriptions, color words, or material words elsewhere in this prompt; they describe lighting and atmosphere only.';

// Cap total prompt words. Raised to 200: flux retains useful signal up to
// ~200 words; beyond that the tokenizer starts dropping late tokens. The
// smart budget in buildFinalPrompt trims user text first (least specific)
// to keep high-priority product hints and color palette intact.
const MAX_PROMPT_WORDS = 200;

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

  const refLine = entries.length > 0
    ? `Image 2 is a 2×2 grid containing 4 reference products with white gutters between them. ${entries.join('. ')}. Each of these 4 products MUST appear in the final image. Do not swap their positions, do not substitute with similar-looking alternatives, do not omit any. Match each product's color, material, silhouette, finish, and proportions exactly.`
    : 'Replace furniture with pieces that complement the room style.';

  // User text is included as SUPPLEMENTARY style intent, NOT as the primary
  // content definition. Wrapping it in "While maintaining this intent:"
  // tells flux to treat it as a hint rather than the canonical spec.
  //
  // Build 69: normalize trailing punctuation. HomeScreen's enrichment path
  // appends sentences ending in `.` to a user prompt that may or may not
  // already end with `.`, producing strings like "...throughout." — then this
  // wrapper added another `.` giving "..throughout.." in live FAL logs.
  // Strip trailing periods/whitespace before we add our own terminator.
  const cleanedPrompt = (userPrompt || '').replace(/[.\s]+$/, '');
  // Build 82 fix: scope the user prompt to AESTHETIC ONLY, not furniture.
  // Haiku-expanded prompts often name specific items (e.g. "white-washed oak
  // console, blue striped throw pillows") that compete with the panel and
  // cause flux to render the prompt's items instead of the panel's items —
  // especially noticeable on evocative styles like coastal, mid-century, etc.
  // This rewrite tells flux: use this for vibe (lighting, palette, mood) but
  // never for furniture, which comes exclusively from the panel.
  // Build 94 architecture-bleed fix: scope the style guidance ONLY to the
  // furniture upholstery, textile colors, lamp glow, and overall mood — NOT
  // to the room's walls, floor, ceiling, or any architectural surface.
  // Without this scoping, palette language like "deep charcoal palette" gets
  // interpreted as a wall-paint directive (verified live: an Art Deco prompt
  // turned a white-walled room charcoal in Build 93). Now palette descriptors
  // bind to furniture and lighting tones, leaving the existing room surfaces
  // identical.
  const styleIntent = cleanedPrompt
    ? `Apply this style guidance ONLY to the upholstery and textile colors of the reference furniture, the lamp glow, and the overall mood — never to walls, wall paint, floor, ceiling, or any architectural surface. Color and palette words describe furniture and lighting tones, not room surfaces. Do not render any new furniture or decor described here; all furniture comes exclusively from the reference panel: ${cleanedPrompt}.`
    : '';

  // Order matters — flux weights EARLIER tokens more heavily AND truncates
  // late tokens past ~200 words. Phase 1: FIDELITY_DIRECTIVES moved BEFORE
  // styleIntent (the user's supplementary prompt). Two reasons:
  //   1. The "all 4 products must appear" anchor must NEVER be truncated —
  //      it's the central guard against the 2-3/4 hit-rate. Putting it
  //      after the user prompt risked truncation when Haiku-expanded
  //      prompts pushed total length past 200 words.
  //   2. Earlier tokens get more attention weight, so the fidelity directive
  //      gets a stronger pull on flux's output than when it was last.
  // styleIntent stays last because it's intentionally supplementary — the
  // wrapping comment "While maintaining this overall style intent" tells
  // flux to treat it as a hint rather than the canonical spec, so losing
  // its tail to truncation is acceptable.
  return [
    getQualityPrefix(cleanedPrompt),
    'This is a precise scene edit, not a new generation.',
    'Preserve image 1 exactly: keep the existing wall paint and color, floor surface and color, ceiling, windows, doorways, mouldings, mirrors and wall art positions, camera angle, perspective, and spatial layout. Do not repaint walls. Do not change the floor. Do not change wall color. Do not move or remove architectural elements. The room\'s existing surfaces stay identical.',
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

  const refLine = entries.length > 0
    ? `Place all 4 of these products into the room shown in image 1: ${entries.join('. ')}. Each of these 4 products MUST appear in the final image. Do not omit any, do not substitute with similar-looking alternatives. Match each product's color, material, silhouette, finish, and proportions exactly. Position each piece naturally where this type of furniture belongs in the room.`
    : 'Replace furniture with pieces that complement the room style.';

  // Build 82 fix: same aesthetic-only scoping as buildPanelPrompt — keeps
  // flux from substituting prompt-described items for the actual reference
  // products on evocative styles.
  // Build 94 architecture-bleed fix: same scoping as buildPanelPrompt — palette
  // language binds to furniture/lamps/textiles only, never wall paint or floor.
  const styleIntent = userPrompt
    ? `Apply this style guidance ONLY to the upholstery and textile colors of the reference furniture, the lamp glow, and the overall mood — never to walls, wall paint, floor, ceiling, or any architectural surface. Color and palette words describe furniture and lighting tones, not room surfaces. Do not render any new furniture or decor described here; all furniture comes exclusively from the reference images: ${userPrompt}.`
    : '';

  // Same order as buildPanelPrompt: FIDELITY_DIRECTIVES before styleIntent so
  // the "all 4 products must appear" anchor stays in stable token position
  // and never gets truncated when Haiku-expanded prompts run long.
  return [
    getQualityPrefix(userPrompt),
    'This is a precise scene edit, not a new generation.',
    'Preserve image 1 exactly: keep the existing wall paint and color, floor surface and color, ceiling, windows, doorways, mouldings, mirrors and wall art positions, camera angle, perspective, and spatial layout. Do not repaint walls. Do not change the floor. Do not change wall color. Do not move or remove architectural elements. The room\'s existing surfaces stay identical.',
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
