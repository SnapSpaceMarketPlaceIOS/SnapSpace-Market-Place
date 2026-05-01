# SnapSpace Catalog Gap Chart

**Generated**: 2026-05-01 (Build 132 baseline)
**Catalog size**: 479 products
**Purpose**: Map style × room strength → identify import priorities

---

## 1. Style strength tiers

How well-stocked is each design style in the catalog?

| Tier | Threshold | Styles |
|---|---|---|
| 🟢 **DOMINANT** | >200 products | contemporary (460), modern (309), transitional (237), minimalist (211) |
| 🟢 **STRONG** | 50-200 | farmhouse (118), rustic (108), mid-century (103), bohemian (98), industrial (97) |
| 🟡 **HEALTHY** | 25-50 | glam (48), coastal (43), japandi (39), art-deco (38), scandinavian (31) |
| 🟠 **THIN** | 10-25 | maximalist (21), wabi-sabi (16), dark-luxe (13), biophilic (12) |
| 🔴 **STARVED** | <10 | mediterranean (9), luxury (8), brutalist (4), french-country (2) |

---

## 2. Room strength tiers

| Tier | Room | Products |
|---|---|---|
| 🟢 DOMINANT | living-room | 361 |
| 🟢 DOMINANT | bedroom | 294 |
| 🟢 DOMINANT | office | 213 |
| 🟡 HEALTHY | dining-room | 116 |
| 🟡 HEALTHY | kitchen | 90 |
| 🟠 THIN | entryway | 50 |
| 🟠 THIN | bathroom | 28 |
| 🔴 STARVED | nursery | 14 |
| 🔴 STARVED | outdoor | 10 |

---

## 3. Style × Room matrix (live counts)

Read the cells: rows = style, columns = room. Number = products tagged with BOTH that style AND that room.

| Style | LR | BED | KIT | DIN | OFF | BATH | OUT | NUR | ENT |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 🟢 contemporary | 344 | 281 | 88 | 113 | 210 | 27 | 9 | 12 | 43 |
| 🟢 modern | 230 | 174 | 49 | 63 | 123 | 16 | 2 | 7 | 23 |
| 🟢 transitional | 199 | 176 | 49 | 61 | 123 | 18 | 8 | 7 | 31 |
| 🟢 minimalist | 159 | 120 | 34 | 38 | 98 | 16 | 5 | 5 | 10 |
| 🟢 bohemian | 93 | 81 | 13 | 30 | 51 | 6 | 3 | 6 | 19 |
| 🟢 farmhouse | 92 | 81 | **31** | 47 | 47 | 4 | 3 | 5 | 21 |
| 🟢 mid-century | 87 | 56 | 13 | 24 | 48 | 0 | 0 | 1 | 5 |
| 🟢 rustic | 78 | 75 | 24 | 32 | 53 | 7 | 4 | 1 | 15 |
| 🟢 industrial | 62 | 62 | 26 | 27 | 53 | 7 | 2 | 4 | 15 |
| 🟡 coastal | 41 | 33 | 10 | 11 | 26 | **9** | 5 | 0 | 8 |
| 🟡 glam | 40 | 31 | 8 | 11 | 16 | 3 | 0 | 2 | 9 |
| 🟡 art-deco | 34 | 23 | **4** | 10 | 14 | 2 | 0 | 1 | 11 |
| 🟡 japandi | 30 | 23 | 10 | 11 | 20 | 2 | 0 | 0 | 0 |
| 🟡 scandinavian | 21 | 17 | 9 | 14 | 12 | 1 | 0 | 2 | 2 |
| 🟠 maximalist | 21 | 17 | 3 | 6 | 11 | 2 | 0 | 1 | 8 |
| 🟠 wabi-sabi | 14 | 10 | 1 | 3 | 9 | 0 | 0 | 0 | 1 |
| 🟠 dark-luxe | 12 | 6 | **0** | 2 | 4 | 1 | 0 | 0 | 0 |
| 🟠 biophilic | 10 | 9 | 2 | 3 | 8 | 1 | 5 | 0 | 0 |
| 🔴 mediterranean | 9 | 6 | **0** | 3 | 7 | 0 | 1 | 0 | 2 |
| 🔴 luxury | 7 | 2 | 1 | 2 | 3 | 0 | 0 | 0 | 1 |
| 🔴 brutalist | 4 | 2 | **0** | 1 | 3 | 0 | 0 | 0 | 1 |
| 🔴 french-country | 2 | 2 | **0** | 1 | 1 | 0 | 0 | 0 | 2 |

> Cells in **bold** = your example's gap zones (Glam Kitchen, Dark-luxe Kitchen, Brutalist Kitchen, etc.)

---

## 4. Critical gaps — where renders are likely to misfire

These are style × room cells with so few products the matcher falls back to mismatched picks. Sorted by perceived consumer-risk:

### 🚨 PRIORITY 1 — Niche styles in non-living rooms

