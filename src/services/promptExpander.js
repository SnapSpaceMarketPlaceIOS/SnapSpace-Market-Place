import { proxyFetch } from './apiProxy';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 200;
const EXPANSION_TIMEOUT_MS = 3000;
const SKIP_IF_ALREADY_LONG_WORDS = 30;
const MIN_USABLE_EXPANSION_CHARS = 25;

const SYSTEM_PROMPT = `You expand short interior design prompts into rich, vivid shot descriptions for an AI image model that generates photoreal room images.

Given a short prompt like "modern kitchen seating", return a 30-50 word description that adds:
- Specific materials and textures (oak, walnut, honed marble, linen, brushed brass)
- Lighting direction and time of day (morning sidelight, golden hour, overcast diffused, warm lamp glow)
- Mood and atmosphere (serene, lived-in, editorial, cozy, airy)
- 2-3 specific color or tonal cues (muted sage, warm cream, deep charcoal)

Rules:
- Preserve the user's stated room type and style intent exactly. Do not change a "bedroom" into a "living room".
- Do NOT add furniture pieces the user did not request.
- Do NOT add people, pets, or activity.
- Do NOT mention brands or designers.
- Return ONLY the expanded description as a single sentence. No preamble, no quotes, no labels.

Example:
Input: Modern kitchen seating
Output: A modern kitchen with sleek bar-height seating in matte oak and brushed steel, soft morning sidelight through wide windows, honed quartz countertops, muted sage and warm oak palette, clean minimal lines, airy and inviting.`;

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
