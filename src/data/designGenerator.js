/**
 * designGenerator.js
 * Generates 458 design entries by combining room types, design styles,
 * verified images from the pool, and product IDs from the catalog.
 * IDs start at 43 (original 42 hand-curated designs use 1–42).
 */
import { IMAGE_POOL } from './imagePool';

// ── Room-visible product mapping (STRICT) ────────────────────────────────────
// Only products that would actually be SEENin a room photo of that type.
// A kitchen photo shows bar stools & pendants — never a sofa.
// A bedroom photo shows beds, nightstands, lamps, rugs — never dining chairs.
const ROOM_VISIBLE_PRODUCTS = {
  'living-room': {
    base:         ['amz-s001','amz-s003','amz-s004','amz-s005','amz-t001','amz-t003','amz-t004','amz-c002','amz-c004','amz-r001','amz-r002','amz-r003','amz-fl002','amz-fl004','amz-bk001','amz-wa001','amz-wa002','amz-pv001','amz-pv002','amz-tp001','amz-tb001'],
    minimalist:   ['amz-s001','amz-t001','amz-c004','amz-r001','amz-fl005','amz-wa001','amz-pv002','amz-tp001'],
    scandi:       ['amz-s005','amz-t001','amz-c004','amz-r001','amz-fl002','amz-tb001','amz-tp001','amz-wa001'],
    japandi:      ['amz-s001','amz-t005','amz-fl005','amz-r001','amz-pv001','amz-wa001','amz-tp001'],
    'mid-century':['amz-s006','amz-s007','amz-t004','amz-c001','amz-c003','amz-fl002','amz-bk001','amz-r001'],
    contemporary: ['amz-s003','amz-s004','amz-t002','amz-c001','amz-r004','amz-fl001','amz-wa001','amz-m001'],
    bohemian:     ['amz-c002','amz-r002','amz-r003','amz-fl004','amz-tp002','amz-tb001','amz-pv001','amz-pv004','amz-wa002'],
    'dark-luxe':  ['amz-s004','amz-s008','amz-r006','amz-tp002','amz-tb002','amz-fl003','amz-wa003','amz-bk002'],
    industrial:   ['amz-s007','amz-t004','amz-c003','amz-fl003','amz-bk002','amz-r006','amz-wa003'],
    coastal:      ['amz-s005','amz-c002','amz-r003','amz-r004','amz-fl004','amz-tb001','amz-wa002','amz-pv004'],
    'art-deco':   ['amz-s002','amz-s008','amz-t002','amz-c001','amz-r002','amz-fl001','amz-m002','amz-pv003'],
    farmhouse:    ['amz-s005','amz-t003','amz-c002','amz-r003','amz-tb001','amz-fl004','amz-wa002'],
    biophilic:    ['amz-c002','amz-fl004','amz-pv001','amz-pv004','amz-r003','amz-wa002','amz-tb001'],
    transitional: ['amz-s005','amz-t001','amz-c004','amz-r001','amz-fl002','amz-tp001','amz-tb001','amz-m001'],
    rustic:       ['amz-s005','amz-t003','amz-c003','amz-r003','amz-bk002','amz-fl004','amz-wa002'],
    glam:         ['amz-s002','amz-s008','amz-t002','amz-fl001','amz-r002','amz-tp002','amz-m002'],
    maximalist:   ['amz-s008','amz-r002','amz-fl001','amz-tp002','amz-wa002','amz-pv002','amz-m002'],
    'french-country':['amz-s002','amz-r002','amz-fl001','amz-tp002','amz-m002','amz-wa002'],
    'wabi-sabi':  ['amz-t005','amz-pv001','amz-r001','amz-tp001','amz-wa001','amz-fl005'],
    mediterranean:['amz-t005','amz-c002','amz-r002','amz-pv001','amz-wa002','amz-tb001'],
  },
  bedroom: {
    base:         ['amz-b001','amz-b002','amz-b003','amz-b004','amz-n001','amz-n002','amz-n003','amz-dr001','amz-dr002','amz-r001','amz-r004','amz-r005','amz-r006','amz-tl001','amz-tl002','amz-tl003','amz-m001','amz-m003','amz-wa001','amz-wa002','amz-tp001','amz-tp002','amz-tb001','amz-tb002','amz-fl002','amz-fl004'],
    minimalist:   ['amz-b001','amz-n003','amz-r001','amz-tl003','amz-wa001','amz-tp001','amz-dr001'],
    scandi:       ['amz-b001','amz-n001','amz-r001','amz-tl003','amz-tp001','amz-tb001','amz-dr002'],
    japandi:      ['amz-b003','amz-n003','amz-r001','amz-tl003','amz-pv001','amz-wa001','amz-tp001'],
    'mid-century':['amz-b003','amz-n001','amz-r001','amz-tl002','amz-dr001','amz-wa001'],
    contemporary: ['amz-b001','amz-n002','amz-r004','amz-fl001','amz-tl002','amz-m001','amz-wa001'],
    bohemian:     ['amz-b004','amz-r005','amz-tl001','amz-fl004','amz-tp002','amz-tb001','amz-wa002','amz-pv004'],
    'dark-luxe':  ['amz-b002','amz-n002','amz-r006','amz-tl002','amz-tp002','amz-tb002','amz-m001'],
    coastal:      ['amz-b004','amz-n001','amz-r004','amz-tl001','amz-tb001','amz-m003','amz-wa002'],
    'art-deco':   ['amz-b002','amz-n002','amz-r002','amz-tl002','amz-fl001','amz-m002'],
    farmhouse:    ['amz-b004','amz-n001','amz-r005','amz-tl001','amz-tb001','amz-dr002','amz-wa002'],
    biophilic:    ['amz-b001','amz-n003','amz-r001','amz-pv001','amz-fl004','amz-wa002'],
    transitional: ['amz-b001','amz-n001','amz-r001','amz-tl002','amz-tp001','amz-tb001','amz-m001'],
    rustic:       ['amz-b004','amz-n001','amz-r005','amz-tl001','amz-tb001','amz-dr002'],
    glam:         ['amz-b002','amz-n002','amz-r002','amz-fl001','amz-tp002','amz-m002'],
    maximalist:   ['amz-b002','amz-n002','amz-r002','amz-fl001','amz-tp002','amz-wa002'],
    'french-country':['amz-b004','amz-n002','amz-r002','amz-tl002','amz-tp002','amz-m003'],
    'wabi-sabi':  ['amz-b003','amz-n003','amz-r001','amz-tl001','amz-tp001','amz-wa001'],
  },
  kitchen: {
    base:         ['amz-bs001','amz-bs002','amz-bs003','amz-pl001','amz-pl002','amz-pl003','amz-pl004'],
    contemporary: ['amz-bs001','amz-pl002','amz-pl003'],
    farmhouse:    ['amz-bs002','amz-pl001','amz-pl003'],
    coastal:      ['amz-bs002','amz-pl001','amz-pl004'],
    industrial:   ['amz-bs003','amz-pl003','amz-pl004'],
    transitional: ['amz-bs001','amz-pl002','amz-pl004'],
    minimalist:   ['amz-bs001','amz-pl002'],
    'mid-century':['amz-bs002','amz-pl002'],
    scandi:       ['amz-bs001','amz-pl001'],
    mediterranean:['amz-bs002','amz-pl001'],
    'dark-luxe':  ['amz-bs003','amz-pl003'],
    'french-country':['amz-bs002','amz-pl001','amz-pl004'],
    bohemian:     ['amz-bs002','amz-pl001'],
    biophilic:    ['amz-bs001','amz-pl001'],
    glam:         ['amz-bs001','amz-pl002','amz-pl004'],
    rustic:       ['amz-bs002','amz-pl001'],
  },
  'dining-room': {
    base:         ['amz-dt001','amz-dt002','amz-dt003','amz-dt004','amz-dc001','amz-dc002','amz-dc003','amz-dc004','amz-pl001','amz-pl002','amz-pl003','amz-pl004','amz-r001','amz-r002','amz-pv002','amz-m002'],
    transitional: ['amz-dt001','amz-dc002','amz-pl001','amz-r001','amz-pv002'],
    contemporary: ['amz-dt002','amz-dc003','amz-pl002','amz-r004','amz-m002'],
    rustic:       ['amz-dt001','amz-dc002','amz-pl001','amz-r003','amz-wa002'],
    farmhouse:    ['amz-dt001','amz-dc002','amz-pl001','amz-r003'],
    glam:         ['amz-dt003','amz-dc001','amz-pl004','amz-r002','amz-m002'],
    japandi:      ['amz-dt002','amz-dc003','amz-pl002','amz-r001','amz-pv002'],
    'mid-century':['amz-dt002','amz-dc003','amz-pl002','amz-r001'],
    'art-deco':   ['amz-dt003','amz-dc001','amz-pl004','amz-r002'],
    coastal:      ['amz-dt001','amz-dc002','amz-pl001','amz-r003'],
    'dark-luxe':  ['amz-dt004','amz-dc004','amz-pl003','amz-r006'],
    minimalist:   ['amz-dt002','amz-dc003','amz-pl002','amz-r001'],
    scandi:       ['amz-dt001','amz-dc003','amz-pl001','amz-r001'],
    mediterranean:['amz-dt001','amz-dc002','amz-pl001','amz-r002','amz-pv002'],
    maximalist:   ['amz-dt003','amz-dc001','amz-pl004','amz-r002','amz-m002'],
  },
  office: {
    base:         ['amz-d001','amz-d002','amz-d003','amz-d004','amz-dc-01','amz-dc-02','amz-dc-03','amz-bk001','amz-bk002','amz-fl002','amz-fl003','amz-fl005','amz-tl003','amz-pv001','amz-pv003','amz-pv004','amz-wa001','amz-wa003'],
    minimalist:   ['amz-d001','amz-dc-02','amz-bk001','amz-fl005','amz-tl003','amz-wa001'],
    scandi:       ['amz-d001','amz-dc-02','amz-bk001','amz-fl002','amz-tl003','amz-pv001'],
    contemporary: ['amz-d002','amz-dc-02','amz-bk001','amz-fl002','amz-wa001'],
    industrial:   ['amz-d002','amz-dc-02','amz-bk002','amz-fl003','amz-wa003'],
    'mid-century':['amz-d001','amz-dc-03','amz-bk001','amz-fl002','amz-tl002'],
    'dark-luxe':  ['amz-d004','amz-dc-02','amz-bk002','amz-fl003','amz-wa003'],
    biophilic:    ['amz-d004','amz-dc-01','amz-bk001','amz-fl004','amz-pv001','amz-pv004'],
    japandi:      ['amz-d001','amz-dc-02','amz-bk001','amz-fl005','amz-pv001','amz-wa001'],
    transitional: ['amz-d001','amz-dc-02','amz-bk001','amz-fl002','amz-wa001'],
    bohemian:     ['amz-d003','amz-dc-01','amz-bk001','amz-fl004','amz-pv004'],
    'art-deco':   ['amz-d001','amz-dc-03','amz-bk001','amz-fl001','amz-pv003'],
    maximalist:   ['amz-d001','amz-dc-03','amz-bk001','amz-fl001','amz-wa003'],
  },
  bathroom: {
    base:   ['amz-m001','amz-m002','amz-m003','amz-pv001','amz-tl001','amz-wa001','amz-wa002'],
  },
  outdoor: {
    base:   ['amz-r003','amz-pv001','amz-pv004','amz-wa002','amz-fl004','amz-tb001'],
  },
  entryway: {
    base:   ['amz-m001','amz-m002','amz-m003','amz-r001','amz-r003','amz-pv002','amz-pv001'],
  },
  nursery: {
    base:   ['amz-b004','amz-r005','amz-wa002','amz-pv004','amz-tl001','amz-tp001','amz-tb001'],
  },
};

