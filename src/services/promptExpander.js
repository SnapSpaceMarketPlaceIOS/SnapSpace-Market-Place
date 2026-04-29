import { proxyFetch } from './apiProxy';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 200;
const EXPANSION_TIMEOUT_MS = 3000;
// Build 117: lowered from 30 → 18. All 16 style presets in stylePresets.js
// are 19-25 words and were being passed to Haiku for cinematography
// enrichment. Empirically, that compounded atmosphere-bleed on high-contrast
// styles (Brutalist, Art Deco, Dark Luxe) — Haiku layered phrases like
// "void shadows defining raw concrete" and "spotlight carving geometry"
// on top of the preset's own atmosphere, producing prompts where flux
// interpreted architecture as a sculptor's medium and repainted walls.
// Curated presets already carry the right cinematography vocabulary; they
// don't need further enrichment. Short user-typed prompts ("modern bedroom")
// still get expanded because the value of texture/lighting words is highest
// when the input is sparse.
const SKIP_IF_ALREADY_LONG_WORDS = 18;
const MIN_USABLE_EXPANSION_CHARS = 25;

// Build 84 / Stage 6 — AI fidelity rewrite. The previous expansion prompt
// produced Haiku outputs like "a pale ash wood console with clean lines, an
// ivory wool sofa with relaxed proportions, a delicate paper sphere pendant"
// — naming SPECIFIC furniture pieces. Downstream, flux read those nouns as
// authoritative furniture instructions and rendered them, even though our
// 2x2 reference panel showed a completely different set of products. Result:
// 1-of-3 to 2-of-4 fidelity on evocative styles like Scandinavian / coastal /
// mid-century where the user prompt is just a style label and Haiku had no
// constraint to stay away from item nouns.
//
// New rules below:
//   - HARD ban on furniture-piece nouns (sofa, chair, table, console, rug,
//     pendant, lamp, etc.) unless the user typed them. Materials become
//     atmosphere descriptors ("oak-toned warmth"), not item descriptions
//     ("oak console").
//   - Output is now an ATMOSPHERE sentence, not a furniture inventory.
//   - Length kept tight (25-40 words) so the prompt-builder's styleIntent
//     doesn't push past the 200-word truncation threshold once cell
//     descriptions and FIDELITY_DIRECTIVES are appended.
//
// Pairs with the styleIntent reframe in promptBuilders.js (Build 82) which
// scopes the user prompt to "lighting, color palette, and overall aesthetic
// only — all furniture comes exclusively from the reference panel". When
// Haiku stops naming pieces AND the prompt-builder labels the rest as
// "aesthetic only", flux's text path stops competing with the panel's
// visual path and 4/4 fidelity holds across all evocative styles.
const SYSTEM_PROMPT = `You expand short interior design prompts into vivid CINEMATOGRAPHY descriptions for an AI image model that generates photoreal room images.

Your output describes the LIGHTING, CONTRAST, SHADOW, COLOR TEMPERATURE, and MOOD of the space. It is NOT a furniture inventory and NOT a substitute for the input's vocabulary.

Build 95 directive — preserve, don't substitute:
The input prompt has been carefully crafted with cinematography and texture vocabulary that maps to specific products in the catalog. Your job is to LIGHTLY enrich the input, NOT replace its language. If the input says "velvet and rattan textures", DO NOT substitute "luxe softness" or "woven warmth" — those words don't help the matcher score the right products. Keep "velvet" and "rattan" verbatim in your output.

Given a short prompt, return a 30-45 word description that does ONE thing:
- Wraps the input in 1-2 additional sentences of CINEMATOGRAPHY (lighting direction, shadow quality, contrast level, color temperature) without altering the input's nouns or material words.

ABSOLUTE RULES — violating these makes the downstream image-generation fail:
- NEVER name furniture or decor pieces. Forbidden words you cannot ADD: sofa, couch, loveseat, chair, armchair, accent chair, stool, bench, table, coffee table, side table, console, dresser, nightstand, bed, headboard, rug, carpet, runner, sconce, pendant, chandelier, mirror, artwork, vase, planter, throw, pillow, cushion, blanket, curtain, drape, shelf, bookshelf, bar, cabinet. If the user typed one of these words, you may keep it once, but do NOT add new ones.
- Lighting words like "lamplight", "lamp glow", "sconce light", "pendant glow" describe LIGHTING, not items, and are allowed. "Sunlight", "daylight", "firelight", "spotlight" are also allowed.
- Materials and textures appear as adjectives describing atmosphere ("oak-toned warmth", "linen softness", "marble cool"), NOT as nouns describing pieces.
- Color and palette descriptors apply to FURNITURE, LAMPLIGHT, and SOFT FURNISHINGS only. NEVER describe wall colors, paint colors, floor colors, or ceiling colors. Do NOT use phrases like "charcoal walls", "ivory walls", "painted walls", "dark walls", "wood floors", or anything that paints the room's surfaces. The user's existing room architecture stays as-is.
- Build 117 directive — light is a TONE, not a sculptor. Forbidden phrasings that describe light shaping or revealing architecture: "shadows pooling beneath surfaces", "spotlight carving geometry", "light raking across planes", "shadows defining walls", "illumination sculpting forms", "shadows etching contours", "void shadows defining concrete", "shadows pooling against architecture". flux reads these as instructions to RECONSTRUCT the room's surfaces from light. Describe light as MOOD ("warm afternoon glow", "low-contrast hush", "golden lamplight", "diffused north light", "cinematic dim") — never as something that shapes, defines, carves, sculpts, rakes, etches, or reveals the room itself.
- Do NOT substitute the input's vocabulary. If the input says "velvet", say "velvet" — not "luxe softness". If it says "rattan", say "rattan" — not "woven natural fibers". Vocabulary preservation is critical for product-matcher alignment.
- Preserve the user's stated room type and style intent exactly. Do not change "bedroom" into "living room".
- Do NOT add people, pets, or activity. Do NOT mention brands or designers.
- Return ONLY the cinematography sentence. No preamble, no quotes, no labels.

Example:
Input: Modern minimalist living room, bright diffused daylight, soft shadows, linen and pale-wood textures, neutral palette, editorial restraint and quiet calm.
Output: Modern minimalist living room bathed in bright diffused daylight, soft directional shadows holding their shape, linen and pale-wood textures, neutral palette, editorial restraint and quiet calm — gentle north-window glow, low-contrast clarity, refined still composure.

Input: Glam living room, dramatic high-contrast lighting, gold-leaf highlights, velvet and polished-metal textures, jewel-tone palette with gold accents, refined opulence and crystalline shine.
Output: Glam living room under dramatic high-contrast lighting, gold-leaf highlights catching the velvet and polished-metal textures, jewel-tone palette with gold accents, refined opulence and crystalline shine — theatrical accent spotlights, deep luxe shadows, polished cinematic gravity.`;

