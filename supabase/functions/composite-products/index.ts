/**
 * HomeGenie — composite-products Edge Function (v10)
 *
 * Stitches up to 4 product images into a 2104×2104 2×2 panel JPEG (1024×1024
 * per cell) with white gutters and 2px hairline cell borders so flux-2-pro/edit
 * reads the panel as 4 distinct product references instead of one composite
 * image.
 *
 * Failure history — why previous versions crashed:
 *   v1: imagescript     — deno.land CDN cold-start import timeout → 500
 *   v2: hand-rolled JPEG encoder — too complex, runtime errors → 500
 *   v3: esm.sh jpeg-js  — CJS→ESM default export undefined → 500
 *   v4: OffscreenCanvas — NOT available on Supabase Deno runtime → 500
 *   v5: npm:jpeg-js     — Deno npm: specifier handles CJS natively ✓
 *   v6: backup URL pool — accepts up to 6 URLs, validates content-type before
 *       decode, fills cells from the pool; guarantees all 4 cells filled as
 *       long as ≥4 of the provided URLs are valid images.
 *   v7: quality pass    — Lanczos3 resize (sharper than bilinear) + JPEG q95
 *       (was q85). Client sends 1500px Amazon sources so the downsample has
 *       more detail to work with.
 *   v8: cell size bump  — 256×256 → 384×384 per cell, panel 512×512 → 768×768.
 *       Each cell now carries 2.25× more pixels.
 *   v9: 4/4 fidelity    — Phase 0 of the AI product fidelity plan. Three
 *       changes targeted at moving renders from 2-3/4 → 4/4:
 *       (a) cell 384→620, panel 768→1280. ~2.6× more pixels per cell so
 *           silhouette / finish / color survive flux's attention sampling.
 *       (b) 20px white gutters between cells + 10px outer margin. Forces
 *           flux to perceive 4 distinct items rather than a single composite.
 *           Critical for product photos that have their own backgrounds — a
 *           rug shot in a room scene was the documented 2026-04-25 failure.
 *       (c) Letterbox-fit instead of stretch-fit. Source images preserve
 *           aspect ratio; non-square photos sit centered on white padding
 *           inside the cell. Stretching a 1500×1000 sofa to 620×620 was
 *           distorting silhouettes flux had to reconstruct.
 *       (d) 1px gray hairline border around each cell so flux's perceptual
 *           boundary between cells is unambiguous even when a cell's product
 *           image bleeds white-on-white at its edge.
 *       Cost impact: $0 on FAL (it bills output MP, not input). Edge-fn
 *       Lanczos compute scales ~2.6× — still well under 1s on the Deno
 *       runtime. JPEG q95 panel ~150KB → ~250KB, negligible upload time.
 *  v10: cell + panel resolution bump for Build 117 — cell 620→1024, panel
 *       1280→2104. ~2.7× more pixels per cell so silhouette/finish/color
 *       carry through flux's vision-token sampling at higher fidelity.
 *       Border thickness 1px → 2px to keep visual weight on the larger
 *       canvas. Same Lanczos3 + JPEG q95 + letterbox-fit + SSRF allowlist.
 *       Cost impact: still $0 on FAL (output-MP billing). Edge-fn memory
 *       peak ~40 MB (panel RGBA ~17.7 MB + Lanczos buffers ~12 MB), well
 *       under Supabase's 150 MB limit. Lanczos compute scales ~2.7×;
 *       end-to-end edge time ~1-2s → ~2-3s on cold cache, still fine.
 *       JPEG q95 output ~250 KB → ~700 KB-1 MB — negligible for FAL fetch.
 *
 * Supabase edge functions officially support `npm:` specifiers (Deno 1.31+).
 *
 * Panel layout (CELL=1024, GUTTER=24, OUTER=16, PANEL=2104):
 *   ┌──┬──────────┬──┬──────────┬──┐
 *   │  │ product1 │  │ product2 │  │
 *   │  ├──────────┘  └──────────┤  │
 *   │  ├──────────┐  ┌──────────┤  │
 *   │  │ product3 │  │ product4 │  │
 *   └──┴──────────┴──┴──────────┴──┘
 *   ↑outer        ↑gutter        ↑outer
 *
 * Input:  { product_urls: string[] (up to 6 backup candidates) }   (user_id from JWT)
 * Output: { url: string, composited_count: number, composited_indices: number[] }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jpeg from "npm:jpeg-js@0.4.4";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// v10 layout (Build 117): 16 + 1024 + 24 + 1024 + 16 = 2104 ✓
//
// Bumped from v9's 620×620 cells / 1280×1280 panel to 1024×1024 cells /
// 2104×2104 panel. Per-cell pixel count goes from 384,400 → 1,048,576
// (2.7× more pixels per cell) so flux's vision-token sampling has more
// silhouette/finish/color signal to work with. Cost note: FAL bills on
// OUTPUT MP, not input — a 2104×2104 input panel has zero billing impact
// on the $0.06/gen flux-2-pro/edit run. Edge-function memory: panel RGBA
// buffer goes 6.5 MB → 17.7 MB; Lanczos float32 buffers ~12 MB peak.
// Total ~40 MB peak, well under Supabase's 150 MB Edge limit.
//
// Border thickness bumped 1px → 2px to keep the same visual weight on the
// larger canvas (1px on 2104 is half as visually present as 1px on 1280).
const CELL   = 1024;
const GUTTER = 24;
const OUTER  = 16;
const PANEL  = 2104;
const BORDER_THICKNESS = 2;

// Hairline border color — light gray (RGB 220) — visible against white panel
// background but doesn't distract from the product photos.
const BORDER_R = 220;
const BORDER_G = 220;
const BORDER_B = 220;

// Build 69 Commit H: SSRF allowlist for product image fetches.
//
// Previously composite-products called fetch(url) on ANY URL the caller
// provided. Authenticated attackers could point it at internal metadata
// endpoints (169.254.169.254), slow-loris endpoints to burn the 15s
// timeout × 6 slots, or arbitrary large files to drain function bandwidth.
// The audit flagged this as HIGH — not data-leak bad, but a real DoS
// and cost-abuse vector.
//
// Whitelisted hosts cover the three legitimate sources of product
// imagery HomeGenie uses today. New sources require a migration here
// + a security review.
const ALLOWED_HOSTS = new Set([
  // Supabase Storage (own uploads, own CDN transforms)
  "lqjfnpibbjymhzupqtda.supabase.co",
  // Amazon product image CDNs
  "m.media-amazon.com",
  "images-na.ssl-images-amazon.com",
  "images-amazon.com",
  // Wayfair CJ affiliate image CDN
  "secure.img1-fg.wfcdn.com",
  "secure.img2-fg.wfcdn.com",
  // Houzz affiliate image CDN
  "st.hzcdn.com",
  // Unsplash — used by seed catalog designs
  "images.unsplash.com",
]);

function isAllowedImageHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

// Cell origins for the 2×2 layout with OUTER margin and GUTTER between cells.
// v10 (Build 117): Column origins: [16, 1064]. Row origins: [16, 1064].
//   x=16 ─────── x=16+1024+24=1064 ─── end of right cell at 1064+1024=2088 → +16 outer = 2104 ✓
const COL_X = [OUTER, OUTER + CELL + GUTTER];
const ROW_Y = [OUTER, OUTER + CELL + GUTTER];
const POSITIONS = [
  { x: COL_X[0], y: ROW_Y[0] },   // top-left:    (16, 16)
  { x: COL_X[1], y: ROW_Y[0] },   // top-right:   (1064, 16)
  { x: COL_X[0], y: ROW_Y[1] },   // bottom-left: (16, 1064)
  { x: COL_X[1], y: ROW_Y[1] },   // bottom-right:(1064, 1064)
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, serviceKey);

  // ── AUTH: Verify JWT ────────────────────────────────────────────────────
  // Previously accepted anon key only, allowing anyone to fill Storage with
  // junk panels. Now requires a valid Supabase user JWT.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errResp("Missing authorization", 401);
  }
  const { data: { user: authUser }, error: authErr } =
    await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !authUser) {
    return errResp("Invalid or expired token", 401);
  }

  let body: { product_urls?: string[] };
  try { body = await req.json(); }
  catch { return errResp("Invalid JSON body", 400); }

  const { product_urls } = body;
  if (!product_urls?.length) return errResp("product_urls required", 400);

  // Use the JWT-verified user id (no body-spoofing possible now)
  const user_id = authUser.id;

  // ── RATE LIMIT: cap panel builds per user per hour ──────────────────────
  //
  // Before this fix, an authenticated user could loop composite-products and
  // fill room-uploads Storage with junk panels — the auth check stops
  // anonymous abuse, but an authed user had no per-user limit beyond what
  // ai-proxy enforces downstream. Since composite-products is sometimes
  // called WITHOUT a follow-up ai-proxy call (e.g. client aborts between
  // the two), ai-proxy's hourly cap doesn't cover this path.
  //
  // We deliberately do NOT call the shared `check_ai_rate_limit` RPC here.
  // That RPC updates `last_request = now()` on success, which would
  // interfere with ai-proxy's 2000ms cooldown — composite-products is
  // normally called 2-5 seconds before ai-proxy, and if the panel build
  // is fast (<2s), ai-proxy would then get cooldown-blocked by our own
  // write.  Breaking generation is worse than letting an abuser through.
  //
  // Instead we measure the actual abuse signal directly: how many panel
  // files this user has uploaded in the last hour. The sortBy=created_at
  // + limit ordering guarantees we only scan the most recent HOURLY_CAP+1
  // entries (cheap regardless of total folder size). Failures here are
  // non-fatal — we log and let the request through rather than blocking
  // legitimate generations if Storage.list has a momentary hiccup.
  try {
    const HOURLY_CAP = 60;
    const { data: recentFiles, error: listErr } = await supabase.storage
      .from("room-uploads")
      .list(`product-panels/${user_id}`, {
        limit: HOURLY_CAP + 1,
        sortBy: { column: "created_at", order: "desc" },
      });

    if (listErr) {
      console.warn(`[composite] Rate limit list failed (fail-open): ${listErr.message}`);
    } else if (recentFiles && recentFiles.length >= HOURLY_CAP) {
      const cutoff = Date.now() - 3_600_000;
      const recentCount = recentFiles.filter((f) => {
        const ts = f.created_at ? Date.parse(f.created_at) : 0;
        return Number.isFinite(ts) && ts >= cutoff;
      }).length;
      if (recentCount >= HOURLY_CAP) {
        console.warn(
          `[composite] Rate limited: user=${user_id} | ${recentCount} panels in last hour`,
        );
        return errResp(
          `Hourly panel cap reached (${HOURLY_CAP}/hr). Please wait before building more.`,
          429,
        );
      }
    }
  } catch (rateLimitErr) {
    // Fail-open: a Storage API blip should not block generation. ai-proxy's
    // own hourly cap (30/hr by default) still applies to downstream flux
    // calls, which is the costlier resource anyway.
    console.warn(
      `[composite] Rate limit check threw (fail-open): ${
        (rateLimitErr as Error)?.message ?? String(rateLimitErr)
      }`,
    );
  }

  // Accept up to 6 URLs as a backup pool — we need exactly 4 panel cells filled.
  // If any URL is broken (wrong content-type, network error, bad JPEG) we skip it
  // and pull from the remaining pool, guaranteeing all 4 cells are filled as long
  // as at least 4 of the provided URLs are valid images.
  const candidateUrls = product_urls.slice(0, 6);
  console.log(`[composite v10] ${candidateUrls.length} candidate URLs | user=${user_id} | cell=${CELL}×${CELL} panel=${PANEL}×${PANEL} gutter=${GUTTER} outer=${OUTER}`);

  // ── Allocate 2104×2104 RGBA panel buffer — white background ──────────────────
  // White is a stronger separator than light gray for flux's perceptual edge
  // detection; a cell whose product photo also has a white background still
  // gets a clean 1px gray border drawn around it (see drawCellBorder below).
  const panelRGBA = new Uint8Array(PANEL * PANEL * 4);
  for (let i = 0; i < panelRGBA.length; i += 4) {
    panelRGBA[i]     = 255;  // R
    panelRGBA[i + 1] = 255;  // G
    panelRGBA[i + 2] = 255;  // B
    panelRGBA[i + 3] = 255;  // A
  }

  // ── Download, decode, resize, and composite each product ──────────────────
  // `composited` tracks filled cells (we stop after 4 — the panel is full).
  // `compositedIndices` records which INPUT URL index ended up in each cell,
  // so the client can show the exact same 4 products in "Shop Your Room"
  // that flux-2-max rendered into the room image. Without this array the
  // client has to guess, and falls back to the first 4 matched products —
  // which produces the 3-of-4 mismatch when a URL was skipped mid-pool.
  let composited = 0;
  const compositedIndices: number[] = [];

  for (let urlIdx = 0; urlIdx < candidateUrls.length && composited < 4; urlIdx++) {
    const url = candidateUrls[urlIdx];
    // Build 69 Commit H: reject URLs that don't resolve to an allowlisted
    // image CDN BEFORE calling fetch. This closes the SSRF + DoS vector.
    // Skipping (not erroring) keeps the panel-building loop resilient —
    // a single bad URL in the 6-candidate pool just drops that slot.
    if (!isAllowedImageHost(url)) {
      console.warn(`[composite] URL ${urlIdx + 1} host not in allowlist — skipping`);
      continue;
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        console.warn(`[composite] URL ${urlIdx + 1} HTTP ${res.status} — skipping`);
        continue;
      }

      // Reject non-image responses BEFORE attempting JPEG decode to avoid
      // a misleading DecodeError on text/plain or text/html payloads.
      const ct = res.headers.get("content-type") || "";
      if (!ct.startsWith("image/")) {
        console.warn(`[composite] URL ${urlIdx + 1} content-type="${ct}" — not an image, skipping`);
        continue;
      }

      const buf     = new Uint8Array(await res.arrayBuffer());

      // jpeg.decode with useTArray returns Uint8Array data (no Node Buffer needed)
      const decoded = jpeg.decode(buf, { useTArray: true });
      // decoded.data is RGBA Uint8Array, decoded.width/decoded.height are dimensions

      // ── Letterbox-fit (v10) — preserve aspect ratio ────────────────────────
      // Compute fit dimensions: scale longer dimension to CELL, scale shorter
      // dimension proportionally. Non-square photos sit centered on the
      // panel's white background inside the cell. Stretching a 1500×1000
      // sofa to 620×620 (the v8 behavior) was distorting silhouettes flux
      // had to reconstruct — a known contributor to 2-3/4 mismatch.
      const aspectSrc = decoded.width / decoded.height;
      let fitW = CELL;
      let fitH = CELL;
      if (aspectSrc > 1) {
        fitH = Math.max(1, Math.round(CELL / aspectSrc));
      } else if (aspectSrc < 1) {
        fitW = Math.max(1, Math.round(CELL * aspectSrc));
      }
      const padX = Math.floor((CELL - fitW) / 2);
      const padY = Math.floor((CELL - fitH) / 2);

      // Lanczos3 resize to fitW×fitH — sharper than bilinear on photographic
      // product shots, preserves edge detail that matters for flux attention.
      const resized = lanczosResize(decoded.data, decoded.width, decoded.height, fitW, fitH);

      // Composite letterboxed image at the center of the cell. The cell's
      // surrounding pixels remain white (panel background), creating natural
      // padding that separates this product from its neighbors.
      const { x: ox, y: oy } = POSITIONS[composited];
      for (let row = 0; row < fitH; row++) {
        for (let col = 0; col < fitW; col++) {
          const src = (row * fitW + col) * 4;
          const dst = ((oy + padY + row) * PANEL + (ox + padX + col)) * 4;
          panelRGBA[dst]     = resized[src];
          panelRGBA[dst + 1] = resized[src + 1];
          panelRGBA[dst + 2] = resized[src + 2];
          panelRGBA[dst + 3] = 255;
        }
      }

      // 1px gray hairline around the CELL bounds (not the letterboxed image
      // bounds) so flux sees a clean frame between this cell and its
      // neighbors. Drawn AFTER the image composite so it sits on top of any
      // edge pixels when fitW/fitH equal CELL.
      drawCellBorder(panelRGBA, ox, oy, CELL, CELL, PANEL, BORDER_R, BORDER_G, BORDER_B);

      composited++;
      compositedIndices.push(urlIdx);
      console.log(`[composite v10] Cell ${composited}/4 filled from URL ${urlIdx + 1} | src=${decoded.width}×${decoded.height} → fit=${fitW}×${fitH} pad=${padX},${padY} | grid=(${ox},${oy})`);
    } catch (e: any) {
      console.warn(`[composite] URL ${urlIdx + 1} error: ${e?.message ?? String(e)} — skipping`);
    }
  }

  if (composited === 0) return errResp("All product image downloads/decodes failed", 500);

  // ── Encode panel RGBA → JPEG ───────────────────────────────────────────────
  // jpeg.encode expects { data: Uint8Array|Buffer, width, height }, quality 0-100.
  // q95 — near-lossless; ~2x size of q85 but sharper edges on the downsampled
  // product thumbnails. Supabase storage bandwidth is not the bottleneck here.
  const encoded   = jpeg.encode({ data: panelRGBA, width: PANEL, height: PANEL }, 95);
  const jpegBytes = new Uint8Array(encoded.data.buffer ?? encoded.data);
  console.log(`[composite] Encoded ${jpegBytes.length} bytes | ${composited}/${candidateUrls.length} composited`);

  // ── Upload to Supabase Storage (bucket: room-uploads) ─────────────────────
  const path = `product-panels/${user_id}/${Date.now()}.jpg`;

  const { error: upErr } = await supabase.storage
    .from("room-uploads")
    .upload(path, jpegBytes, { contentType: "image/jpeg", upsert: true });

  if (upErr) {
    console.error(`[composite] Upload failed: ${upErr.message}`);
    return errResp(`Storage upload failed: ${upErr.message}`, 500);
  }

  const { data: urlData } = supabase.storage.from("room-uploads").getPublicUrl(path);
  if (!urlData?.publicUrl) return errResp("Upload succeeded but no public URL", 500);

  console.log(`[composite] Done | url=${urlData.publicUrl.substring(0, 80)} | indices=[${compositedIndices.join(",")}]`);
  return new Response(
    JSON.stringify({
      url:                 urlData.publicUrl,
      composited_count:    composited,
      composited_indices:  compositedIndices,
    }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});

// ── Lanczos3 resize ────────────────────────────────────────────────────────────
//
// Separable 2-pass Lanczos3 (a=3). Sharper than bilinear on photo content —
// preserves edge detail that's important for flux's attention map. Runs in
// ~O((sw*dh + dw*dh) * 6) which is fine for 1500→256 per product cell.
//
// Implementation: horizontal pass (sw × sh → dw × sh), then vertical pass
// (dw × sh → dw × dh). Alpha channel is forced to 255 on the output.

const LANCZOS_A = 3;

function lanczosKernel(x: number): number {
  if (x === 0) return 1;
  if (x <= -LANCZOS_A || x >= LANCZOS_A) return 0;
  const pix = Math.PI * x;
  return (LANCZOS_A * Math.sin(pix) * Math.sin(pix / LANCZOS_A)) / (pix * pix);
}

function lanczosResize(
  src: Uint8Array,
  sw: number, sh: number,
  dw: number, dh: number,
): Uint8Array {
  // Horizontal pass: sw × sh → dw × sh, 3 channels (alpha stripped)
  const horiz = new Float32Array(dw * sh * 3);
  const xRatio = sw / dw;
  const xSupport = Math.max(LANCZOS_A, LANCZOS_A * xRatio);

  for (let dx = 0; dx < dw; dx++) {
    const cx = (dx + 0.5) * xRatio - 0.5;
    const lo = Math.max(0, Math.ceil(cx - xSupport));
    const hi = Math.min(sw - 1, Math.floor(cx + xSupport));

    // Pre-compute normalized weights for this destination column
    const weights: number[] = [];
    let wsum = 0;
    for (let sx = lo; sx <= hi; sx++) {
      const t = xRatio > 1 ? (sx - cx) / xRatio : sx - cx;
      const w = lanczosKernel(t);
      weights.push(w);
      wsum += w;
    }
    const norm = wsum !== 0 ? 1 / wsum : 0;

    for (let sy = 0; sy < sh; sy++) {
      let r = 0, g = 0, b = 0;
      for (let i = 0, sx = lo; sx <= hi; sx++, i++) {
        const w = weights[i] * norm;
        const si = (sy * sw + sx) * 4;
        r += src[si]     * w;
        g += src[si + 1] * w;
        b += src[si + 2] * w;
      }
      const hi3 = (sy * dw + dx) * 3;
      horiz[hi3]     = r;
      horiz[hi3 + 1] = g;
      horiz[hi3 + 2] = b;
    }
  }

  // Vertical pass: dw × sh → dw × dh, 3 channels → RGBA output
  const dst = new Uint8Array(dw * dh * 4);
  const yRatio = sh / dh;
  const ySupport = Math.max(LANCZOS_A, LANCZOS_A * yRatio);

  for (let dy = 0; dy < dh; dy++) {
    const cy = (dy + 0.5) * yRatio - 0.5;
    const lo = Math.max(0, Math.ceil(cy - ySupport));
    const hi = Math.min(sh - 1, Math.floor(cy + ySupport));

    const weights: number[] = [];
    let wsum = 0;
    for (let sy = lo; sy <= hi; sy++) {
      const t = yRatio > 1 ? (sy - cy) / yRatio : sy - cy;
      const w = lanczosKernel(t);
      weights.push(w);
      wsum += w;
    }
    const norm = wsum !== 0 ? 1 / wsum : 0;

    for (let dx = 0; dx < dw; dx++) {
      let r = 0, g = 0, b = 0;
      for (let i = 0, sy = lo; sy <= hi; sy++, i++) {
        const w = weights[i] * norm;
        const hi3 = (sy * dw + dx) * 3;
        r += horiz[hi3]     * w;
        g += horiz[hi3 + 1] * w;
        b += horiz[hi3 + 2] * w;
      }
      const di = (dy * dw + dx) * 4;
      dst[di]     = clamp8(r);
      dst[di + 1] = clamp8(g);
      dst[di + 2] = clamp8(b);
      dst[di + 3] = 255;
    }
  }

  return dst;
}

function clamp8(v: number): number {
  if (v <= 0) return 0;
  if (v >= 255) return 255;
  return Math.round(v);
}

// ── Cell border drawer (v10) ───────────────────────────────────────────────────
//
// Draws a BORDER_THICKNESS-px rectangle around (ox, oy, w, h) in the panel
// RGBA buffer. v10 (Build 117) bumped from 1px → 2px because the panel is
// now 2104×2104 (vs v9's 1280×1280); a 1px border was visually halved on
// the larger canvas, weakening flux's cell-boundary perception.
//
// Used after compositing each cell's letterboxed product photo so flux's
// perceptual edge detection has an unambiguous boundary even when the
// product photo bleeds white-on-white at its edge (common with studio
// product shots that have white backgrounds).
function drawCellBorder(
  pixels: Uint8Array,
  ox: number, oy: number,
  w: number, h: number,
  panelW: number,
  r: number, g: number, b: number,
): void {
  const t = BORDER_THICKNESS;
  // Top + bottom edges (t rows each)
  for (let stripe = 0; stripe < t; stripe++) {
    for (let col = 0; col < w; col++) {
      const top = ((oy + stripe) * panelW + (ox + col)) * 4;
      const bot = ((oy + h - 1 - stripe) * panelW + (ox + col)) * 4;
      pixels[top]     = r; pixels[top + 1] = g; pixels[top + 2] = b; pixels[top + 3] = 255;
      pixels[bot]     = r; pixels[bot + 1] = g; pixels[bot + 2] = b; pixels[bot + 3] = 255;
    }
  }
  // Left + right edges (t columns each, skip corners — already drawn above)
  for (let stripe = 0; stripe < t; stripe++) {
    for (let row = t; row < h - t; row++) {
      const left  = ((oy + row) * panelW + (ox + stripe)) * 4;
      const right = ((oy + row) * panelW + (ox + w - 1 - stripe)) * 4;
      pixels[left]     = r; pixels[left + 1] = g; pixels[left + 2] = b; pixels[left + 3] = 255;
      pixels[right]    = r; pixels[right + 1] = g; pixels[right + 2] = b; pixels[right + 3] = 255;
    }
  }
}

// ── Error helper ───────────────────────────────────────────────────────────────

function errResp(msg: string, status: number): Response {
  console.error(`[composite] ERROR ${status}: ${msg}`);
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
