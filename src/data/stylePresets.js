/**
 * Style presets — the 12 design styles surfaced in the Home-screen
 * StyleCarousel under the wish input bar. Tapping a preset:
 *   1) Replaces the prompt-chip strip above the input bar with a
 *      "selected style" pill (thumbnail + label + prompt preview).
 *   2) Auto-populates the prompt input with one of the curated variations.
 *
 * `prompts` shape rationale: each style ships with 3 variations so
 * consecutive taps of the same card produce DIFFERENT generations. The
 * variations all keep the canonical style keyword (so productMatcher's
 * 40% style-score still lands every time) but rotate furniture pieces,
 * materials, and palette so the matcher's category-diversity filter
 * pulls genuinely different catalog products into the panel each pick.
 *
 * All variations stay within the same room type as the carousel photo
 * (currently all living rooms) so there's no visual disconnect between
 * what the user sees on the card and what the AI generates.
 *
 * Each prompt is ~15 words: long enough to seed style/material/furniture
 * cues for productMatcher, short enough that promptExpander (Haiku) can
 * pass through with light expansion under its 30-word ceiling.
 *
 * `label` is the short two-word card title (display only — never sent to
 * the AI). Images are bundled via require() so they ship inside the JS
 * bundle — no network fetch, no race conditions, identical on every iPhone.
 */