function timeoutPromise(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`expansion timeout ${ms}ms`)), ms)
  );
}

export async function expandPrompt(userText) {
  const raw = (userText || '').trim();
  if (raw.length === 0) return raw;

  if (raw.split(/\s+/).length > SKIP_IF_ALREADY_LONG_WORDS) {
    if (__DEV__) console.log(`[promptExpander] skipping — already ${raw.split(/\s+/).length} words`);
    return raw;
  }

  const started = Date.now();

  try {
    const res = await Promise.race([
      proxyFetch('anthropic', 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        body: {
          model: HAIKU_MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: raw }],
        },
      }),
      timeoutPromise(EXPANSION_TIMEOUT_MS),
    ]);

    if (!res.ok) {
      if (__DEV__) console.warn(`[promptExpander] HTTP ${res.status} — using raw prompt`);
      return raw;
    }

    const data = await res.json();
    const expanded = data?.content?.[0]?.text?.trim();

    if (!expanded || expanded.length < MIN_USABLE_EXPANSION_CHARS) {
      if (__DEV__) console.warn(`[promptExpander] empty/short response — using raw prompt`);
      return raw;
    }

    if (__DEV__) {
      const ms = Date.now() - started;
      const inTok = data?.usage?.input_tokens ?? '?';
      const outTok = data?.usage?.output_tokens ?? '?';
      console.log(`[promptExpander] ${ms}ms  in=${inTok} out=${outTok}`);
      console.log(`[promptExpander] raw:      "${raw}"`);
      console.log(`[promptExpander] expanded: "${expanded}"`);
    }
    return expanded;

  } catch (err) {
    if (__DEV__) console.warn(`[promptExpander] failed (${err?.message || err}) — using raw prompt`);
    return raw;
  }
}