function pickProducts(roomType, style, count = 5) {
  const roomEntry = ROOM_VISIBLE_PRODUCTS[roomType];
  if (!roomEntry) return (ROOM_VISIBLE_PRODUCTS['living-room'].base || []).slice(0, count);

  // Prefer style-specific list; fall back to base room list
  const styleList = roomEntry[style] || roomEntry.base || [];
  const base = roomEntry.base || [];

  // Merge: style matches first, then fill from base (all strictly in this room)
  const combined = [...new Set([...styleList, ...base])];
  return combined.slice(0, count);
}

// ── Title / description templates ─────────────────────────────────────────────
const ROOM_LABELS = {
  'living-room': 'Living Room',
  bedroom:       'Bedroom',
  kitchen:       'Kitchen',
  'dining-room': 'Dining Room',
  office:        'Home Office',
  bathroom:      'Bathroom',
  outdoor:       'Outdoor Space',
  entryway:      'Entryway',
  nursery:       'Nursery',
};

const STYLE_LABELS = {
  minimalist:      'Minimalist',
  scandi:          'Scandinavian',
  japandi:         'Japandi',
  'mid-century':   'Mid-Century Modern',
  contemporary:    'Contemporary',
  bohemian:        'Bohemian',
  'dark-luxe':     'Dark Luxe',
  industrial:      'Industrial',
  coastal:         'Coastal',
  'art-deco':      'Art Deco',
  farmhouse:       'Farmhouse',
  biophilic:       'Biophilic',
  transitional:    'Transitional',
  rustic:          'Rustic',
  glam:            'Glam',
  maximalist:      'Maximalist',
  'french-country':'French Country',
  'wabi-sabi':     'Wabi-Sabi',
  mediterranean:   'Mediterranean',
};

