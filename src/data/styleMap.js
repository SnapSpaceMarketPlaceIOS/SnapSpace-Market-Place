// Style taxonomy: maps design styles, room types, materials, and moods
// to product categories and search keywords.
// Used by promptParser.js and productMatcher.js.

// ─── Room Types ────────────────────────────────────────────────────────────────
export const ROOM_TYPES = [
  'living-room', 'bedroom', 'kitchen', 'dining-room', 'office',
  'bathroom', 'outdoor', 'nursery', 'entryway',
];

// Keywords that indicate each room type
export const ROOM_KEYWORDS = {
  'living-room': ['living', 'lounge', 'sitting', 'family room', 'great room', 'den', 'tv room', 'nook', 'reading nook', 'media room', 'sunroom', 'sun room', 'loft'],
  'bedroom':     ['bedroom', 'master', 'sleeping', 'sleep', 'bed room', 'suite', 'boudoir', 'guest room', 'master bedroom', 'primary bedroom'],
  'kitchen':     ['kitchen', 'cooking', 'culinary', 'chef', 'pantry', 'galley', 'breakfast area', 'kitchenette'],
  'dining-room': ['dining', 'dinner', 'eat', 'breakfast nook', 'banquet', 'eating area', 'dining area', 'breakfast room'],
  'office':      ['office', 'workspace', 'study', 'home office', 'work from home', 'wfh', 'desk', 'studio', 'library', 'craft room'],
  'bathroom':    ['bathroom', 'bath', 'spa', 'powder room', 'ensuite', 'washroom', 'restroom', 'shower room', 'en-suite'],
  'outdoor':     ['outdoor', 'patio', 'garden', 'terrace', 'backyard', 'deck', 'porch', 'balcony', 'veranda', 'lanai', 'poolside'],
  'nursery':     ['nursery', 'baby', 'kids room', 'children', 'playroom', 'toddler room', 'kids bedroom', "child's room"],
  'entryway':    ['entryway', 'foyer', 'hallway', 'entrance', 'mudroom', 'vestibule', 'front hall', 'lobby'],
};

// Default furniture categories for each room type
export const ROOM_FURNITURE = {
  'living-room': ['sofa', 'accent-chair', 'coffee-table', 'rug', 'floor-lamp', 'side-table', 'bookshelf', 'mirror'],
  'bedroom':     ['bed', 'nightstand', 'dresser', 'rug', 'table-lamp', 'mirror', 'throw-blanket', 'throw-pillow'],
  'kitchen':     ['bar-stool', 'pendant-light', 'rug', 'vase', 'wall-art'],
  'dining-room': ['dining-table', 'dining-chair', 'chandelier', 'rug', 'mirror', 'wall-art'],
  'office':      ['desk', 'desk-chair', 'bookshelf', 'floor-lamp', 'rug', 'planter'],
  'bathroom':    ['mirror', 'vase', 'planter', 'wall-art'],
  'outdoor':     ['planter', 'rug', 'wall-art'],
  'nursery':     ['bookshelf', 'rug', 'floor-lamp', 'throw-pillow'],
  'entryway':    ['mirror', 'side-table', 'bookshelf', 'vase', 'wall-art'],
};

// ─── Design Styles ─────────────────────────────────────────────────────────────
export const DESIGN_STYLES = [
  'minimalist', 'japandi', 'rustic', 'industrial', 'coastal', 'art-deco',
  'mid-century', 'bohemian', 'scandi', 'dark-luxe', 'biophilic',
  'transitional', 'contemporary', 'farmhouse', 'mediterranean',
  'wabi-sabi', 'maximalist', 'french-country', 'glam', 'luxury',
];

