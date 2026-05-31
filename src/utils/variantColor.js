// variantColor.js — unified color-trust for a product's matched colorway variant.
//
// THE PROBLEM (audited Build 154): Amazon frequently reuses ONE gallery photo
// across many colorways. A catalog audit of 2,506 color-variant rows found 162
// products / 1,270 rows where a single hero image stands in for variants of
// DIFFERENT colors ("shared hero"). That photo can be the correct color for at
// most ONE colorway, so when the matcher stamps a colorway label ("White",
// "Cognac Tan") onto the card, every OTHER colorway lies — the user reads
// "the recommendation doesn't match the photo."
//
// THE TRUTH SOURCE: Amazon keys the per-color SWATCH thumbnail to the colorway,
// so it's reliable even when the hero is shared. Precedence:
//
//   trust = 'hero'    hero is UNIQUE to this colorway  → show the hero (best res)
//   trust = 'swatch'  hero is shared, but a per-color swatch exists → show swatch
//   trust = 'none'    neither is per-color → NO photo can be proven this color,
//                     so callers must DROP the colorway label (don't claim a
//                     color we can't show) and fall back to the product default.
//
// This is the ONLY place the color-trust decision lives. The productMatcher
// (data the rest inherits), the panel compositor (what the AI sees), and the
// Shop-Room buy card (what the shopper sees) all call resolveVariantColor so the
// AI input and every shopper surface agree — the "input = output" contract.
//
// Pure (no I/O) — safe to call on the render path.

const isHttp = (u) => typeof u === 'string' && u.startsWith('http');

// Amazon master-image id with the size suffix stripped, so _AC_SL300_ and
// _AC_SL1500_ renders of the SAME master compare equal. Non-Amazon urls
// compare by their raw string.
function imgBaseId(u) {
  if (typeof u !== 'string') return null;
  const after = u.split('/I/')[1];
  if (!after) return u;
  return after.split('.')[0];
}

const COLOR_WORDS = /\b(white|black|grey|gray|beige|cream|ivory|tan|brown|walnut|oak|navy|blue|green|sage|charcoal|slate|red|pink|gold|silver|natural|rust|teal|mustard|camel|taupe|chocolate|espresso|caramel|olive|burgundy|mauve|lavender|yellow|orange|maroon|pearl|snow|onyx|ebony|sand|oatmeal|khaki|bianco|midnight|cognac|cocoa|nightfall|olivine|rose)\b/gi;

// Canonical color signature for a label: sorted, de-duped color words. Two
// labels "name different colors" iff both signatures are non-empty AND unequal.
// This deliberately treats same-color/different-SIZE siblings (e.g. "72" Sofa —
// Midnight Blue" vs "104" Sofa — Midnight Blue") as the SAME color, so sharing a
// hero between them is fine — only CROSS-color sharing breaks trust.
function colorKey(label) {
  const hits = String(label || '').toLowerCase().match(COLOR_WORDS);
  if (!hits) return '';
  return Array.from(new Set(hits)).sort().join('+');
}
function differentColor(a, b) {
  const ka = colorKey(a);
  const kb = colorKey(b);
  return !!ka && !!kb && ka !== kb;
}

/**
 * resolveVariantColor(product) → { matched, trust, showColorLabel }
 *   matched         — true iff product._matchedVariant is set
 *   trust           — 'hero' | 'swatch' | 'none'
 *   showColorLabel  — whether the colorway label can be trusted on the photo
 *
 * The caller maps `trust` onto its own image field (panel wants the studio
 * panelImage, the card wants the lifestyle mainImage, both want swatchImage on
 * 'swatch', and on 'none' both fall back to the product default).
 */
export function resolveVariantColor(product) {
  const mv = product && product._matchedVariant;
  if (!mv) return { matched: false, trust: 'hero', showColorLabel: false };
  const variants = Array.isArray(product.variants) ? product.variants : [];

  // (1) Is the matched variant's hero UNIQUE to its colorway? (not shared with a
  //     differently-colored sibling)
  const heroId = imgBaseId(mv.panelImage || mv.mainImage);
  let heroReliable = !!heroId;
  if (heroReliable) {
    for (const v of variants) {
      if (v === mv) continue;
      const vId = imgBaseId(v.panelImage || v.mainImage);
      if (vId && vId === heroId && differentColor(v.label, mv.label)) {
        heroReliable = false;
        break;
      }
    }
  }
  if (heroReliable) return { matched: true, trust: 'hero', showColorLabel: true };

  // (2) Hero is shared — is there a per-color swatch we can show instead?
  let swatchUsable = isHttp(mv.swatchImage);
  if (swatchUsable) {
    const swId = imgBaseId(mv.swatchImage);
    for (const v of variants) {
      if (v === mv) continue;
      if (imgBaseId(v.swatchImage) === swId && differentColor(v.label, mv.label)) {
        swatchUsable = false;
        break;
      }
    }
  }
  if (swatchUsable) return { matched: true, trust: 'swatch', showColorLabel: true };

  // (3) No per-color asset at all — don't assert a color we can't show.
  return { matched: true, trust: 'none', showColorLabel: false };
}

export default resolveVariantColor;