const VARIANT_ADJECTIVES = [
  ['Serene', 'Airy', 'Open'],
  ['Bold', 'Dramatic', 'Statement'],
  ['Warm', 'Cozy', 'Inviting'],
  ['Clean', 'Curated', 'Refined'],
  ['Earthy', 'Organic', 'Natural'],
];

const DESCRIPTIONS = {
  minimalist:    (room, adj) => `${adj} ${ROOM_LABELS[room]} stripped to its essentials — clean lines, negative space, and purposeful objects. Prompt: "Minimalist ${room.replace('-', ' ')}, white walls, oak accents."`,
  scandi:        (room, adj) => `${adj} Scandinavian ${ROOM_LABELS[room].toLowerCase()} with hygge warmth. Soft textures, pale woods, and candlelight. Prompt: "Scandi ${room.replace('-', ' ')}, birch, linen, hygge."`,
  japandi:       (room, adj) => `${adj} Japandi ${ROOM_LABELS[room].toLowerCase()} balancing Japanese calm with Nordic function. Prompt: "Japandi ${room.replace('-', ' ')}, wabi-sabi, oak, muted palette."`,
  'mid-century': (room, adj) => `${adj} Mid-Century ${ROOM_LABELS[room].toLowerCase()} with teak, walnut, and organic forms. Prompt: "Mid-century modern ${room.replace('-', ' ')}, walnut legs, mustard, geometric."`,
  contemporary:  (room, adj) => `${adj} contemporary ${ROOM_LABELS[room].toLowerCase()} — sophisticated and current. Prompt: "Contemporary ${room.replace('-', ' ')}, neutral palette, mixed materials."`,
  bohemian:      (room, adj) => `${adj} bohemian ${ROOM_LABELS[room].toLowerCase()} layered with global textiles and plants. Prompt: "Boho ${room.replace('-', ' ')}, rattan, macramé, warm amber tones."`,
  'dark-luxe':   (room, adj) => `${adj} dark-luxe ${ROOM_LABELS[room].toLowerCase()} — midnight hues, gold accents, dramatic flair. Prompt: "Dark luxe ${room.replace('-', ' ')}, navy, black, gold, velvet."`,
  industrial:    (room, adj) => `${adj} industrial ${ROOM_LABELS[room].toLowerCase()} with exposed steel, concrete, and raw edges. Prompt: "Industrial ${room.replace('-', ' ')}, exposed brick, black metal, Edison bulbs."`,
  coastal:       (room, adj) => `${adj} coastal ${ROOM_LABELS[room].toLowerCase()} — ocean-blue accents, whitewash, rattan. Prompt: "Coastal ${room.replace('-', ' ')}, whites, ocean blues, natural fiber."`,
  'art-deco':    (room, adj) => `${adj} Art Deco ${ROOM_LABELS[room].toLowerCase()} with geometric glamour and metallic finishes. Prompt: "Art deco ${room.replace('-', ' ')}, gold, geometric patterns, velvet."`,
  farmhouse:     (room, adj) => `${adj} farmhouse ${ROOM_LABELS[room].toLowerCase()} with shiplap, reclaimed wood, and vintage charm. Prompt: "Modern farmhouse ${room.replace('-', ' ')}, white, wood, linen."`,
  biophilic:     (room, adj) => `${adj} biophilic ${ROOM_LABELS[room].toLowerCase()} celebrating nature through plants, wood, and natural light. Prompt: "Biophilic ${room.replace('-', ' ')}, plants, natural materials, greenery."`,
  transitional:  (room, adj) => `${adj} transitional ${ROOM_LABELS[room].toLowerCase()} — classic meets contemporary, perfectly balanced. Prompt: "Transitional ${room.replace('-', ' ')}, neutral tones, mixed textures."`,
  rustic:        (room, adj) => `${adj} rustic ${ROOM_LABELS[room].toLowerCase()} — raw wood, stone, and handcrafted details. Prompt: "Rustic ${room.replace('-', ' ')}, reclaimed wood, stone, earthy tones."`,
  glam:          (room, adj) => `${adj} glam ${ROOM_LABELS[room].toLowerCase()} dripping in luxe — mirrors, crystal, and metallic sheen. Prompt: "Glam ${room.replace('-', ' ')}, crystal chandelier, velvet, mirrored surfaces."`,
  maximalist:    (room, adj) => `${adj} maximalist ${ROOM_LABELS[room].toLowerCase()} — bold patterns, layered decor, fearless color. Prompt: "Maximalist ${room.replace('-', ' ')}, bold patterns, rich color, eclectic mix."`,
  'french-country': (room, adj) => `${adj} French Country ${ROOM_LABELS[room].toLowerCase()} with toile, lavender, and provincial charm. Prompt: "French country ${room.replace('-', ' ')}, toile, lavender, antique oak."`,
  'wabi-sabi':   (room, adj) => `${adj} wabi-sabi ${ROOM_LABELS[room].toLowerCase()} — imperfect textures, quiet beauty, organic forms. Prompt: "Wabi-sabi ${room.replace('-', ' ')}, handmade ceramics, worn textures, silence."`,
  mediterranean: (room, adj) => `${adj} Mediterranean ${ROOM_LABELS[room].toLowerCase()} with terracotta, stone, and warm sunlight. Prompt: "Mediterranean ${room.replace('-', ' ')}, terracotta, arched doorways, warm light."`,
};

