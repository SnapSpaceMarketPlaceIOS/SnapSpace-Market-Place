/**
 * HomeGenie — normalize-room-photo Edge Function (v1)
 *
 * Rotates an uploaded room photo based on its EXIF Orientation tag so
 * downstream consumers (flux-2-max, BFL kontext, vision-matcher, any
 * non-EXIF-aware renderer) see the image in the correct visual orientation.
 *
 * Why this exists (the full saga, so we don't re-learn this):
 *   Builds 17–20 all attempted to bake rotation somewhere before flux-2-max
 *   saw the photo. Every client-side attempt using expo-image-manipulator on
 *   iPhone 14 Pro / iOS 26 failed — the native module does not reliably honor
 *   EXIF on decode, even when given an explicit resize action. Build 20 tried
 *   Supabase's /render/image/ transform endpoint on the assumption that its
 *   underlying ImageMagick pipeline auto-orients; confirmed 2026-04-18 that
 *   it does so inconsistently — some captures are rotated correctly, others
 *   are served with the raw sideways pixel matrix regardless of EXIF.
 *
 *   Rotating server-side in an edge function removes ALL device / transform
 *   endpoint variability. We read the EXIF Orientation tag directly from the
 *   JPEG bytes, rotate the pixel buffer deterministically, and write a fresh
 *   JPEG with pixels in visual orientation and NO Orientation tag. Every
 *   downstream consumer then "just works" — flux, BFL, browsers, vision API.
 *
 * Why npm:jpeg-js (not sharp):
 *   We already proved `npm:jpeg-js` works in Supabase's Deno edge runtime via
 *   the composite-products function. sharp has native libvips bindings that
 *   may or may not deploy cleanly on Supabase's runtime image — chasing that
 *   uncertainty isn't worth it when jpeg-js handles JPEG encode/decode in
 *   pure JS and we can parse EXIF + rotate raw RGBA buffers ourselves.
 *
 * Input:  { raw_url: string }        — public URL of the uploaded room photo
 * Output: { url: string, orientation: number, rotated: boolean, dims: "WxH" }
 *
 * Auth: requires a valid Supabase user JWT (same pattern as composite-products).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jpeg from "npm:jpeg-js@0.4.4";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Longest-edge cap for the normalized output. flux-2-max downsamples every
// input to 0.5 MP (~707×707 square equivalent) regardless of what we send,
// so anything over ~1600px is wasted bytes on Replicate's input-fetch leg.
// Keeping well under that caps upload size + edge-function memory usage.
const MAX_EDGE = 1600;

// Pre-decode sanity cap on the uploaded JPEG. iPhone 14 Pro "ProRAW"-style
// full-res captures can be 10+ MB. Decoding those to RGBA inside a Deno edge
// function produces 48 MP × 4 bytes ≈ 200 MB — over the typical edge memory
// limit. Rather than OOM silently (which is what produced the Build 21
// landscape failures where the client fell back to the raw URL and paid
// $0.31 for a sideways gen), we reject up-front with a clear error the
// client can surface to the user.
const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 15 MB

// Pre-decode sanity cap on raw pixel dimensions. 4032 × 3024 (12 MP) decodes
// to ~48 MB RGBA — well inside Deno edge memory. 8064 × 6048 (48 MP) would
// hit ~195 MB which is not. Reject above this so OOM never becomes silent.
const MAX_INPUT_PIXELS = 20_000_000; // 20 megapixels

// ─── Minimal EXIF Orientation parser ─────────────────────────────────────────
// Walks the JPEG marker stream looking for the APP1 "Exif\0\0" segment and
// reads the Orientation tag (0x0112) from IFD0. Returns 1 (no rotation) if
// the tag is missing or the file isn't a JPEG we can parse.
//
// This is NOT a general EXIF library — we parse exactly one tag. If the file
// doesn't start with the JPEG SOI marker, or the APP1 structure is malformed,
// we fall through to orientation=1 and ship the bytes as-is.
function readExifOrientation(buf: Uint8Array): number {
  if (buf.length < 12 || buf[0] !== 0xFF || buf[1] !== 0xD8) return 1;
  let pos = 2;
  while (pos < buf.length - 4) {
    if (buf[pos] !== 0xFF) return 1;
    const marker = buf[pos + 1];
    if (marker === 0xDA || marker === 0xD9) return 1; // SOS/EOI — no more metadata
    const segLen = (buf[pos + 2] << 8) | buf[pos + 3];
    if (segLen < 2 || pos + 2 + segLen > buf.length) return 1;

    // APP1 marker + "Exif\0\0" magic
    if (
      marker === 0xE1 && segLen >= 14 &&
      buf[pos + 4] === 0x45 && buf[pos + 5] === 0x78 &&
      buf[pos + 6] === 0x69 && buf[pos + 7] === 0x66 &&
      buf[pos + 8] === 0x00 && buf[pos + 9] === 0x00
    ) {
      const tiffStart = pos + 10;
      const le = buf[tiffStart] === 0x49 && buf[tiffStart + 1] === 0x49;
      const read16 = (o: number) =>
        le ? (buf[o] | (buf[o + 1] << 8))
           : ((buf[o] << 8) | buf[o + 1]);
      const read32 = (o: number) =>
        le ? (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24))
           : ((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]);

      // TIFF magic is at tiffStart + 2 (bytes 0x2A00 LE or 0x002A BE) — skip.
      const ifd0Offset = tiffStart + read32(tiffStart + 4);
      if (ifd0Offset < tiffStart || ifd0Offset + 2 > buf.length) return 1;
      const numEntries = read16(ifd0Offset);
      for (let i = 0; i < numEntries; i++) {
        const entry = ifd0Offset + 2 + i * 12;
        if (entry + 10 > buf.length) break;
        const tag = read16(entry);
        if (tag === 0x0112) {
          const v = read16(entry + 8);
          return v >= 1 && v <= 8 ? v : 1;
        }
      }
      return 1;
    }
    pos += 2 + segLen;
  }
  return 1;
}

// ─── Rotation primitives (RGBA pixel buffer) ────────────────────────────────
// We handle EXIF 1/3/6/8 — the non-mirrored rotations iPhones produce in
// practice. The mirrored variants (2/4/5/7) are exotic; if we ever see one
// we ship as-is rather than add untested code paths.

function rotate180(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const j = src.length - 4 - i;
    out[j]     = src[i];
    out[j + 1] = src[i + 1];
    out[j + 2] = src[i + 2];
    out[j + 3] = src[i + 3];
  }
  return out;
}

function rotate90CW(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      // New position: column `h-1-y`, row `x` in a (h × w) matrix
      const d = (x * h + (h - 1 - y)) * 4;
      out[d]     = src[s];
      out[d + 1] = src[s + 1];
      out[d + 2] = src[s + 2];
      out[d + 3] = src[s + 3];
    }
  }
  return out;
}

function rotate270CW(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      // New position: column `y`, row `w-1-x` in a (h × w) matrix
      const d = ((w - 1 - x) * h + y) * 4;
      out[d]     = src[s];
      out[d + 1] = src[s + 1];
      out[d + 2] = src[s + 2];
      out[d + 3] = src[s + 3];
    }
  }
  return out;
}

function applyOrientation(
  rgba: Uint8Array, w: number, h: number, orientation: number,
): { data: Uint8Array, width: number, height: number, rotated: boolean } {
  switch (orientation) {
    case 3: return { data: rotate180(rgba), width: w, height: h, rotated: true };
    case 6: return { data: rotate90CW(rgba, w, h), width: h, height: w, rotated: true };
    case 8: return { data: rotate270CW(rgba, w, h), width: h, height: w, rotated: true };
    default: return { data: rgba, width: w, height: h, rotated: false };
  }
}

// ─── Bilinear downscale to MAX_EDGE ─────────────────────────────────────────
// Skips work entirely if the input is already small enough.
function downscale(rgba: Uint8Array, w: number, h: number, maxEdge: number) {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { data: rgba, width: w, height: h };
  const scale = maxEdge / longest;
  const nw = Math.round(w * scale);
  const nh = Math.round(h * scale);
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const sy = (y + 0.5) / scale - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(h - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < nw; x++) {
      const sx = (x + 0.5) / scale - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(w - 1, x0 + 1);
      const fx = sx - x0;
      const d = (y * nw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const tl = rgba[(y0 * w + x0) * 4 + c];
        const tr = rgba[(y0 * w + x1) * 4 + c];
        const bl = rgba[(y1 * w + x0) * 4 + c];
        const br = rgba[(y1 * w + x1) * 4 + c];
        const top = tl + (tr - tl) * fx;
        const bot = bl + (br - bl) * fx;
        out[d + c] = Math.round(top + (bot - top) * fy);
      }
    }
  }
  return { data: out, width: nw, height: nh };
}

// ─── Response helper ────────────────────────────────────────────────────────
function errResp(msg: string, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ─── Handler ────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, serviceKey);

  // Auth: require a valid user JWT (same pattern as composite-products).
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errResp("Missing authorization", 401);
  }
  const { data: { user: authUser }, error: authErr } =
    await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !authUser) return errResp("Invalid or expired token", 401);

  let body: { raw_url?: string };
  try { body = await req.json(); }
  catch { return errResp("Invalid JSON body", 400); }

  const { raw_url } = body;
  if (!raw_url || typeof raw_url !== "string") {
    return errResp("raw_url (string) required", 400);
  }

  // Only accept URLs from our own Supabase Storage — prevents using this
  // function as a general image proxy for arbitrary third-party content.
  if (!raw_url.startsWith(supabaseUrl)) {
    return errResp("raw_url must point to this Supabase project", 400);
  }

  const user_id = authUser.id;
  const t0 = Date.now();

  try {
    const res = await fetch(raw_url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return errResp(`Failed to fetch source: HTTP ${res.status}`, 502);
    const raw = new Uint8Array(await res.arrayBuffer());

    // Pre-decode size guard. Rather than OOMing the edge worker on huge
    // iPhone captures (which manifested as the client silently falling back
    // to the raw URL → sideways generation billed at $0.31), reject with a
    // 413 so the client can show "photo too large, please try a smaller one".
    if (raw.length > MAX_INPUT_BYTES) {
      const mb = (raw.length / (1024 * 1024)).toFixed(1);
      console.warn(`[normalize] reject oversize | user=${user_id} | ${mb} MB > ${MAX_INPUT_BYTES / (1024 * 1024)} MB`);
      return errResp(
        `Photo is too large (${mb} MB). Please pick a smaller photo or retake it.`,
        413,
      );
    }

    const orientation = readExifOrientation(raw);

    // Decode is the memory-heaviest step — any exception here means we can't
    // proceed. We throw (caller catches + surfaces) rather than return a
    // doctored result.
    let decoded;
    try {
      decoded = jpeg.decode(raw, { useTArray: true });
    } catch (decodeErr) {
      const msg = (decodeErr as Error)?.message || String(decodeErr);
      console.warn(`[normalize] decode failed | user=${user_id} | ${msg}`);
      return errResp(
        `Could not decode photo (${msg.substring(0, 120)}). Try a different photo.`,
        422,
      );
    }

    const { data: rgba0, width: w0, height: h0 } = decoded;

    // Post-decode pixel-count guard. The byte-size check above catches most
    // oversized uploads, but a heavily compressed JPEG can pass the byte
    // check yet decode to hundreds of megabytes of RGBA. Reject those too.
    if (w0 * h0 > MAX_INPUT_PIXELS) {
      const mp = ((w0 * h0) / 1_000_000).toFixed(1);
      console.warn(`[normalize] reject hi-res | user=${user_id} | ${mp} MP > ${MAX_INPUT_PIXELS / 1_000_000} MP | dims=${w0}x${h0}`);
      return errResp(
        `Photo resolution is too high (${mp} MP). Please pick a smaller photo.`,
        413,
      );
    }

    const { data: rgba1, width: w1, height: h1, rotated } =
      applyOrientation(rgba0, w0, h0, orientation);

    const { data: rgba2, width: w2, height: h2 } = downscale(rgba1, w1, h1, MAX_EDGE);

    // Re-encode as JPEG at quality 85. No EXIF is written by jpeg-js, so the
    // Orientation tag is gone — downstream consumers see baked pixels only.
    const encoded = jpeg.encode({ data: rgba2, width: w2, height: h2 }, 85);

    const ts = Date.now();
    const path = `${user_id}/normalized_${ts}.jpeg`;
    const { error: uploadErr } = await supabase.storage
      .from("room-uploads")
      .upload(path, encoded.data, {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (uploadErr) return errResp(`Upload failed: ${uploadErr.message}`, 500);

    const { data: { publicUrl } } = supabase.storage
      .from("room-uploads")
      .getPublicUrl(path);

    const elapsed = Date.now() - t0;
    console.log(
      `[normalize] user=${user_id} orient=${orientation} rotated=${rotated} ` +
      `srcDims=${w0}x${h0} outDims=${w2}x${h2} elapsed=${elapsed}ms`,
    );

    return new Response(
      JSON.stringify({
        url: publicUrl,
        orientation,
        rotated,
        dims: `${w2}x${h2}`,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    console.error(`[normalize] error for user=${user_id}:`, msg);
    return errResp(`Normalize failed: ${msg}`, 500);
  }
});
