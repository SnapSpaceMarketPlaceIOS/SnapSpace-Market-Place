/**
 * SnapSpace — composite-products Edge Function (v6)
 *
 * Stitches up to 4 product images into a 512×512 2×2 panel JPEG so
 * flux-2-max receives 2 inputs (room + panel) instead of 4-5.
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
 *
 * Supabase edge functions officially support `npm:` specifiers (Deno 1.31+).
 * With `npm:`, Deno loads the CJS module through its own Node.js compat layer
 * rather than relying on esm.sh's CJS→ESM transform which produces broken
 * default exports for some packages.
 *
 * Panel layout (each cell 256×256 px):
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

const CELL  = 256;
const PANEL = 512;

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

  let body: { product_urls?: string[]; user_id?: string };
  try { body = await req.json(); }
  catch { return errResp("Invalid JSON body", 400); }

  const { product_urls, user_id } = body;
  if (!product_urls?.length) return errResp("product_urls required", 400);
  if (!user_id)              return errResp("user_id required", 400);

  // Accept up to 6 URLs as a backup pool — we need exactly 4 panel cells filled.
  // If any URL is broken (wrong content-type, network error, bad JPEG) we skip it
  // and pull from the remaining pool, guaranteeing all 4 cells are filled as long
  // as at least 4 of the provided URLs are valid images.
  const candidateUrls = product_urls.slice(0, 6);
  console.log(`[composite v6] ${candidateUrls.length} candidate URLs | user=${user_id}`);

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
  let composited = 0;

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

      // Bilinear resize to CELL×CELL
      const resized = bilinearResize(decoded.data, decoded.width, decoded.height, CELL, CELL);

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
      console.log(`[composite] Cell ${composited}/4 filled from URL ${urlIdx + 1} at grid pos (${POSITIONS[composited - 1].x}, ${POSITIONS[composited - 1].y})`);
    } catch (e: any) {
      console.warn(`[composite] URL ${urlIdx + 1} error: ${e?.message ?? String(e)} — skipping`);
    }
  }

  if (composited === 0) return errResp("All product image downloads/decodes failed", 500);

  // ── Encode panel RGBA → JPEG ───────────────────────────────────────────────
  // jpeg.encode expects { data: Uint8Array|Buffer, width, height }, quality 0-100
  const encoded   = jpeg.encode({ data: panelRGBA, width: PANEL, height: PANEL }, 85);
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

  console.log(`[composite] Done | url=${urlData.publicUrl.substring(0, 80)}`);
  return new Response(
    JSON.stringify({ url: urlData.publicUrl, composited_count: composited }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});

// ── Bilinear resize ────────────────────────────────────────────────────────────

function bilinearResize(
  src: Uint8Array,
  sw: number, sh: number,
  dw: number, dh: number,
): Uint8Array {
  const dst    = new Uint8Array(dw * dh * 4);
  const xRatio = sw / dw;
  const yRatio = sh / dh;

  for (let dy = 0; dy < dh; dy++) {
    for (let dx = 0; dx < dw; dx++) {
      const sx = dx * xRatio;
      const sy = dy * yRatio;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, sw - 1);
      const y1 = Math.min(y0 + 1, sh - 1);
      const xf = sx - x0;
      const yf = sy - y0;
      const di = (dy * dw + dx) * 4;

      for (let c = 0; c < 3; c++) {
        const tl = src[(y0 * sw + x0) * 4 + c];
        const tr = src[(y0 * sw + x1) * 4 + c];
        const bl = src[(y1 * sw + x0) * 4 + c];
        const br = src[(y1 * sw + x1) * 4 + c];
        dst[di + c] = Math.round(
          tl * (1 - xf) * (1 - yf) +
          tr *      xf  * (1 - yf) +
          bl * (1 - xf) *      yf  +
          br *      xf  *      yf,
        );
      }
      dst[di + 3] = 255;
    }
  }
  return dst;
}

// ── Error helper ───────────────────────────────────────────────────────────────

function errResp(msg: string, status: number): Response {
  console.error(`[composite] ERROR ${status}: ${msg}`);
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