| Cell | Products | Why it's a problem | Fix priority |
|---|---|---|---|
| **Dark-luxe kitchen** | 0 | User picks "Dark Luxe" + "Kitchen" → matcher falls back to industrial. Consumer expects black cabinets/dark stools — gets brown. | HIGH |
| **Glam kitchen** | 8 (mostly pendants/vases) | No glam kitchen-island, no glam bar-stool. User's "Glam Kitchen" prompt fails to anchor. | HIGH |
| **Art-deco kitchen** | 4 | Same as Glam Kitchen — no anchor furniture. | HIGH |
| **Mediterranean kitchen** | 0 | Mediterranean style is starved overall. | MED |
| **Brutalist kitchen** | 0 | Brutalist already has 4 products total — kitchen impossible. | LOW (niche) |

### 🟧 PRIORITY 2 — Bedroom dark-finish gap (mentioned in user testing)

User testing showed white French-style nightstand returned for Dark Luxe Bedroom prompt. Catalog has 16 nightstands but most are light-finish.

| Need | Current count | Target |
|---|---|---|
| Dark/black-finish nightstands | ~5 | 12+ |
| Dark-finish dressers | ~6 | 12+ |
| Black-leather mid-century chairs | ~3 | 10+ |
| Dark-velvet accent chairs | ~5 | 12+ |

### 🟨 PRIORITY 3 — Niche-style kitchens & dinings (broader expansion)

To make ALL style × kitchen combinations viable:

| Style | Kitchen needs |
|---|---|
| Glam | kitchen-island (gold/marble), bar-stool (velvet), pendant (crystal/brass) |
| Art-deco | kitchen-island (geometric), bar-stool (curved velvet), pendant (geometric brass) |
| Dark-luxe | kitchen-island (matte black), bar-stool (black leather), pendant (black metal) |
| Japandi | kitchen-island (wood), bar-stool (wood/cane), pendant (paper/bamboo) |
| Maximalist | kitchen-island (bold), bar-stool (mixed colors), pendant (statement) |

### 🟩 PRIORITY 4 — Sparse rooms (lower urgency)

These rooms are STARVED globally. Probably not where users will start, but they show empty if reached.

| Room | Current | Products needed |
|---|---|---|
| Outdoor | 10 | outdoor sofa, outdoor dining set, lounge chair, fire pit, outdoor rug |
| Nursery | 14 | crib, rocking chair, kid-friendly rug, bookshelf, mobile |
| Bathroom | 28 | bath stool, vanity, towel ladder, freestanding tub accent, plant set |

---

## 5. Variant-color gaps (Build 130 + 131 testing)

Color-variant counts across the catalog. Where a color is THIN, the matcher's color-variant logic has nothing to surface.

| Color family | Variant coverage | Build 131 issue evidence |
|---|---|---|
| Brown | Strong (~40% of variants) | Default — works |
| White / Cream / Beige | Strong (~30%) | Default — works |
| Black | **Thin (~8%)** | Dark Luxe Bedroom showed white nightstand |
| Charcoal / Gray | Adequate (~12%) | Industrial test had limited dark-leather |
| Sage / Forest Green | Adequate (~5%) | Biophilic prompts ok |
| Navy / Royal Blue | Thin (~3%) | Glam/Art-deco prompts may underdeliver |
| Purple / Burgundy | **Thin (~2%)** | Glam/Maximalist need more |
| Rust / Terracotta | **Thin (~2%)** | Bohemian/Mediterranean need more |

---

## 6. Suggested import sprint (Phase 1 — closes 80% of visible gaps)

These 25 imports would close the most-visible gaps from user testing. Rough estimate: 12-15 hours total at ~30 min per import.

### Bedroom dark-luxe (5 products)
- 2 dark-finish/black mid-century nightstands (with 2-4 color variants each)
- 2 dark-walnut/black 6-drawer dressers
- 1 dark-velvet upholstered accent chair

### Kitchen niche styles (10 products)
- 2 glam kitchen islands (white marble + gold)
- 2 glam bar-stools (velvet, brass legs)
- 2 art-deco bar-stools (curved, geometric)
- 2 dark-luxe pendant lights (black/brass)
- 2 maximalist bar-stools (saturated colors)

### Living-room dark-leather (5 products)
- 2 black-leather mid-century accent chairs
- 1 dark-leather Chesterfield sofa
- 2 cognac/dark-brown leather lounge chairs

### Variant expansions (5 existing products)
- Add purple/burgundy variants to existing accent chair listings
- Add rust/terracotta variants to existing rug listings
- Add navy/royal blue variants to glam pieces

---

## 7. How to use this chart

When you're ready to import:

1. Open this chart side-by-side with the import workflow doc
2. Pick a single Priority 1 or 2 row
3. Browse Amazon for products matching that exact need
4. Use the canonical schema (next doc) — copy/paste the template, fill fields
5. Import 1 product → run `node scripts/sanity-check.mjs <id>` to verify it parses + has required fields
6. Commit. Move to next.

Single-import, single-commit pattern. Each commit is "Catalog: imported [product name]." Easy to revert if anything goes wrong.