// ── Sellers and their best styles ─────────────────────────────────────────────
const SELLERS = [
  { handle: 'alex.designs',   initial: 'A', verified: true,  styles: ['minimalist','scandi','mid-century','transitional','contemporary'] },
  { handle: 'home.by.mia',    initial: 'M', verified: true,  styles: ['glam','art-deco','dark-luxe','maximalist','french-country'] },
  { handle: 'spacesby.jo',    initial: 'J', verified: false, styles: ['farmhouse','rustic','french-country','mediterranean','transitional'] },
  { handle: 'green.interiors',initial: 'G', verified: true,  styles: ['biophilic','bohemian','transitional','coastal','wabi-sabi'] },
  { handle: 'nordic.spaces',  initial: 'N', verified: false, styles: ['scandi','minimalist','japandi','farmhouse','transitional'] },
  { handle: 'darkmode.design',initial: 'D', verified: true,  styles: ['dark-luxe','industrial','mid-century','maximalist','contemporary'] },
  { handle: 'wabi.studio',    initial: 'W', verified: true,  styles: ['japandi','wabi-sabi','minimalist','mediterranean','bohemian'] },
  { handle: 'retro.rooms',    initial: 'R', verified: true,  styles: ['mid-century','art-deco','rustic','industrial','contemporary'] },
  { handle: 'earthy.abode',   initial: 'E', verified: false, styles: ['bohemian','rustic','farmhouse','biophilic','wabi-sabi'] },
  { handle: 'shore.living',   initial: 'S', verified: false, styles: ['coastal','mediterranean','bohemian','farmhouse','transitional'] },
];

