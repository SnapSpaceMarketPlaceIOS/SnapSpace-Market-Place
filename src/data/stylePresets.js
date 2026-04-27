/**
 * Style presets — the 16 design styles surfaced in the Home-screen
 * StyleCarousel under the wish input bar. Tapping a preset:
 *   1) Replaces the prompt-chip strip above the input bar with a
 *      "selected style" pill (thumbnail + label + prompt preview).
 *   2) Auto-populates the prompt input with one of the curated variations.
 *
 * Build 95 — Cinematography + Catalog-Aligned Vocabulary rewrite.
 *
 * Earlier preset prompts named specific furniture items ("scalloped
 * emerald velvet sofa, polished marble side table, fluted gold sconces,
 * geometric area rug"). Flux read those as authoritative furniture
 * directives and rendered them — even though the matched product panel
 * had different items. Result: prompt items vs. panel items vs. rendered
 * items diverged. User saw 2/4 fidelity in the Shop Room strip vs. the
 * generated photo.
 *
 * Two structural changes per the user's theory:
 *
 *   (a) Catalog-aligned vocabulary — every material, texture, and color
 *       descriptor below was extracted from the live productCatalog.js
 *       for that style's tagged products. The matcher's tag-scoring lands
 *       on real products; flux's text path describes textures the panel
 *       actually shows. The puzzle pieces fit.
 *
 *   (b) Cinematography over inventory — the prompt's job is now lighting,
 *       contrast, shadow, color temperature, and mood. NEVER specific
 *       furniture items. Same panel furniture, shown under 16 different
 *       cinematographic moods, gives the user 16 distinct experiences.
 *       Small catalog feels huge.
 *
 * Each style still ships with 3 variations so consecutive taps produce
 * different generations. Variations rotate the cinematography + texture
 * vocabulary while preserving the canonical style keyword (productMatcher's
 * 40% style-score still lands every time).
 *
 * `label` is the short card title (display only — never sent to the AI).
 * Images are bundled via require() so they ship inside the JS bundle.
 */
