import { proxyFetch } from './apiProxy';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 200;
const EXPANSION_TIMEOUT_MS = 3000;
const SKIP_IF_ALREADY_LONG_WORDS = 30;
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
const SYSTEM_PROMPT = `You expand short interior design prompts into vivid ATMOSPHERE descriptions for an AI image model that generates photoreal room images.

Your output describes the FEEL of a space: lighting, palette, mood, materials-as-tones. It NEVER names furniture or decor pieces.

Given a short prompt like "modern kitchen seating", return a 25-40 word description that adds:
- Lighting direction and time of day (morning sidelight, golden hour, overcast diffused, warm lamp glow, soft north light)
- Mood and atmosphere (serene, lived-in, editorial, cozy, airy, refined)
- 2-3 color or tonal cues (muted sage, warm cream, deep charcoal, ivory linen, oak-toned warmth)
- General style era or aesthetic vocabulary (mid-century modern restraint, coastal breeziness, Scandinavian hygge, Japandi calm)

ABSOLUTE RULES — violating these makes the downstream image-generation fail:
- NEVER name furniture or decor pieces. Forbidden words include: sofa, couch, loveseat, chair, armchair, accent chair, stool, bench, table, coffee table, side table, console, dresser, nightstand, bed, headboard, rug, carpet, runner, lamp, sconce, pendant, chandelier, mirror, artwork, vase, planter, throw, pillow, cushion, blanket, curtain, drape, shelf, bookshelf, bar, cabinet. If the user typed one of these words, you may keep it once, but do NOT add new ones.
- Materials and textures appear as adjectives describing atmosphere ("oak-toned warmth", "linen softness", "marble cool"), NOT as nouns describing pieces ("an oak console", "a linen sofa").
- Preserve the user's stated room type and style intent exactly. Do not change "bedroom" into "living room".
- Do NOT add people, pets, or activity.
- Do NOT mention brands or designers.
- Return ONLY the atmosphere sentence. No preamble, no quotes, no labels.

Example:
Input: Modern kitchen seating
Output: A modern kitchen bathed in soft morning sidelight, oak-toned warmth balanced by brushed-steel cool, muted sage and warm cream palette, honed-stone calm, airy and minimal with editorial restraint.

Input: Scandinavian living room
Output: A Scandinavian living room with soft diffused daylight, ivory and oatmeal palette warmed by light-oak undertones, pale neutrals layered for hygge calm, lived-in restraint, airy and serene.`;

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
