// Shared design list for Explore grid and Liked page (single source of truth).
export const DESIGNS = [
  {
    id: 1, title: 'Modern Minimalist...', user: 'alex.designs', initial: 'A',
    description: 'Clean, airy living room with warm natural wood tones and intentional negative space. Prompt: "Minimalist Scandi living room, oak floors, white walls."',
    products: [
      { name: 'Linen Cloud Sofa', brand: 'West Elm · 3-Seater', price: '$1,299' },
      { name: 'Solid Oak Coffee Table', brand: 'CB2 · 48"', price: '$449' },
      { name: 'Marble Floor Lamp', brand: 'Anthropologie', price: '$218' },
    ],
    tags: ['#Minimalist', '#LivingRoom', '#NaturalWood', '#Scandi', '#AIGenerated'],
    likes: 142, shares: 38,
  },
  {
    id: 2, title: 'Luxury dining...', user: 'home.by.mia', initial: 'M',
    description: 'An elegant dining room featuring a statement chandelier, velvet chairs, and herringbone oak floors. Prompt: "Luxury formal dining, champagne & gold tones."',
    products: [
      { name: 'Velvet Dining Chair', brand: 'Restoration Hardware', price: '$380' },
      { name: 'Walnut Dining Table', brand: 'Article · 8-seat', price: '$2,100' },
      { name: 'Brass Chandelier', brand: 'Rejuvenation', price: '$740' },
    ],
    tags: ['#Luxury', '#Dining', '#GoldAccents', '#Velvet', '#AIGenerated'],
    likes: 217, shares: 52,
  },
  {
    id: 3, title: 'Rustic Kitchen...', user: 'spacesby.jo', initial: 'J',
    description: 'Open-concept kitchen with exposed brick, butcher block counters, and hanging copper pots. Prompt: "Rustic farmhouse kitchen, warm wood, copper accents."',
    products: [
      { name: 'Butcher Block Island', brand: 'IKEA · Custom', price: '$620' },
      { name: 'Copper Pendant Lights', brand: 'Pottery Barn · set of 3', price: '$290' },
      { name: 'Farmhouse Sink', brand: 'Kohler', price: '$580' },
    ],
    tags: ['#RusticKitchen', '#Farmhouse', '#CopperAccents', '#AIGenerated'],
    likes: 189, shares: 44,
  },
  {
    id: 4, title: 'Biophilic Office Space...', user: 'green.interiors', initial: 'G',
    description: 'Lush home office flooded with plants, natural light, and earthy ceramic accents. Prompt: "Biophilic home office, living wall, rattan, warm daylight."',
    products: [
      { name: 'Rattan Desk Chair', brand: 'World Market', price: '$199' },
      { name: 'Living Wall Panel', brand: 'Botaniq · 24x36"', price: '$340' },
      { name: 'Concrete Desk Lamp', brand: 'CB2', price: '$145' },
    ],
    tags: ['#Biophilic', '#HomeOffice', '#Plants', '#NaturalLight', '#AIGenerated'],
    likes: 305, shares: 81,
  },
  {
    id: 5, title: 'Warm Scandi Loft...', user: 'nordic.spaces', initial: 'N',
    description: 'Open-plan Scandinavian loft with shiplap walls, sheepskin throws, and a wood-burning stove. Prompt: "Scandi hygge loft, white walls, warm wood, cozy textiles."',
    products: [
      { name: 'Sheepskin Throw', brand: 'H&M Home', price: '$89' },
      { name: 'Wood Burning Stove', brand: 'Rais · Piccolo', price: '$1,800' },
      { name: 'Shiplap Wall Panel', brand: 'Home Depot', price: '$62/sheet' },
    ],
    tags: ['#Scandi', '#Hygge', '#LoftLiving', '#WarmWood', '#AIGenerated'],
    likes: 261, shares: 59,
  },
  {
    id: 6, title: 'Dark Luxe Bedroom...', user: 'darkmode.design', initial: 'D',
    description: 'A moody, drama-forward bedroom in deep navy with gold hardware and statement art. Prompt: "Dark luxe master bedroom, navy & gold, velvet drapes."',
    products: [
      { name: 'Velvet Platform Bed', brand: 'Anthropologie', price: '$2,400' },
      { name: 'Gold Hardware Dresser', brand: 'West Elm', price: '$899' },
      { name: 'Silk Curtains', brand: 'Restoration Hardware', price: '$480/pair' },
    ],
    tags: ['#DarkLuxe', '#Bedroom', '#NavyAndGold', '#Velvet', '#AIGenerated'],
    likes: 198, shares: 47,
  },
  {
    id: 7, title: 'Japandi Dining...', user: 'wabi.studio', initial: 'W',
    description: 'A serene dining room merging Japanese minimalism with Scandinavian warmth. Prompt: "Japandi dining, nude palette, low pendant, wabi-sabi ceramics."',
    products: [
      { name: 'Low-Slung Dining Table', brand: 'Muji · Solid Ash', price: '$980' },
      { name: 'Washi Paper Pendant', brand: 'Noguchi', price: '$320' },
      { name: 'Stoneware Place Setting', brand: 'Jono Pandolfi · 4pc', price: '$210' },
    ],
    tags: ['#Japandi', '#WabiSabi', '#DiningRoom', '#Ceramics', '#AIGenerated'],
    likes: 173, shares: 41,
  },
  {
    id: 8, title: 'Mid-Century Modern...', user: 'retro.rooms', initial: 'R',
    description: 'Retro-forward den with teak credenza, Eames chair, and sunburst clock. Prompt: "Mid-century modern den, teak, orange pops, atomic design."',
    products: [
      { name: 'Eames Lounge Chair', brand: 'Herman Miller', price: '$5,495' },
      { name: 'Teak Credenza', brand: 'Design Within Reach', price: '$2,100' },
      { name: 'Sunburst Mirror Clock', brand: 'Schoolhouse', price: '$260' },
    ],
    tags: ['#MidCentury', '#RetroInterior', '#Teak', '#AIGenerated'],
    likes: 284, shares: 73,
  },
  {
    id: 9, title: 'Wabi-Sabi Bedroom...', user: 'earthy.abode', initial: 'E',
    description: 'Imperfect and beautiful — linen bedding, terracotta vessels, raw plaster walls. Prompt: "Wabi-sabi bedroom, raw plaster, terracotta, linen, morning light."',
    products: [
      { name: 'Raw Linen Duvet', brand: 'Parachute · King', price: '$220' },
      { name: 'Terracotta Vase Set', brand: 'CB2 · 3pc', price: '$85' },
      { name: 'Plaster Wall Paint', brand: 'Portola Paints', price: '$68/qt' },
    ],
    tags: ['#WabiSabi', '#Bedroom', '#Terracotta', '#EarthyTones', '#AIGenerated'],
    likes: 156, shares: 35,
  },
  {
    id: 10, title: 'Art Deco Living...', user: 'deco.dreams', initial: 'D',
    description: 'Glamorous art deco living room with chevron parquet floors, jewel tones, and brass trim. Prompt: "Art deco living room, emerald, brass, geometric patterns."',
    products: [
      { name: 'Emerald Velvet Sofa', brand: 'Jonathan Adler', price: '$3,200' },
      { name: 'Brass Side Table', brand: 'CB2 · Round', price: '$340' },
      { name: 'Geometric Area Rug', brand: 'West Elm · 9x12"', price: '$720' },
    ],
    tags: ['#ArtDeco', '#LivingRoom', '#EmeraldGreen', '#Brass', '#AIGenerated'],
    likes: 272, shares: 64,
  },
  {
    id: 11, title: 'Coastal Retreat...', user: 'shore.living', initial: 'S',
    description: 'Breezy coastal bedroom with cerulean accents, wicker furniture, and sea glass tones. Prompt: "Coastal bedroom, cerulean, white-washed wood, ocean breeze."',
    products: [
      { name: 'Whitewashed Wood Bed', brand: 'Serena & Lily', price: '$1,800' },
      { name: 'Wicker Side Table', brand: 'Pottery Barn', price: '$349' },
      { name: 'Cerulean Linen Duvet', brand: 'Coyuchi', price: '$198' },
    ],
    tags: ['#Coastal', '#Bedroom', '#BeachHome', '#Wicker', '#AIGenerated'],
    likes: 231, shares: 55,
  },
  {
    id: 12, title: 'Industrial Loft...', user: 'raw.spaces', initial: 'R',
    description: 'Raw industrial loft with exposed pipes, factory windows, and leather seating. Prompt: "Industrial loft, exposed brick, black steel windows, leather sofa."',
    products: [
      { name: 'Leather Chesterfield', brand: 'Restoration Hardware', price: '$2,900' },
      { name: 'Edison Pendant Cluster', brand: 'Schoolhouse', price: '$480' },
      { name: 'Cast Iron Shelving', brand: 'Rejuvenation', price: '$340' },
    ],
    tags: ['#Industrial', '#LoftLiving', '#ExposedBrick', '#Leather', '#AIGenerated'],
    likes: 167, shares: 42,
  },
];