function pickSeller(style) {
  const candidates = SELLERS.filter(s => s.styles.includes(style));
  if (candidates.length === 0) return SELLERS[0];
  return candidates[Math.floor(candidates.length / 2)];
}

// ── Image pool helpers ─────────────────────────────────────────────────────────
function pickImageAt(roomType, offset) {
  const pool = IMAGE_POOL[roomType] || IMAGE_POOL['living-room'];
  return pool[offset % pool.length];
}

// ── Tag generators ─────────────────────────────────────────────────────────────
const STYLE_TAGS = {
  minimalist:      ['#Minimalist','#CleanLines','#LessIsMore'],
  scandi:          ['#Scandi','#Hygge','#NordicDesign'],
  japandi:         ['#Japandi','#WabiSabi','#Zen'],
  'mid-century':   ['#MidCenturyModern','#Retro','#AtomicAge'],
  contemporary:    ['#Contemporary','#Modern','#CurrentDesign'],
  bohemian:        ['#Boho','#Eclectic','#BohoChic'],
  'dark-luxe':     ['#DarkLuxe','#Moody','#DramaticDesign'],
  industrial:      ['#Industrial','#LoftStyle','#RawEdge'],
  coastal:         ['#Coastal','#BeachHouse','#OceanVibes'],
  'art-deco':      ['#ArtDeco','#Glamour','#GeometricDesign'],
  farmhouse:       ['#Farmhouse','#RusticChic','#ShiplapStyle'],
  biophilic:       ['#Biophilic','#NatureInspired','#PlantsEverywhere'],
  transitional:    ['#Transitional','#TimelessDesign','#ClassicMeets'],
  rustic:          ['#Rustic','#CountrysideCharm','#ReclaimedWood'],
  glam:            ['#GlamDesign','#LuxuryInteriors','#CrystalChandelier'],
  maximalist:      ['#Maximalist','#MoreIsMore','#BoldDesign'],
  'french-country':['#FrenchCountry','#ProvencalStyle','#CharmingHome'],
  'wabi-sabi':     ['#WabiSabi','#ImperfectBeauty','#MinimalistZen'],
  mediterranean:   ['#Mediterranean','#SunKissed','#Terracotta'],
};

