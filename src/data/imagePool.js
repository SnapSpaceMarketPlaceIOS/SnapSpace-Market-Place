/**
 * imagePool.js — Browser-verified Unsplash interior-only photo URLs by room type.
 *
 * EVERY photo in this file was manually verified by a browser agent to confirm:
 *   ✓ Shows an actual interior room / furniture / decor
 *   ✓ Contains NO people, NO animals, NO house exteriors
 *   ✓ Contains NO food prep, NO concerts, NO clothing racks
 *   ✓ Returns HTTP 200
 *
 * Last verified: 2026-03-13
 */

const BASE = 'https://images.unsplash.com';
const Q = '?w=800&q=85';

function url(id) {
  return `${BASE}/${id}${Q}`;
}

export const IMAGE_POOL = {
  'living-room': [
    url('photo-1555041469-a586c61ea9bc'),   // green velvet sofa, bright LR
    url('photo-1583847268964-b28dc8f51f92'), // minimalist LR with indoor plants
    url('photo-1513694203232-719a280e022f'), // minimalist LR, large window
    url('photo-1600210492486-724fe5c67fb0'), // contemporary LR with gallery wall
    url('photo-1560448204-e02f11c3d0e2'),    // open-concept living room
    url('photo-1586023492125-27b2c045efd7'), // LR with yellow accent chair
    url('photo-1616137466211-f939a420be84'), // traditional styled living room
    url('photo-1600210492493-0946911123ea'), // modern LR, tan sectional sofa
    url('photo-1565182999561-18d7dc61c393'), // two-story LR with staircase
    url('photo-1516455590571-18256e5bb9ff'), // open-concept LR/dining
    url('photo-1615873968403-89e068629265'), // LR with teal accent wall
    url('photo-1615874694520-474822394e73'), // LR with bookshelves & fireplace
    url('photo-1550581190-9c1c48d21d6c'),    // LR with large sectional sofa
    url('photo-1598928506311-c55ded91a20c'), // bright luxury living room
    url('photo-1484101403633-562f891dc89a'), // LR with blue accent sofa
    url('photo-1616046229478-9901c5536a45'), // modern furnished living room
    url('photo-1618220179428-22790b461013'), // LR with lush indoor plants
    url('photo-1581428982868-e410dd047a90'), // minimalist LR, gray sofa & wood table
  ],

  bedroom: [
    url('photo-1566665797739-1674de7a421a'), // dark luxe platform bed
    url('photo-1505693416388-ac5ce068fe85'), // elegant bedroom, tufted headboard
    url('photo-1588046130717-0eb0c9a3ba15'), // white upholstered bed, bright room
    url('photo-1631049307264-da0ec9d70304'), // hotel-style luxe bedroom
    url('photo-1571508601891-ca5e7a713859'), // cozy warm-toned bedroom
    url('photo-1559599189-fe84dea4eb79'),    // industrial/loft bedroom
    url('photo-1617104678098-de229db51175'), // modern luxury bedroom
    url('photo-1540518614846-7eded433c457'), // bedroom with designer benches
    url('photo-1595526114035-0d45ed16cfbf'), // bright white minimalist bedroom
  ],

  kitchen: [
    url('photo-1556909172-54557c7e4fb7'),    // warm traditional kitchen
    url('photo-1556911220-bff31c812dba'),    // modern all-white kitchen
    url('photo-1556909212-d5b604d0c90d'),    // traditional white kitchen cabinets
    url('photo-1556909190-eccf4a8bf97a'),    // kitchen with open shelving
    url('photo-1565538810643-b5bdb714032a'), // modern kitchen with large island
    url('photo-1600489000022-c2086d79f9d4'), // sleek U-shaped kitchen
    url('photo-1541123437800-1bb1317badc2'), // bright contemporary white kitchen
    url('photo-1507089947368-19c1da9775ae'), // modern white farmhouse kitchen
    url('photo-1556911073-38141963c9e0'),    // rustic kitchen interior
  ],

  'dining-room': [
    url('photo-1617806118233-18e1de247200'), // dining room with green velvet chairs
    url('photo-1567538096630-e0c55bd6374c'), // modern dining chairs, natural light
    url('photo-1560440021-33f9b867899d'),    // dining area with Eames chairs
    url('photo-1604578762246-41134e37f9cc'), // dining room with garden view
    url('photo-1600607687939-ce8a6c25118c'), // open-concept dining/living
    url('photo-1560185007-cde436f6a4d0'),    // dining room with wooden table
    url('photo-1600607687920-4e2a09cf159d'), // modern dining area & staircase
  ],

  office: [
    url('photo-1497366216548-37526070297c'), // biophilic desk with plants
    url('photo-1593642632559-0c6d3fc62b89'), // home office workspace
    url('photo-1524758631624-e2822e304c36'), // contemporary desk workspace
    url('photo-1533090161767-e6ffed986c88'), // minimalist home office wall
    url('photo-1505330622279-bf7d7fc918f4'), // styled desk setup
  ],

  bathroom: [
    url('photo-1552321554-5fefe8c9ef14'),    // white bathroom with checkered floor
    url('photo-1584622650111-993a426fbf0a'), // modern bathroom, glass shower
    url('photo-1560185127-6ed189bf02f4'),    // bright open-concept interior
    url('photo-1502005229762-cf1b2da7c5d6'), // elegant interior stairwell
  ],

  outdoor: [
    // Verified indoor/outdoor transition spaces & biophilic interiors
    url('photo-1567016376408-0226e4d0c1ea'), // minimalist arched doorway interior
    url('photo-1583847268964-b28dc8f51f92'), // biophilic LR, abundant plants
    url('photo-1555041469-a586c61ea9bc'),    // open bright room, patio feel
    url('photo-1600210492493-0946911123ea'), // bright airy open-plan space
    url('photo-1516455590571-18256e5bb9ff'), // open-concept indoor/outdoor flow
  ],

  entryway: [
    url('photo-1618219908412-a29a1bb7b86e'), // modern entryway/foyer
    url('photo-1618220252344-8ec99ec624b1'), // minimalist entryway
    url('photo-1502005229762-cf1b2da7c5d6'), // elegant multi-story stairwell
    url('photo-1565182999561-18d7dc61c393'), // two-story entry with grand staircase
    url('photo-1567016376408-0226e4d0c1ea'), // arched doorway minimalist entry
  ],

  nursery: [
    // Clean, light-toned rooms appropriate for nursery/children's spaces
    url('photo-1595526114035-0d45ed16cfbf'), // bright white minimal room
    url('photo-1588046130717-0eb0c9a3ba15'), // white upholstered, soft tones
    url('photo-1571508601891-ca5e7a713859'), // cozy warm room
    url('photo-1505693416388-ac5ce068fe85'), // elegant soft-toned room
    url('photo-1618220179428-22790b461013'), // room with plants, natural light
  ],
};

/**
 * Pick a URL from the pool for a given room type, cycling through with an offset
 * so consecutive designs in the same room get different photos.
 */
export function pickImage(roomType, offset = 0) {
  const pool = IMAGE_POOL[roomType] || IMAGE_POOL['living-room'];
  return pool[offset % pool.length];
}