// Keywords that indicate each style
export const STYLE_KEYWORDS = {
  'minimalist':     ['minimalist', 'minimal', 'clean lines', 'simple', 'clutter-free', 'pared back', 'restrained'],
  'japandi':        ['japandi', 'japanese', 'japan', 'zen', 'wabi', 'sabi', 'neutral palette', 'quiet'],
  'rustic':         ['rustic', 'cabin', 'country', 'raw', 'weathered', 'distressed', 'reclaimed'],
  'industrial':     ['industrial', 'loft', 'warehouse', 'factory', 'steel', 'iron', 'concrete', 'raw brick', 'exposed'],
  'coastal':        ['coastal', 'beach', 'ocean', 'nautical', 'seaside', 'cerulean', 'whitewash', 'driftwood'],
  'art-deco':       ['art deco', 'deco', 'geometric', 'chevron', 'gatsby', 'glamour', 'gilded', 'jewel tones'],
  'mid-century':    ['mid century', 'midcentury', 'mid-century', 'retro', 'eames', 'atomic', 'teak', '1950', '1960'],
  'bohemian':       ['bohemian', 'boho', 'eclectic', 'layered', 'free spirit', 'global', 'tribal', 'macrame'],
  'scandi':         ['scandi', 'scandinavian', 'nordic', 'hygge', 'danish', 'swedish', 'norwegian', 'finnish'],
  'dark-luxe':      ['dark luxe', 'moody', 'dramatic', 'dark', 'navy', 'charcoal', 'black', 'deep tones'],
  'biophilic':      ['biophilic', 'nature', 'plants', 'botanical', 'green wall', 'living wall', 'earthy', 'organic'],
  'transitional':   ['transitional', 'classic', 'timeless', 'neutral', 'balanced', 'refined'],
  'contemporary':   ['contemporary', 'modern', 'current', 'sleek', 'streamlined', 'urban'],
  'farmhouse':      ['farmhouse', 'shiplap', 'barn door', 'cotton', 'white wood', 'joanna', 'vintage'],
  'mediterranean':  ['mediterranean', 'tuscan', 'spanish', 'greek', 'terracotta', 'whitewashed', 'villa'],
  'wabi-sabi':      ['wabi sabi', 'wabi-sabi', 'imperfect', 'raw plaster', 'worn', 'textured', 'aged'],
  'maximalist':     ['maximalist', 'bold', 'colorful', 'layered', 'more is more', 'saturated', 'vibrant'],
  'french-country': ['french country', 'french', 'provençal', 'parisian', 'toile', 'ornate'],
  'glam':           ['glam', 'glamorous', 'luxe', 'gold', 'crystal', 'velvet', 'mirrored'],
  'luxury':         ['luxury', 'high end', 'premium', 'opulent', 'bespoke', 'estate', 'designer'],
};

// ─── Materials ─────────────────────────────────────────────────────────────────
export const MATERIALS = [
  'wood', 'marble', 'velvet', 'linen', 'leather', 'rattan', 'concrete',
  'brass', 'copper', 'ceramic', 'glass', 'wicker', 'oak', 'walnut',
  'teak', 'bamboo', 'jute', 'wool', 'silk', 'cotton',
];

export const MATERIAL_KEYWORDS = {
  wood:     ['wood', 'wooden', 'timber', 'hardwood', 'plywood'],
  marble:   ['marble', 'stone', 'travertine', 'terrazzo'],
  // NOTE: 'plush' and 'soft' describe TEXTURE, not material — a soft leather
  // couch is NOT a velvet couch. Previously these words caused "soft brown
  // leather couch" to be tagged as {leather, velvet} which then let a velvet
  // sofa win over the leather one. Only true velvet words belong here.
  velvet:   ['velvet'],
  linen:    ['linen', 'natural fiber', 'flax'],
  leather:  ['leather', 'leather sofa', 'leather chair', 'genuine leather', 'faux leather'],
  rattan:   ['rattan', 'wicker', 'cane', 'bamboo'],
  wicker:   ['wicker', 'rattan', 'cane', 'woven'],
  bamboo:   ['bamboo', 'bamboo shoot', 'zen', 'tropical'],
  jute:     ['jute', 'sisal', 'hemp', 'natural weave', 'woven rug'],
  silk:     ['silk', 'satin', 'sheen', 'lustrous', 'luxe fabric'],
  cotton:   ['cotton', 'percale', 'muslin', 'canvas', 'natural cotton'],
  concrete: ['concrete', 'cement', 'raw'],
  brass:    ['brass', 'gold', 'golden', 'antique brass'],
  copper:   ['copper', 'bronze', 'rose gold'],
  ceramic:  ['ceramic', 'pottery', 'terracotta', 'clay'],
  glass:    ['glass', 'acrylic', 'lucite', 'translucent'],
  oak:      ['oak', 'light wood', 'blonde wood'],
  walnut:   ['walnut', 'dark wood', 'rich wood'],
  teak:     ['teak', 'tropical wood'],
  wool:     ['wool', 'cashmere', 'cozy'],
};

