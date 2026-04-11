/**
 * Coverage test for productMatcher — runs a battery of explicit user prompts
 * against the matcher and asserts that the top result matches the user's
 * explicit attributes (color + material + type).
 *
 * Designed to be run as a Jest test so no extra tooling is needed:
 *   npx jest src/services/__tests__/productMatcher.coverage.test.js --verbose
 *
 * Output: a table showing pass/fail per prompt with the top product returned
 * and which attributes matched/missed.
 *
 * Goal: before Phase 3 this should have many failures; after Phase 3 it
 * should have close to 100% pass rate.
 */

import { getProductsForPrompt } from '../affiliateProducts';

// ─── Attribute checkers ────────────────────────────────────────────────────

// Color family matching — words that indicate the same color as the key
const COLOR_FAMILIES = {
  brown:  ['brown', 'cognac', 'tobacco', 'walnut', 'chestnut', 'caramel', 'mocha', 'tan', 'chocolate', 'espresso'],
  white:  ['white', 'ivory', 'cream', 'off-white', 'bone', 'snow'],
  black:  ['black', 'charcoal', 'ebony', 'onyx', 'dark'],
  gray:   ['gray', 'grey', 'slate', 'silver', 'pewter'],
  navy:   ['navy', 'dark blue', 'midnight', 'indigo'],
  blue:   ['blue', 'navy', 'cobalt', 'teal', 'ocean'],
  green:  ['green', 'sage', 'olive', 'forest', 'emerald', 'moss'],
  beige:  ['beige', 'tan', 'sand', 'khaki', 'natural'],
};

function productHasColor(product, colorKey) {
  const family = COLOR_FAMILIES[colorKey] || [colorKey];
  const text = [
    product.name || '',
    product.description || '',
    ...(product.tags || []),
  ].join(' ').toLowerCase();
  return family.some(w => text.includes(w));
}

function productHasMaterial(product, material) {
  const mats = (product.materials || []).map(m => m.toLowerCase());
  if (mats.includes(material.toLowerCase())) return true;
  const text = [product.name || '', product.description || '', ...(product.tags || [])]
    .join(' ').toLowerCase();
  return text.includes(material.toLowerCase());
}

function productHasCategory(product, category) {
  return product.category === category;
}

function productHasTypeWord(product, typeWord) {
  const text = (product.name || '').toLowerCase() + ' ' + (product.description || '').toLowerCase();
  return text.includes(typeWord.toLowerCase());
}

// ─── Test battery ─────────────────────────────────────────────────────────

// Each test case has: prompt, plus the "required" attributes that the TOP
// matched product of the given category MUST satisfy.
const TEST_CASES = [
  // The user's actual failing prompt from the app (with "soft" triggering velvet bug)
  {
    prompt: 'V Modern minimal living room, soft brown leather couch with modern dining table and white rug',
    requires: { category: 'sofa', color: 'brown', material: 'leather' },
  },
  // COLOR + MATERIAL tests (the "brown leather couch" class)
  {
    prompt: 'Modern living room with soft brown leather couch',
    requires: { category: 'sofa', color: 'brown', material: 'leather' },
  },
  {
    prompt: 'Modern minimal living room, brown leather sofa',
    requires: { category: 'sofa', color: 'brown', material: 'leather' },
  },
  {
    prompt: 'Cozy living room with white boucle sofa',
    requires: { category: 'sofa', color: 'white', material: 'velvet' }, // catalog tags boucle as velvet
  },
  {
    prompt: 'Glam living room with green velvet sofa',
    requires: { category: 'sofa', color: 'green', material: 'velvet' },
  },
  {
    prompt: 'Modern living room with gray sectional sofa',
    requires: { category: 'sofa', color: 'gray' },
  },

  // COLOR-only tests
  {
    prompt: 'Minimalist living room with a white rug',
    requires: { category: 'rug', color: 'white' },
  },
  {
    prompt: 'Living room with a navy blue rug',
    requires: { category: 'rug', color: 'navy' },
  },

  // TYPE word tests (loveseat, sectional, etc.)
  {
    prompt: 'Small modern living room with a brown leather loveseat',
    requires: { category: 'sofa', color: 'brown', material: 'leather', typeWord: 'loveseat' },
  },
  {
    prompt: 'Spacious modern living room with a large sectional',
    requires: { category: 'sofa', typeWord: 'sectional' },
  },

  // MATERIAL tests
  {
    prompt: 'Japandi bedroom with walnut wood bed',
    requires: { category: 'bed', material: 'wood', color: 'brown' },
  },
  {
    prompt: 'Mid-century living room with glass coffee table',
    requires: { category: 'coffee-table', material: 'glass' },
  },
  {
    prompt: 'Living room with a round marble coffee table',
    requires: { category: 'coffee-table', material: 'marble' },
  },
];

// ─── Run ──────────────────────────────────────────────────────────────────

function evaluate(product, requires) {
  const missed = [];
  const matched = [];

  if (requires.category && !productHasCategory(product, requires.category)) {
    missed.push(`category≠${requires.category} (was ${product.category})`);
  } else if (requires.category) {
    matched.push(`cat=${requires.category}`);
  }

  if (requires.color) {
    if (productHasColor(product, requires.color)) matched.push(`color=${requires.color}`);
    else missed.push(`color≠${requires.color}`);
  }

  if (requires.material) {
    if (productHasMaterial(product, requires.material)) matched.push(`mat=${requires.material}`);
    else missed.push(`mat≠${requires.material}`);
  }

  if (requires.typeWord) {
    if (productHasTypeWord(product, requires.typeWord)) matched.push(`type=${requires.typeWord}`);
    else missed.push(`type≠${requires.typeWord}`);
  }

  return { matched, missed, passed: missed.length === 0 };
}

// Find the top product in the result set that matches the required category.
// If no category-matching product is in the top 6, use the first result.
function findTopForCategory(products, category) {
  if (!category) return products[0];
  return products.find(p => p.category === category) || products[0];
}

describe('productMatcher — coverage for explicit user attributes', () => {
  const results = [];

  TEST_CASES.forEach(({ prompt, requires }) => {
    test(prompt, () => {
      const products = getProductsForPrompt(prompt, 6);
      const top = findTopForCategory(products, requires.category);
      const evalResult = evaluate(top, requires);

      results.push({
        prompt,
        topName: (top?.name || '').substring(0, 70),
        passed: evalResult.passed,
        matched: evalResult.matched.join(', '),
        missed: evalResult.missed.join(', '),
      });

      // Don't fail the test — we want to see the whole report even when things fail
      // Jest's expect is avoided here so all cases run. Coverage summary logged in afterAll.
    });
  });

  afterAll(() => {
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    const pctStr = `${((passed / total) * 100).toFixed(0)}%`;

    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  PRODUCT MATCHER COVERAGE REPORT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Passed: ${passed}/${total}  (${pctStr})`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    results.forEach((r, i) => {
      const mark = r.passed ? '✓' : '✗';
      console.log(`${mark} [${String(i + 1).padStart(2, '0')}] "${r.prompt}"`);
      console.log(`       top: ${r.topName}`);
      if (r.matched) console.log(`       matched: ${r.matched}`);
      if (r.missed) console.log(`       MISSED:  ${r.missed}`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  });
});
