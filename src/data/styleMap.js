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
  'living-room': ['living', 'lounge', 'sitting', 'family room', 'great room', 'den', 'tv room'],
  'bedroom':     ['bedroom', 'master', 'sleeping', 'sleep', 'bed room', 'suite', 'boudoir'],
  'kitchen':     ['kitchen', 'cooking', 'culinary', 'chef', 'pantry', 'galley'],
  'dining-room': ['dining', 'dinner', 'eat', 'breakfast nook', 'banquet'],
  'office':      ['office', 'workspace', 'study', 'home office', 'work from home', 'wfh', 'desk'],
  'bathroom':    ['bathroom', 'bath', 'spa', 'powder room', 'ensuite'],
  'outdoor':     ['outdoor', 'patio', 'garden', 'terrace', 'backyard', 'deck'],
  'nursery':     ['nursery', 'baby', 'kids room', 'children', 'playroom'],
  'entryway':    ['entryway', 'foyer', 'hallway', 'entrance', 'mudroom'],
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
  velvet:   ['velvet', 'plush', 'soft'],
  linen:    ['linen', 'natural fiber', 'flax'],
  leather:  ['leather', 'leather sofa', 'leather chair', 'genuine leather', 'faux leather'],
  rattan:   ['rattan', 'wicker', 'cane', 'bamboo'],
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
export const STYLE_AFFINITY = {
  minimalist:     { minimalist: 1, scandi: 0.8, japandi: 0.8, contemporary: 0.6, transitional: 0.4 },
  japandi:        { japandi: 1, minimalist: 0.8, 'wabi-sabi': 0.8, scandi: 0.5 },
  rustic:         { rustic: 1, farmhouse: 0.8, 'mid-century': 0.3, bohemian: 0.4 },
  industrial:     { industrial: 1, 'mid-century': 0.4, 'dark-luxe': 0.5, contemporary: 0.4 },
  coastal:        { coastal: 1, mediterranean: 0.6, bohemian: 0.4, transitional: 0.5 },
  'art-deco':     { 'art-deco': 1, glam: 0.8, luxury: 0.7, maximalist: 0.5 },
  'mid-century':  { 'mid-century': 1, contemporary: 0.5, industrial: 0.4, transitional: 0.5 },
  bohemian:       { bohemian: 1, 'wabi-sabi': 0.5, rustic: 0.4, maximalist: 0.6 },
  scandi:         { scandi: 1, minimalist: 0.9, japandi: 0.6, transitional: 0.5 },
  'dark-luxe':    { 'dark-luxe': 1, luxury: 0.8, glam: 0.6, industrial: 0.4 },
  biophilic:      { biophilic: 1, bohemian: 0.5, rustic: 0.4, 'wabi-sabi': 0.6 },
  transitional:   { transitional: 1, contemporary: 0.7, minimalist: 0.5, scandi: 0.5 },
  contemporary:   { contemporary: 1, minimalist: 0.6, transitional: 0.7, 'mid-century': 0.5 },
  farmhouse:      { farmhouse: 1, rustic: 0.8, coastal: 0.3, transitional: 0.5 },
  mediterranean:  { mediterranean: 1, coastal: 0.6, rustic: 0.5, bohemian: 0.4 },
  'wabi-sabi':    { 'wabi-sabi': 1, japandi: 0.9, rustic: 0.4, biophilic: 0.6 },
  maximalist:     { maximalist: 1, 'art-deco': 0.5, bohemian: 0.6, glam: 0.7 },
  'french-country': { 'french-country': 1, rustic: 0.6, farmhouse: 0.5, transitional: 0.6 },
  glam:           { glam: 1, luxury: 0.8, 'art-deco': 0.8, 'dark-luxe': 0.5 },
  luxury:         { luxury: 1, glam: 0.8, 'art-deco': 0.7, 'dark-luxe': 0.6 },
};
