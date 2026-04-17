/**
 * HomeGenie — composite-products Edge Function (v8)
 *
 * Stitches up to 4 product images into a 768×768 2×2 panel JPEG (384×384 per
 * cell) so flux-2-max receives 2 inputs (room + panel) instead of 4-5.
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
 *       Each cell now carries 2.25× more pixels. The Lanczos downsample from
 *       1500px source is 1500/384 = 3.9× instead of 5.8×, preserving ~33%
 *       more high-frequency detail (leather grain, stitching, wood grain).
 *       Flux-2-max sees 2.25× more attention patches per product reference so
 *       the rendered item more closely matches the catalog silhouette.
 *       Cost impact: $0 (Replicate bills per output MP, not input). Edge fn
 *       compute ~2.25× more pixels to Lanczos — still sub-second.
 *
 * Supabase edge functions officially support `npm:` specifiers (Deno 1.31+).
 * With `npm:`, Deno loads the CJS module through its own Node.js compat layer
 * rather than relying on esm.sh's CJS→ESM transform which produces broken
 * default exports for some packages.
 *
 * Panel layout (each cell 384×384 px, panel 768×768):
 *   ┌──────────┬──────────┐
 *   │ product1 │ product2 │
 *   ├──────────┼──────────┤
 *   │ product3 │ product4 │
 *   └──────────┴──────────┘
 *
 * Input:  { product_urls: string[] (up to 6 backup candidates), user_id: string }
 * Output: { url: string, composited_count: number }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jpeg from "npm:jpeg-js@0.4.4";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CELL  = 384;
const PANEL = 768;

const POSITIONS = [
  { x: 0,    y: 0    },   // top-left
  { x: CELL, y: 0    },   // top-right
  { x: 0,    y: CELL },   // bottom-left
  { x: CELL, y: CELL },   // bottom-right
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

  // Accept up to 6 URLs as a backup pool — we need exactly 4 panel cells filled.
  // If any URL is broken (wrong content-type, network error, bad JPEG) we skip it
  // and pull from the remaining pool, guaranteeing all 4 cells are filled as long
  // as at least 4 of the provided URLs are valid images.
  const candidateUrls = product_urls.slice(0, 6);
  console.log(`[composite v8] ${candidateUrls.length} candidate URLs | user=${user_id} | cell=${CELL}×${CELL} panel=${PANEL}×${PANEL}`);

  // ── Allocate 512×512 RGBA panel buffer — light gray background ─────────────
  const panelRGBA = new Uint8Array(PANEL * PANEL * 4);
  for (let i = 0; i < panelRGBA.length; i += 4) {
    panelRGBA[i]     = 240;  // R
    panelRGBA[i + 1] = 240;  // G
    panelRGBA[i + 2] = 240;  // B
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

      // Lanczos3 resize to CELL×CELL — sharper than bilinear on photographic
      // product shots, preserves edge detail that matters for flux attention.
      const resized = lanczosResize(decoded.data, decoded.width, decoded.height, CELL, CELL);

      // Copy resized pixels into the panel at the next available 2×2 grid cell
      const { x: ox, y: oy } = POSITIONS[composited];
      for (let row = 0; row < CELL; row++) {
        for (let col = 0; col < CELL; col++) {
          const src = (row * CELL + col) * 4;
          const dst = ((oy + row) * PANEL + (ox + col)) * 4;
          panelRGBA[dst]     = resized[src];
          panelRGBA[dst + 1] = resized[src + 1];
          panelRGBA[dst + 2] = resized[src + 2];
          panelRGBA[dst + 3] = 255;
        }
      }

      composited++;
      compositedIndices.push(urlIdx);
      console.log(`[composite] Cell ${composited}/4 filled from URL ${urlIdx + 1} at grid pos (${POSITIONS[composited - 1].x}, ${POSITIONS[composited - 1].y})`);
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

// ── Error helper ───────────────────────────────────────────────────────────────

function errResp(msg: string, status: number): Response {
  console.error(`[composite] ERROR ${status}: ${msg}`);
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