// ─── Moods ─────────────────────────────────────────────────────────────────────
export const MOOD_KEYWORDS = {
  warm:   ['warm', 'cozy', 'inviting', 'amber', 'honey', 'golden', 'sunset'],
  cool:   ['cool', 'airy', 'fresh', 'breezy', 'pale', 'icy', 'serene'],
  moody:  ['moody', 'dramatic', 'dark', 'atmospheric', 'intimate', 'cocooning'],
  bright: ['bright', 'light', 'airy', 'white', 'open', 'sun-filled', 'luminous'],
  earthy: ['earthy', 'natural', 'organic', 'grounded', 'terracotta', 'clay', 'sand'],
  bold:   ['bold', 'vibrant', 'saturated', 'colorful', 'vivid', 'striking'],
};

// ─── Style → Product Style Score ───────────────────────────────────────────────
// How well does each design style match each product style tag?
// Used by productMatcher to weight product relevance.
// NOTE on aliases: The catalog uses both `modern`/`contemporary` and
// `scandi`/`scandinavian` interchangeably. Both spellings are keys here and
// every related style maps to BOTH variants, so ANY product style value can
// be matched regardless of which spelling the designer used.
//
// ── Build 71 Fix #4 — catalog-aware rewrite ────────────────────────────────
// Audited 2026-04-22 against live catalog counts (399 products):
//   Starved styles (≤8 products): biophilic(8), mediterranean(3), wabi-sabi(2), french-country(1)
//   Thin styles (12–19):          maximalist(12), dark-luxe(15), scandinavian(19)
//   Dead style tag:                'luxury' (0 products in catalog)
//
// Three edges referenced `luxury` as a target — dead weight since no product
// carries that tag. Those edges are replaced with real alternative routes.
// Starved/thin rows now reach more viable neighbors so the 0.25 style-filter
// threshold doesn't dead-end them into the unfiltered fallback pool.
export const STYLE_AFFINITY = {
  minimalist:     { minimalist: 1, scandi: 0.8, scandinavian: 0.8, japandi: 0.8, contemporary: 0.6, modern: 0.7, transitional: 0.4, 'wabi-sabi': 0.4 },
  japandi:        { japandi: 1, minimalist: 0.8, 'wabi-sabi': 0.8, scandi: 0.5, scandinavian: 0.5, modern: 0.5, contemporary: 0.4, biophilic: 0.4 },
  rustic:         { rustic: 1, farmhouse: 0.8, 'mid-century': 0.3, bohemian: 0.4, 'french-country': 0.5, mediterranean: 0.4 },
  industrial:     { industrial: 1, 'mid-century': 0.4, 'dark-luxe': 0.5, contemporary: 0.4, modern: 0.5, 'art-deco': 0.3 },
  coastal:        { coastal: 1, mediterranean: 0.6, bohemian: 0.4, transitional: 0.5, farmhouse: 0.4, scandi: 0.3, scandinavian: 0.3 },
  // 'luxury: 0.7' removed — dead target. Added dark-luxe / industrial / mid-century routes.
  'art-deco':     { 'art-deco': 1, glam: 0.8, maximalist: 0.5, 'dark-luxe': 0.5, industrial: 0.3, 'mid-century': 0.4 },
  'mid-century':  { 'mid-century': 1, contemporary: 0.5, modern: 0.5, industrial: 0.4, transitional: 0.5, 'art-deco': 0.3, minimalist: 0.4 },
  bohemian:       { bohemian: 1, 'wabi-sabi': 0.5, rustic: 0.4, maximalist: 0.6, coastal: 0.4, 'mid-century': 0.3, biophilic: 0.5 },
  scandi:         { scandi: 1, scandinavian: 1, minimalist: 0.9, japandi: 0.6, transitional: 0.5, contemporary: 0.6, modern: 0.6, coastal: 0.3, biophilic: 0.3 },
  scandinavian:   { scandinavian: 1, scandi: 1, minimalist: 0.9, japandi: 0.6, transitional: 0.5, contemporary: 0.6, modern: 0.6, coastal: 0.3, biophilic: 0.3 },
  // 'luxury: 0.8' removed — dead target. Added art-deco (strong) / mid-century routes.
  'dark-luxe':    { 'dark-luxe': 1, glam: 0.6, industrial: 0.4, 'mid-century': 0.4, 'art-deco': 0.6, maximalist: 0.3 },
  // Biophilic (8 products) — widened neighbor set so prompts don't dead-end.
  biophilic:      { biophilic: 1, bohemian: 0.5, rustic: 0.4, 'wabi-sabi': 0.6, scandi: 0.4, scandinavian: 0.4, minimalist: 0.4, japandi: 0.5, coastal: 0.3 },
  transitional:   { transitional: 1, contemporary: 0.7, modern: 0.6, minimalist: 0.5, scandi: 0.5, scandinavian: 0.5, 'mid-century': 0.4, farmhouse: 0.3 },
  contemporary:   { contemporary: 1, modern: 0.9, minimalist: 0.6, transitional: 0.7, 'mid-century': 0.5, scandinavian: 0.6, scandi: 0.6, industrial: 0.4, glam: 0.3 },
  modern:         { modern: 1, contemporary: 0.9, minimalist: 0.7, transitional: 0.7, 'mid-century': 0.5, scandinavian: 0.5, scandi: 0.5, industrial: 0.5 },
  farmhouse:      { farmhouse: 1, rustic: 0.8, coastal: 0.3, transitional: 0.5, 'french-country': 0.5, mediterranean: 0.3 },
  // Mediterranean (3 products) — added farmhouse (whitewashed villa overlap).
  mediterranean:  { mediterranean: 1, coastal: 0.6, rustic: 0.5, bohemian: 0.4, farmhouse: 0.4, 'french-country': 0.3 },
  // Wabi-sabi (2 products) — added minimalist + industrial (raw materials).
  'wabi-sabi':    { 'wabi-sabi': 1, japandi: 0.9, rustic: 0.4, biophilic: 0.6, minimalist: 0.5, industrial: 0.3 },
  // Maximalist (12 products) — added mid-century + transitional routes.
  maximalist:     { maximalist: 1, 'art-deco': 0.5, bohemian: 0.6, glam: 0.7, 'mid-century': 0.4, transitional: 0.3 },
  // French-country (1 product) — added bohemian (provençal) + coastal (riviera).
  'french-country': { 'french-country': 1, rustic: 0.6, farmhouse: 0.5, transitional: 0.6, bohemian: 0.4, coastal: 0.3, mediterranean: 0.4 },
  // 'luxury: 0.8' removed — dead target. Added maximalist / contemporary routes.
  glam:           { glam: 1, 'art-deco': 0.8, 'dark-luxe': 0.5, maximalist: 0.4, contemporary: 0.3 },
  // Luxury itself is detectable in user prompts but has no product matches —
  // this row exists so "luxury living room" prompts route ENTIRELY through
  // glam / art-deco / dark-luxe rather than falling to the unfiltered pool.
  luxury:         { luxury: 1, glam: 0.8, 'art-deco': 0.7, 'dark-luxe': 0.6, 'mid-century': 0.3, transitional: 0.3 },
};