export const STYLE_PRESETS = [
  {
    id: 'modern-minimal',
    label: 'Modern Minimal',
    image: require('../assets/styles/modern-minimal.jpg'),
    prompts: [
      'Modern minimalist living room, bright diffused daylight, soft shadows, linen and pale-wood textures, neutral palette, editorial restraint and quiet calm.',
      'Modern minimalist living room, soft north-window glow, low-contrast clarity, ceramic and oak warmth balanced by metal cool, ivory and stone palette, refined stillness.',
      'Modern minimalist living room, even diffused daylight, gentle shadows, upholstered linen and leather softness, white and charcoal palette, airy editorial composure.',
    ],
  },
  {
    id: 'mid-century',
    label: 'Mid-Century',
    image: require('../assets/styles/mid-century.jpg'),
    prompts: [
      'Mid-century living room, warm afternoon sunlight, golden-hour tones, walnut and tan-leather warmth, retro earth palette, refined nostalgia and confident ease.',
      'Mid-century living room, low golden lamplight, medium-contrast warmth, walnut wood and tufted upholstered textures, brown and amber tones, lived-in modernist calm.',
      'Mid-century living room, soft afternoon glow, gentle directional light, boucle and walnut warmth, rust and caramel accents, retro elegance with quiet confidence.',
    ],
  },
  {
    id: 'scandinavian',
    label: 'Scandinavian',
    image: require('../assets/styles/scandinavian.jpg'),
    prompts: [
      'Scandinavian living room, bright north light, airy soft shadows, pale wood and boucle softness, ivory and oat palette, hygge calm and serene minimalism.',
      'Scandinavian living room, soft diffused daylight, low-contrast clarity, light wood and ceramic warmth, white with black accents, nordic stillness and lived-in quiet.',
      'Scandinavian living room, gentle morning glow, breathy shadows, curved boucle and linen plushness, oat and bone palette, hygge airiness and serene restraint.',
    ],
  },
  {
    id: 'japandi',
    label: 'Japandi',
    image: require('../assets/styles/Japandi.jpg'),
    prompts: [
      'Japandi living room, soft overcast diffusion, gentle shadows, sculptural ceramic and natural wood textures, white and warm-natural palette, zen quiet and grounded calm.',
      'Japandi living room, soft daylight, restrained shadows, ceramic and oak balance, ivory and earth tones, minimalist meditation and quiet refinement.',
      'Japandi living room, diffused window light, low-contrast hush, wood and linen textures with sculptural ceramic accents, neutral palette, grounded zen stillness.',
    ],
  },
  {
    id: 'cozy-cabin',
    label: 'Cozy Cabin',
    image: require('../assets/styles/cozy-cabin.jpg'),
    prompts: [
      'Cozy cabin living room, warm firelight glow, deep amber shadows, rustic wood and soft linen textures, brown and beige palette, lived-in stillness and golden warmth.',
      'Cozy cabin living room, low lamp glow, layered amber tones, rustic wood and velvet softness, warm earth palette, hygge weight and comfortable hush.',
      'Cozy cabin living room, soft hearth-light warmth, deep wood-toned shadows, rattan and linen textures, brown and cream palette, weathered stillness and intimate calm.',
    ],
  },
  {
    id: 'farmhouse',
    label: 'Farmhouse',
    image: require('../assets/styles/farmhouse.jpg'),
    prompts: [
      'Modern farmhouse living room, soft morning daylight, gentle warmth, weathered wood and linen textures, beige and cream palette, country quietude and lived-in ease.',
      'Modern farmhouse living room, bright country light, soft shadows, wood and ceramic textures with striped soft furnishings, ivory and warm-brown palette, refined rustic calm.',
      'Modern farmhouse living room, golden morning glow, gentle directional warmth, rustic wood and vintage metal accents, cream and earth tones, country charm and grounded composure.',
    ],
  },
  {
    id: 'coastal-modern',
    label: 'Coastal',
    image: require('../assets/styles/coastal-modern.jpg'),
    prompts: [
      'Coastal modern living room, bright airy daylight, soft sea-glass tones, rattan and linen textures, ivory and natural-fiber palette, breezy stillness and weightless calm.',
      'Coastal modern living room, sun-washed soft light, low-contrast brightness, wicker and ceramic warmth, white and sand palette, breezy ease and lived-in clarity.',
      'Coastal modern living room, diffused beach-house glow, gentle shadows, woven natural-fiber textures, cream and pale-driftwood palette, airy serenity and quiet ocean breath.',
    ],
  },
  {
    id: 'industrial',
    label: 'Industrial',
    image: require('../assets/styles/industrial.jpg'),
    prompts: [
      'Industrial living room, hard directional sidelight, cool steel shadows, metal and dark-wood textures, black and graphite palette, gritty editorial weight.',
      'Industrial living room, low cool sidelight, sharp shadow geometry, raw metal and leather textures, charcoal and dark-wood tones, moody atmospheric density.',
      'Industrial living room, single-source window light, deep contrast shadows, metal-frame and reclaimed-wood textures, black and earth palette, raw urban composure.',
    ],
  },
  {
    id: 'biophilic',
    label: 'Biophilic',
    image: require('../assets/styles/biophilic.jpg'),
    prompts: [
      'Biophilic living room, soft green-filtered daylight, organic warmth, ceramic and natural-fiber textures, sage and ivory palette, garden-room calm and living serenity.',
      'Biophilic living room, dappled plant-filtered light, gentle shadows, ceramic and woven natural textures, soft green and stone palette, conservatory hush and breath of growth.',
      'Biophilic living room, soft daylight through hanging foliage, organic dappling, ceramic and natural-fiber warmth, sage and warm-cream palette, indoor-garden serenity.',
    ],
  },
  {
    id: 'maximalist',
    label: 'Maximalist',
    image: require('../assets/styles/maximalist.jpg'),
    prompts: [
      'Maximalist living room, rich saturated lamplight, bold layered color, velvet and metal textures, jewel-tone palette, theatrical depth and abundant warmth.',
      'Maximalist living room, dramatic warm lighting, layered shadow and highlight, velvet and ceramic textures with bold textile mixing, ruby and emerald palette, opulent storytelling and exuberant richness.',
      'Maximalist living room, golden lamplight saturation, theatrical contrast, velvet and metal warmth, jewel tones layered with brass accents, unapologetic abundance and curated drama.',
    ],
  },
  {
    id: 'rustic',
    label: 'Rustic',
    image: require('../assets/styles/rustic.jpg'),
    prompts: [
      'Rustic living room, golden lamplight, deep wood-toned shadows, weathered wood and linen textures, brown and warm-earth palette, weathered warmth and timeworn ease.',
      'Rustic living room, low warm pendant glow, deep amber shadows, solid-wood and metal textures, dark-walnut and tan palette, time-burnished hush and grounded stillness.',
      'Rustic living room, soft golden-hour lamplight, layered earthy shadows, rattan and aged-wood warmth, ochre and cocoa palette, lived-in patina and gentle quiet.',
    ],
  },
  {
    id: 'brutalist',
    label: 'Brutalist',
    image: require('../assets/styles/brutalist.jpg'),
    prompts: [
      'Brutalist living room, harsh single-source light, deep concrete-toned shadows, raw metal and dark-wood textures, black and stone palette, monolithic weight and architectural restraint.',
      'Brutalist living room, hard directional sidelight, sculptural shadow play, raw stone and metal textures, charcoal and graphite palette, austere drama and structural stillness.',
      'Brutalist living room, low-key dramatic lighting, deep void shadows, raw concrete and metal textures, black and bone palette, monolithic gravity and architectural calm.',
    ],
  },
  {
    id: 'bohemian',
    label: 'Bohemian',
    image: require('../assets/styles/bohemian.jpg'),
    prompts: [
      'Bohemian living room, warm sunset lamplight, layered amber tones, linen and rattan textures, terracotta and natural-fiber palette, eclectic warmth and lived-in soul.',
      'Bohemian living room, soft golden-hour glow, deep amber shadows, woven natural fibers and ceramic warmth, beige and rust palette, layered storytelling and weathered ease.',
      'Bohemian living room, low warm lamplight, rich layered shadows, linen and rattan with vintage ceramic accents, sienna and warm-earth palette, free-spirited warmth and grounded soul.',
    ],
  },
  {
    id: 'glam',
    label: 'Glam',
    image: require('../assets/styles/glam.jpg'),
    prompts: [
      'Glam living room, dramatic high-contrast lighting, gold-leaf highlights, velvet and polished-metal textures, jewel-tone palette with gold accents, refined opulence and crystalline shine.',
      'Glam living room, theatrical accent lighting, deep velvet shadows, curved upholstered and marble textures, ivory and gold palette, polished sophistication and luminous statement.',
      'Glam living room, dramatic spotlight contrast, gold-leaf reflections, velvet and crystal accent textures, white and champagne palette with jewel highlights, opulent restraint and shimmering composure.',
    ],
  },
  {
    id: 'art-deco',
    label: 'Art Deco',
    image: require('../assets/styles/art-deco.jpg'),
    prompts: [
      'Art Deco living room, jewel-toned chiaroscuro lighting, geometric shadow play, velvet and polished-metal textures, gold and deep-jewel palette, sophisticated drama and sculptural statement.',
      'Art Deco living room, dramatic accent lighting, sharp geometric shadows, velvet and marble textures with gold-leaf detail, sapphire and gold palette, refined glamour and architectural elegance.',
      'Art Deco living room, low-key dramatic lighting, geometric chiaroscuro contrast, velvet and crystal-accent textures, black, gold and jewel palette, sculptural opulence and editorial drama.',
    ],
  },
  {
    id: 'dark-luxe',
    label: 'Dark Luxe',
    image: require('../assets/styles/dark-luxe.jpg'),
    prompts: [
      'Dark Luxe living room, low-key cinematic lighting, single accent lamp glow, plush velvet and leather textures, midnight black with gold-accent palette, opulent restraint and refined hush.',
      'Dark Luxe living room, single-source dramatic lamplight, deep velvet shadows, plush upholstered and canvas-art textures, charcoal and gold palette, sophisticated stillness and cinematic gravity.',
      'Dark Luxe living room, low-key chiaroscuro lighting, deep void shadows, velvet and ceramic textures with gold-accent detail, midnight palette, refined opulence and quiet drama.',
    ],
  },
];

export function getStylePresetById(id) {
  return STYLE_PRESETS.find((p) => p.id === id) || null;
}

/**
 * Pick a prompt variation for the given preset, avoiding the lastIdx so
 * consecutive taps of the same card never produce the exact same prompt.
 *
 * @param {object} preset       — a STYLE_PRESETS entry with `prompts: string[]`
 * @param {number|undefined} lastIdx — index returned from the previous call
 *                                     for this same preset (or undefined on
 *                                     the first pick)
 * @returns {{ idx: number, prompt: string }}
 */
export function pickPromptVariation(preset, lastIdx) {
  const all = preset.prompts || [];
  if (all.length === 0) return { idx: 0, prompt: '' };
  if (all.length === 1) return { idx: 0, prompt: all[0] };
  // Build a candidate index set excluding the last one shown so the user
  // is guaranteed to see a different prompt than their previous tap.
  const candidates = all.map((_, i) => i).filter((i) => i !== lastIdx);
  const idx = candidates[Math.floor(Math.random() * candidates.length)];
  return { idx, prompt: all[idx] };
}