export const STYLE_PRESETS = [
  {
    id: 'modern-minimal',
    label: 'Modern Minimal',
    image: require('../assets/styles/modern-minimal.jpg'),
    prompts: [
      'Modern minimalist living room, white linen sofa, oak coffee table, jute rug, arc floor lamp',
      'Modern minimalist living room, bouclé sectional, travertine coffee table, ivory area rug, paper pendant',
      'Modern minimalist living room, cream slipcover sofa, oak nesting tables, sheer linen curtains, ceramic vase',
    ],
  },
  {
    id: 'mid-century',
    label: 'Mid-Century',
    image: require('../assets/styles/mid-century.jpg'),
    prompts: [
      'Mid-century living room, walnut credenza, camel leather sofa, sunburst mirror, tripod lamp',
      'Mid-century living room, teak coffee table, mustard velvet accent chair, brass floor lamp, abstract gallery wall',
      'Mid-century living room, rosewood sideboard, charcoal tweed sofa, cone pendant lamp, geometric area rug',
    ],
  },
  {
    id: 'scandinavian',
    label: 'Scandinavian',
    image: require('../assets/styles/scandinavian.jpg'),
    prompts: [
      'Scandinavian living room, white oak coffee table, bouclé lounge chair, linen curtains, sheepskin throw',
      'Scandinavian living room, ash wood console, ivory wool sofa, paper sphere pendant, wool felt rug',
      'Scandinavian living room, pale birch shelving, oat-tone slipcover sofa, knit pouf, woven wall art',
    ],
  },
  {
    id: 'japandi',
    label: 'Japandi',
    image: require('../assets/styles/Japandi.jpg'),
    prompts: [
      'Japandi living room, walnut bench, rattan lounge chair, linen sofa, ceramic vase, paper pendant',
      'Japandi living room, low oak coffee table, charcoal linen sectional, washi paper lantern, jute rug',
      'Japandi living room, white oak shelving, beige bouclé chair, ceramic stoneware vessels, woven floor cushion',
    ],
  },
  {
    id: 'cozy-cabin',
    label: 'Cozy Cabin',
    image: require('../assets/styles/cozy-cabin.jpg'),
    prompts: [
      'Cozy cabin living room, leather armchair, reclaimed wood coffee table, woven throw blanket, brass sconce',
      'Cozy cabin living room, plaid wool sofa, hewn-log side table, sheepskin rug, wrought-iron pendant',
      'Cozy cabin living room, distressed leather sectional, cedar coffee table, layered Berber rugs, antler chandelier',
    ],
  },
  {
    id: 'farmhouse',
    label: 'Farmhouse',
    image: require('../assets/styles/farmhouse.jpg'),
    prompts: [
      'Modern farmhouse living room, weathered wood console, linen sofa, jute rug, pendant lighting',
      'Modern farmhouse living room, shiplap accent wall, beige slipcover sofa, barn-wood coffee table, mason-jar pendant',
      'Modern farmhouse living room, reclaimed pine sideboard, plaid throw, ivory linen armchair, rope chandelier',
    ],
  },
  {
    id: 'coastal-modern',
    label: 'Coastal',
    image: require('../assets/styles/coastal-modern.jpg'),
    prompts: [
      'Coastal modern living room, white linen sofa, rattan lounge chair, driftwood coffee table, sea-grass rug',
      'Coastal modern living room, slipcovered ivory sectional, woven jute coffee table, capiz-shell pendant, sandstone vase',
      'Coastal modern living room, white-washed oak console, blue striped throw pillows, rope-bound mirror, sisal rug',
    ],
  },
  {
    id: 'industrial',
    label: 'Industrial',
    image: require('../assets/styles/industrial.jpg'),
    prompts: [
      'Industrial living room, dark leather sofa, metal coffee table, Edison pendant lamp, exposed brick',
      'Industrial living room, blackened-steel shelving, oxblood leather club chair, factory-style pendant, concrete coffee table',
      'Industrial living room, riveted metal console, distressed leather sectional, gooseneck floor lamp, raw timber accents',
    ],
  },
  {
    id: 'biophilic',
    label: 'Biophilic',
    image: require('../assets/styles/biophilic.jpg'),
    prompts: [
      'Biophilic living room, terracotta sofa, live-edge coffee table, hanging plants, jute rug, woven pendant',
      'Biophilic living room, sage linen sectional, fiddle-leaf fig, oak slat console, rattan pendant, moss-toned rug',
      'Biophilic living room, clay-toned bouclé chair, stone coffee table, trailing pothos shelf, hemp area rug',
    ],
  },
  {
    id: 'maximalist',
    label: 'Maximalist',
    image: require('../assets/styles/maximalist.jpg'),
    prompts: [
      'Maximalist living room, jewel velvet sofa, brass coffee table, layered textiles, gallery wall, statement chandelier',
      'Maximalist living room, emerald velvet sectional, lacquered ruby side table, Persian rug, brass starburst chandelier',
      'Maximalist living room, sapphire damask armchair, mirrored chest, layered Oushak rugs, opulent crystal pendant',
    ],
  },
  {
    id: 'rustic',
    label: 'Rustic',
    image: require('../assets/styles/rustic.jpg'),
    prompts: [
      'Rustic living room, leather sofa, reclaimed wood coffee table, woven wool rug, iron pendant lamp',
      'Rustic living room, hewn-log mantle, oxblood leather armchair, kilim rug, hammered-copper accents',
      'Rustic living room, weathered timber sideboard, plaid wool throw, slate-tone area rug, wrought-iron candelabra',
    ],
  },
  {
    id: 'brutalist',
    label: 'Brutalist',
    image: require('../assets/styles/brutalist.jpg'),
    prompts: [
      'Brutalist living room, concrete coffee table, dark leather sofa, raw stone accents, sculptural floor lamp',
      'Brutalist living room, monolithic stone console, charcoal mohair sectional, geometric pendant, polished concrete floor',
      'Brutalist living room, board-formed concrete shelf, blackened-steel armchair, slab marble side table, alabaster pendant',
    ],
  },
  {
    id: 'bohemian',
    label: 'Bohemian',
    image: require('../assets/styles/bohemian.jpg'),
    prompts: [
      'Bohemian living room, terracotta sofa, rattan lounge chair, kilim rug, macramé wall hanging, brass pendant',
      'Bohemian living room, vintage Persian rug, woven seagrass coffee table, layered textiles, hanging plants, paper lantern',
      'Bohemian living room, warm sienna velvet sofa, hand-carved wood console, layered jute rugs, fringed throw pillows',
    ],
  },
  {
    id: 'glam',
    label: 'Glam',
    image: require('../assets/styles/glam.jpg'),
    prompts: [
      'Glam living room, jewel velvet sofa, mirrored coffee table, crystal chandelier, gold accents, lacquered console',
      'Glam living room, channel-tufted blush velvet sofa, polished brass coffee table, beveled mirror panels, opulent crystal pendant',
      'Glam living room, sapphire velvet armchair, lacquered black side table, gilded mirror, plush silk curtains, marble fireplace',
    ],
  },
  {
    id: 'art-deco',
    label: 'Art Deco',
    image: require('../assets/styles/art-deco.jpg'),
    prompts: [
      'Art deco living room, geometric brass coffee table, channel-tufted velvet sofa, sunburst mirror, lacquer console',
      'Art deco living room, scalloped emerald velvet sofa, polished marble side table, fluted gold sconces, geometric area rug',
      'Art deco living room, black-and-gold cabinet, curved bouclé chair, fan-pattern rug, alabaster pendant, walnut burl coffee table',
    ],
  },
  {
    id: 'dark-luxe',
    label: 'Dark Luxe',
    image: require('../assets/styles/dark-luxe.jpg'),
    prompts: [
      'Dark luxe living room, charcoal velvet sofa, blackened bronze coffee table, sculptural floor lamp, smoked glass accents',
      'Dark luxe living room, deep espresso leather sectional, marble side table, brass orb pendant, moody charcoal wall',
      'Dark luxe living room, oxblood velvet armchair, blackened steel shelving, smoky-glass coffee table, sculptural alabaster lamp',
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