const ROOM_TAGS = {
  'living-room': '#LivingRoom',
  bedroom:       '#Bedroom',
  kitchen:       '#Kitchen',
  'dining-room': '#DiningRoom',
  office:        '#HomeOffice',
  bathroom:      '#BathroomDecor',
  outdoor:       '#OutdoorLiving',
  entryway:      '#Entryway',
  nursery:       '#Nursery',
};

// ── Core generation ────────────────────────────────────────────────────────────
const ROOM_STYLE_MATRIX = {
  'living-room': {
    count: 95,
    styles: ['minimalist','scandi','japandi','mid-century','contemporary','bohemian','dark-luxe','industrial','coastal','art-deco','farmhouse','biophilic','transitional','rustic','glam','maximalist','french-country','wabi-sabi','mediterranean'],
  },
  bedroom: {
    count: 85,
    styles: ['minimalist','scandi','japandi','mid-century','contemporary','bohemian','dark-luxe','coastal','art-deco','farmhouse','transitional','glam','rustic','biophilic','wabi-sabi','maximalist','french-country'],
  },
  kitchen: {
    count: 75,
    styles: ['contemporary','farmhouse','coastal','industrial','transitional','minimalist','mid-century','scandi','mediterranean','dark-luxe','french-country','bohemian','biophilic','glam','rustic'],
  },
  'dining-room': {
    count: 56,
    styles: ['transitional','contemporary','rustic','farmhouse','glam','japandi','mid-century','art-deco','coastal','dark-luxe','minimalist','scandi','mediterranean','maximalist'],
  },
  office: {
    count: 48,
    styles: ['minimalist','scandi','contemporary','industrial','mid-century','dark-luxe','biophilic','japandi','transitional','bohemian','art-deco','maximalist'],
  },
  bathroom: {
    count: 40,
    styles: ['minimalist','scandi','japandi','coastal','contemporary','bohemian','dark-luxe','glam','farmhouse','transitional'],
  },
  outdoor: {
    count: 24,
    styles: ['coastal','farmhouse','bohemian','transitional','contemporary','mediterranean','biophilic','rustic'],
  },
  entryway: {
    count: 21,
    styles: ['transitional','minimalist','contemporary','farmhouse','coastal','mid-century','rustic'],
  },
  nursery: {
    count: 18,
    styles: ['scandi','minimalist','bohemian','farmhouse','contemporary','coastal'],
  },
};

