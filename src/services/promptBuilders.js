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
// biases the whole generation toward magazine-quality output. We keep this
// list short and specific — "8k" and other common LLM noise tokens actually
// degrade flux output, so they are intentionally excluded.
//
// Build 62: the lighting token rotates per-generation across an editorial
// pool to give the same prompt visibly different output moods (was the #1
// "feels like the same room" complaint). Light is a low-risk variation
// because it doesn't change product/architecture semantics — flux can
// "warm afternoon" or "soft morning" the SAME room arrangement and the
// user perceives a different result. We swap ONLY the light token; every
// other word in the prefix stays identical so editorial quality is unchanged.
const ATMOSPHERIC_LIGHT = [
  'natural light',                     // original baseline — kept in pool
  'warm afternoon light',
  'soft morning light',
  'golden hour glow',
  'north-facing diffused daylight',
  'cinematic editorial light',
];

/**
 * Returns the editorial quality prefix with a randomly-rotated lighting
 * descriptor. Called ONCE per generation (NOT per retry — retries reuse the
 * same light to keep the prompt-hash stable).
 */
export function getQualityPrefix() {
  const light = ATMOSPHERIC_LIGHT[Math.floor(Math.random() * ATMOSPHERIC_LIGHT.length)];
  return `Editorial architectural photography, ultra-sharp focus, crisp detail, ${light}, magazine-quality interior, Architectural Digest style.`;
}

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
    const desc = describeProductForPrompt(p) || (p.category || 'furniture').replace(/-/g, ' ');
    return `${posLabels[i]}: ${desc}`;
  });

  const refLine = entries.length > 0
    ? `Image 2 is a 2×2 product reference grid showing the EXACT pieces to place in the room. ${entries.join('. ')}. Match each piece's color, material, silhouette, and proportions precisely — do not substitute with similar-looking alternatives.`
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
  const styleIntent = cleanedPrompt
    ? `While maintaining this overall style intent: ${cleanedPrompt}.`
    : '';

  return [
    getQualityPrefix(),
    'This is a precise scene edit, not a new generation.',
    'Preserve image 1 exactly: same walls, floor, ceiling, windows, lighting, camera angle, perspective, and spatial layout. Do not alter any architecture.',
    refLine,
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
    const desc = describeProductForPrompt(p) || (p.category || 'furniture').replace(/-/g, ' ');
    // Image 1 is the room, so products start at image 2.
    return `image ${i + 2} is a ${desc}`;
  });

  const refLine = entries.length > 0
    ? `Place these products into the room shown in image 1: ${entries.join(', ')}. Match each product's color, material, silhouette, and proportions precisely — do not substitute with similar-looking alternatives. Position each piece naturally where this type of furniture belongs in the room.`
    : 'Replace furniture with pieces that complement the room style.';

  const styleIntent = userPrompt
    ? `While maintaining this overall style intent: ${userPrompt}.`
    : '';

  return [
    getQualityPrefix(),
    'This is a precise scene edit, not a new generation.',
    'Preserve image 1 exactly: same walls, floor, ceiling, windows, lighting, camera angle, perspective, and spatial layout. Do not alter any architecture.',
    refLine,
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