export function generateDesigns(startId = 43) {
  const designs = [];
  let id = startId;

  for (const [roomType, spec] of Object.entries(ROOM_STYLE_MATRIX)) {
    const { count, styles } = spec;
    const roomLabel = ROOM_LABELS[roomType];

    for (let i = 0; i < count; i++) {
      const styleIndex = i % styles.length;
      const style = styles[styleIndex];
      const variantIndex = Math.floor(i / styles.length);
      const adjGroup = VARIANT_ADJECTIVES[variantIndex % VARIANT_ADJECTIVES.length];
      const adj = adjGroup[styleIndex % adjGroup.length] || adjGroup[0];

      const seller = pickSeller(style);
      const styleLabel = STYLE_LABELS[style] || style;
      const imgOffset = i;
      const imageUrl = pickImageAt(roomType, imgOffset);
      const productIds = pickProducts(roomType, style, 5);
      const descFn = DESCRIPTIONS[style];
      const description = descFn ? descFn(roomType, adj) : `${adj} ${styleLabel} ${roomLabel}.`;
      const styleTags = STYLE_TAGS[style] || [`#${styleLabel}`];
      const roomTag = ROOM_TAGS[roomType] || '#InteriorDesign';
      const tags = [roomTag, ...styleTags.slice(0, 2)];

      // Generate varied like/share counts based on seller popularity and style
      const baseLikes = [142, 287, 94, 415, 63, 189, 321, 78, 256, 143, 388, 92, 175, 234, 67, 310, 48, 198, 272, 115];
      const baseShares = [38, 72, 21, 103, 15, 47, 81, 19, 64, 36, 97, 23, 44, 58, 17, 77, 12, 49, 68, 29];
      const likeIdx = (id - startId) % baseLikes.length;
      const likes = baseLikes[likeIdx] + Math.floor(variantIndex * 17);
      const shares = baseShares[likeIdx] + Math.floor(variantIndex * 4);

      designs.push({
        id,
        title: `${adj} ${styleLabel} ${roomLabel}`,
        user: seller.handle,
        initial: seller.initial,
        verified: seller.verified,
        imageUrl,
        description,
        prompt: description.split('Prompt: ')[1]?.replace(/"/g, '') || `${styleLabel} ${roomLabel.toLowerCase()}`,
        roomType,
        styles: [style],
        products: productIds,
        tags,
        likes,
        shares,
      });

      id++;
    }
  }

  return designs;
}
