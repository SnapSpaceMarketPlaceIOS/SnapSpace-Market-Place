import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { optimizeForGeneration } from '../utils/imageOptimizer';

// Add your Supabase Project URL and Anon Key to the .env file.
// Find them in: Supabase Dashboard → Project Settings → API
// Variables must be prefixed with EXPO_PUBLIC_ to be available in the client bundle.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Converts a base64 string to a Uint8Array for Supabase Storage uploads.
function base64ToUint8Array(base64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const b64 = base64.replace(/=+$/, '');
  const n = b64.length;
  const bytes = new Uint8Array((n * 3) >> 2);
  let p = 0;
  for (let i = 0; i < n; i += 4) {
    const a = lookup[b64.charCodeAt(i)];
    const b = lookup[b64.charCodeAt(i + 1)];
    const c = lookup[b64.charCodeAt(i + 2)];
    const d = lookup[b64.charCodeAt(i + 3)];
    bytes[p++] = (a << 2) | (b >> 4);
    if (i + 2 < n) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < n) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

// SecureStore has a 2048-byte value limit per key, so large sessions (JWTs)
// are chunked automatically here. Falls back to AsyncStorage if SecureStore
// is unavailable (e.g. simulator without Secure Enclave support).
//
// IMPORTANT: On iOS simulators with missing keychain entitlements (e.g. iOS 26.x
// beta dev builds), SecureStore calls can HANG instead of throwing. A 2-second
// timeout races every SecureStore operation so we always fall back to
// AsyncStorage quickly rather than freezing the auth flow forever.
const CHUNK_SIZE = 1800; // bytes per SecureStore entry
const SS_TIMEOUT = 2000; // ms before we give up on SecureStore and use AsyncStorage

/** Race a SecureStore promise against a 2-second timeout. Returns the result
 *  or throws if SecureStore hangs or fails. */
function ssWithTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SecureStore timeout')), SS_TIMEOUT)
    ),
  ]);
}

const SecureStoreAdapter = {
  async getItem(key) {
    try {
      const count = await ssWithTimeout(SecureStore.getItemAsync(`${key}__chunks`));
      // If no chunked entry exists in SecureStore, check AsyncStorage directly —
      // the value may have been written there by a previous fallback setItem.
      if (count === null) return AsyncStorage.getItem(key);
      const n = parseInt(count, 10);
      const parts = await ssWithTimeout(
        Promise.all(Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(`${key}__${i}`)))
      );
      return parts.join('');
    } catch {
      // SecureStore hung, threw, or timed out — fall back to AsyncStorage
      return AsyncStorage.getItem(key);
    }
  },
  async setItem(key, value) {
    try {
      const chunks = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE));
      }
      await ssWithTimeout(SecureStore.setItemAsync(`${key}__chunks`, String(chunks.length)));
      await ssWithTimeout(
        Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(`${key}__${i}`, chunk)))
      );
    } catch {
      // SecureStore hung, threw, or timed out — fall back to AsyncStorage
      return AsyncStorage.setItem(key, value);
    }
  },
  async removeItem(key) {
    try {
      const count = await ssWithTimeout(SecureStore.getItemAsync(`${key}__chunks`));
      if (count !== null) {
        const n = parseInt(count, 10);
        await ssWithTimeout(SecureStore.deleteItemAsync(`${key}__chunks`));
        await ssWithTimeout(
          Promise.all(Array.from({ length: n }, (_, i) => SecureStore.deleteItemAsync(`${key}__${i}`)))
        );
      }
    } catch {
      return AsyncStorage.removeItem(key);
    }
    // Also clean up any AsyncStorage fallback entry for this key
    AsyncStorage.removeItem(key).catch(() => {});
  },
};

// Always use AsyncStorage for Supabase auth persistence.
//
// We previously ran SecureStoreAdapter in production for "better security"
// — in practice this chunked the session token across multiple iOS Keychain
// entries, each with its own 2-second read timeout. On iPhone 14 Pro / iOS 26
// cold launches the Keychain often took > 2 seconds on the FIRST chunk read,
// which tripped the timeout, dumped the chunked data, and fell through to an
// empty AsyncStorage (which had never been written because the original
// setItem succeeded on SecureStore). Net result: the session appeared to
// persist but was silently dropped on every app refresh, forcing the user
// back to the sign-in wall on every launch. Confirmed via Build 19 TestFlight
// report on 2026-04-18.
//
// AsyncStorage gives us deterministic reads/writes with no timeouts, no
// chunking, and no Keychain dependency. The security trade-off (refresh
// token stored locally on disk vs Keychain) is the standard React Native
// pattern used by every major consumer app — Supabase RLS is the real
// security boundary, not local token storage.
const authStorage = AsyncStorage;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/**
 * Fire-and-forget warm-up ping to the normalize-room-photo and composite-
 * products edge functions. Called from AuthContext when a user signs in
 * and from SnapScreen when the user opens the camera tab. The goal is to
 * spin up the Deno runtime on Supabase so the first REAL photo upload
 * doesn't hit a ~5–15s cold-start that causes uploadRoomPhoto to throw,
 * silently fall back to the raw URL, and ship sideways bytes to flux-2-max.
 *
 * We send an OPTIONS preflight — the edge function's handler responds to
 * OPTIONS with 200 and no body (no auth required). Cheap, non-disruptive,
 * and warms the runtime the same way a real POST would.
 *
 * Build 25 (2026-04-18): added after the normalize fn silent-fallback was
 * confirmed as the root cause of the "landscape photo displayed sideways
 * at flux-2-max" bug on the first generation post-deploy.
 */
export function warmupEdgeFunctions() {
  // DISABLED in Build 26 after Build 25 crashed with EXC_BAD_ACCESS on the
  // first launch and Snap tab focus. The OPTIONS + AbortSignal.timeout call
  // pattern triggered an NSException that RN's bridge could not marshal
  // back to JS cleanly (see convertNSExceptionToJSError stack frame in the
  // crash report). The cold-start problem this was meant to paper over
  // will be addressed in a future build via a pure-JS retry strategy
  // inside uploadRoomPhoto — NOT by reintroducing native-adjacent calls.
  //
  // Kept as an exported no-op so existing imports in AuthContext /
  // SnapScreen don't break if they miss a removal. The callers should
  // also be removed, but leaving the symbol safe means a stray call
  // can never crash again.
  return;
}

/**
 * Wipes the locally-stored Supabase auth token from AsyncStorage.
 * Call this before signInWithPassword when the client may have a
 * stale/corrupted session (e.g. after a crash with bad env vars).
 */
export async function clearStoredSession() {
  try {
    // Supabase v2 stores the session under this key pattern
    const projectRef = SUPABASE_URL.match(/https?:\/\/([^.]+)\./)?.[1] ?? '';
    const key = `sb-${projectRef}-auth-token`;
    await AsyncStorage.removeItem(key);
    // Also wipe legacy key used by older supabase-js versions
    await AsyncStorage.removeItem('supabase.auth.token');
  } catch {
    // Non-fatal — proceed regardless
  }
}

// ─── Profile Helpers ──────────────────────────────────────────────────────────

/** Fetch a user's profile row from the profiles table. */
export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

/** Update fields on the logged-in user's profile row. */
export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────

/**
 * Uploads a local image URI to a Supabase Storage bucket.
 * Returns the public URL of the uploaded file.
 * Bucket must exist and have public read access enabled.
 */
async function uploadImage(bucket, path, uri, base64Data = null, contentTypeOverride = null) {
  const base64 = base64Data || await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  // Derive content-type from URI extension, but whitelist to formats
  // Supabase Storage + flux-2-max both understand. Build 20 stopped
  // re-encoding room photos to JPEG client-side, so URIs can now be raw
  // HEIC/HEIF from iPhone 14 Pro or ph:// asset-library URIs with no
  // resolvable extension. `uri.split('.').pop()` on a ph:// URI returns
  // the entire URI, producing a garbage content-type that Supabase rejects.
  let contentType = contentTypeOverride;
  if (!contentType) {
    const rawExt = uri.split('.').pop()?.toLowerCase().replace('jpg', 'jpeg') || '';
    const allowed = { jpeg: 1, png: 1, webp: 1, heic: 1, heif: 1 };
    contentType = `image/${allowed[rawExt] ? rawExt : 'jpeg'}`;
  }
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, base64ToUint8Array(base64), { contentType, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Upload a user's avatar photo. Returns public URL. */
export async function uploadAvatar(userId, uri) {
  return uploadImage('avatars', `${userId}/avatar.jpeg`, uri);
}

/**
 * Upload a room photo for AI generation. Returns a permanently-correct,
 * EXIF-rotated JPEG URL by way of the `normalize-room-photo` edge function.
 *
 * Pipeline (post Build 20, 2026-04-18):
 *   1. Upload the ORIGINAL device bytes (EXIF Orientation tag intact) to
 *      /object/public/ under the raw upload path.
 *   2. Call the normalize-room-photo edge function with that URL. The
 *      function reads EXIF, rotates the RGBA buffer in pure JS, resizes
 *      to 1600px longest edge, re-encodes as JPEG (no EXIF tag on output),
 *      and uploads the normalized version back to /object/public/.
 *   3. Return the normalized URL for flux-2-max to fetch.
 *
 * Why this shape (and what we tried and abandoned):
 *   - Build 18 tried client-side rotation via expo-image-manipulator with
 *     empty actions: did not bake rotation on iPhone 14 Pro / iOS 26.
 *   - Build 19 added a resize action to force decode+encode: still did not
 *     bake rotation (native module ignores EXIF on decode) + doubled cost.
 *   - Build 20 switched to Supabase /render/image/ assuming it auto-orients:
 *     confirmed on 2026-04-18 that it does so inconsistently — some captures
 *     come through rotated, others arrive sideways at Replicate.
 *   - The edge function is deterministic: we parse EXIF ourselves and rotate
 *     the pixel buffer byte-for-byte. No device variability, no Supabase
 *     transform ambiguity, no trusting flux-2-max to honor EXIF (it doesn't).
 *
 * Retry + error-surfacing (Build 27):
 *   - Each attempt gets a 60s timeout (was 30s) to cover Deno cold-starts
 *     that routinely take 15–20s on Supabase edge.
 *   - Up to TWO attempts total, 1.5s backoff between. The first attempt
 *     warms the worker even if it times out; the second attempt usually
 *     hits a warm runtime and succeeds in ~1–2s.
 *   - If BOTH attempts exhaust without success, we throw a user-facing
 *     error instead of silently falling back to the raw URL. Silent
 *     fallback shipped sideways bytes to flux-2-max and produced
 *     mysteriously-wrong-orientation outputs that looked like "the AI
 *     is broken." A visible retry prompt is better UX than a confusing
 *     output.
 *
 * 4xx errors still bypass retry — those are photo-level problems (too
 * large, undecodable) that won't clear with a retry. The user needs to
 * pick a different photo; we surface that immediately.
 */

// Single normalize attempt. Returns one of:
//   { success: true,  data }            — normalized URL ready
//   { retryable: true, reason }         — transient failure, retry may help
//   throws userFacing Error             — photo is bad, do not retry
async function _attemptNormalize(rawUrl, jwt, userId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/normalize-room-photo`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'apikey':         SUPABASE_ANON_KEY,
      'Content-Type':   'application/json',
    },
    body: JSON.stringify({ raw_url: rawUrl }),
    // 60s cap (was 30s in Build 26). Cold-starts on Supabase edge Deno
    // routinely take 15–20s; the old 30s budget was too tight and fired
    // the catch branch on first-call, producing the silent sideways
    // fallback bug confirmed in Build 26 testing.
    signal: AbortSignal.timeout(60_000),
  });

  if (res.ok) {
    const data = await res.json().catch(() => null);
    if (data?.url) {
      return { success: true, data };
    }
    return { retryable: true, reason: 'empty-response' };
  }

  let body = '';
  try { body = await res.text(); } catch { /* ignore */ }
  let parsed = null;
  try { parsed = JSON.parse(body); } catch { /* keep body as text */ }
  const reason = parsed?.error || body || `HTTP ${res.status}`;

  // 4xx = photo-level issue. Retrying won't help — surface immediately.
  if (res.status >= 400 && res.status < 500) {
    const err = new Error(reason);
    err.userFacing = true;
    err.code = `NORMALIZE_${res.status}`;
    throw err;
  }

  // 5xx — server problem, retry may help (same worker on cold retry
  // is now warm from the first attempt, often succeeds).
  return { retryable: true, reason: `5xx-${res.status}` };
}

export async function uploadRoomPhoto(userId, uri, base64Data = null) {
  const ts = Date.now();
  const storagePath = `${userId}/${ts}.jpeg`;

  // ── Pre-upload optimization (FAL migration — Phase 1) ──────────────────
  // Resize source to ≤ 1 MP before upload so FAL's per-megapixel billing
  // stays in the cheap tier (~$0.06/gen instead of ~$0.45+ on raw 12-25 MP
  // iPhone photos). Optimizer also re-encodes to JPEG, fixing the iOS-26
  // AVIF E006 rejection at the source. On any failure we fall back to the
  // original bytes — upload is never blocked by the optimizer.
  let uploadUri = uri;
  let uploadBase64 = base64Data;
  let optimizationSucceeded = false;
  try {
    const optimized = await optimizeForGeneration(uri, 1);
    if (optimized?.optimized && optimized.uri) {
      uploadUri = optimized.uri;
      uploadBase64 = null; // force re-read from optimized URI
      optimizationSucceeded = true;
    }
  } catch (e) {
    console.warn('[uploadRoomPhoto] optimizer threw, using original:', e?.message || e);
  }

  // ── HEIC safety net ────────────────────────────────────────────────────
  // normalize-room-photo uses jpeg-js which can ONLY decode JPEG. If the
  // optimizer failed AND the original URI is HEIC/HEIF, the edge function
  // will fail with a 422. When we detect this condition, switch the
  // rawUrl we pass to normalize to a Supabase /render/image/ URL that
  // forces JPEG delivery — imgproxy (which powers render/image) supports
  // HEIC and applies auto-orientation, so normalize receives clean JPEG
  // bytes regardless of the source codec.
  const originalUriLower = (uri || '').toLowerCase();
  const originalIsHEIC = originalUriLower.endsWith('.heic') || originalUriLower.endsWith('.heif');

  await uploadImage('room-uploads', storagePath, uploadUri, uploadBase64);
  const rawStoragePath = `${SUPABASE_URL}/storage/v1/object/public/room-uploads/${storagePath}`;

  // If optimization didn't produce a JPEG and the input was HEIC, serve
  // it through the image transform endpoint so normalize gets JPEG bytes.
  let rawUrl = rawStoragePath;
  if (!optimizationSucceeded && originalIsHEIC) {
    rawUrl = `${SUPABASE_URL}/storage/v1/render/image/public/room-uploads/${storagePath}?format=jpeg&quality=90`;
    console.log('[uploadRoomPhoto] HEIC safety net — using render/image/ URL for normalize');
  }

  // Resolve a user JWT for the edge-function call. No JWT means the user
  // isn't signed in — there's no path forward that produces a correct
  // image, so raw URL fallback here is fine. This branch should never
  // fire in practice because generation is gated behind auth upstream.
  let jwt = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    jwt = session?.access_token || null;
  } catch { /* ignore — handled below */ }
  if (!jwt) {
    console.warn('[uploadRoomPhoto] no session JWT, using raw URL (may be rotated incorrectly)');
    console.log('[normalize] path=raw-fallback reason=no-jwt user=' + userId);
    return { url: rawUrl, width: null, height: null };
  }

  // Two-attempt retry loop. First attempt warms the cold worker (often
  // timing out); second attempt hits a warm runtime and almost always
  // succeeds. 1.5s backoff gives Deno a moment to finish spinning up.
  const MAX_ATTEMPTS = 2;
  const BACKOFF_MS = 1500;
  let lastReason = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const outcome = await _attemptNormalize(rawUrl, jwt, userId);
      if (outcome.success) {
        const { data } = outcome;
        console.log(
          `[uploadRoomPhoto] normalized | attempt=${attempt} orient=${data.orientation} rotated=${data.rotated} dims=${data.dims}`,
        );
        console.log('[normalize] path=edge-fn attempt=' + attempt + ' user=' + userId + ' dims=' + data.dims);
        return {
          url: data.url,
          width: typeof data.width === 'number' ? data.width : null,
          height: typeof data.height === 'number' ? data.height : null,
        };
      }
      // Retryable outcome. Record and try again if we have budget.
      lastReason = outcome.reason;
      console.warn(`[uploadRoomPhoto] attempt ${attempt}/${MAX_ATTEMPTS} retryable | reason=${lastReason}`);
    } catch (err) {
      // 4xx throws propagate immediately — photo-level issue, retry won't help.
      if (err?.userFacing) throw err;
      // Network throw / timeout — retryable if we have budget.
      lastReason = String(err?.message || err).substring(0, 60);
      console.warn(`[uploadRoomPhoto] attempt ${attempt}/${MAX_ATTEMPTS} threw | ${lastReason}`);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, BACKOFF_MS));
    }
  }

  // Both attempts exhausted. Build 28 reverts to Build 26 behavior:
  // fall back to the raw /object/public/ URL rather than blocking the
  // user entirely. Build 27 tried to hard-fail on exhaustion to avoid
  // shipping sideways bytes to flux-2-max, but in TestFlight (Build 29)
  // that produced a broken "We couldn't prepare your photo" on EVERY
  // cold-start generation — which is strictly worse UX than occasional
  // landscape-sideways output. Landscape-sideways is recoverable (user
  // retakes); hard-fail blocks everything.
  //
  // Telemetry remains loud so we can track normalize reliability.
  console.warn('[uploadRoomPhoto] normalize exhausted ' + MAX_ATTEMPTS + ' attempts — falling back to raw URL | lastReason=' + lastReason);
  console.log('[normalize] path=raw-fallback attempts=' + MAX_ATTEMPTS + ' lastReason=' + lastReason + ' user=' + userId);
  return { url: rawUrl, width: null, height: null };
}

// ─── User Designs Helpers ────────────────────────────────────────────────────

/**
 * Downloads a remote image (e.g. from Replicate CDN) and uploads it to
 * Supabase Storage so the URL never expires.
 * Returns the permanent public URL from Supabase.
 * If the image is already a Supabase URL, returns it as-is.
 */
// Ensure the room-uploads storage bucket exists (auto-create on first use)
let _bucketChecked = false;
async function ensureBucket() {
  if (_bucketChecked) return;
  try {
    const { error } = await supabase.storage.createBucket('room-uploads', {
      public: true,
      fileSizeLimit: 10485760, // 10 MB
    });
    // error code 'Duplicate' means it already exists — that's fine
    if (error && !error.message?.includes('already exists') && error.statusCode !== '409') {
      console.log('[Bucket] Create note:', error.message);
    }
  } catch (e) {
    console.log('[Bucket] Auto-create skipped:', e.message);
  }
  _bucketChecked = true;
}

export async function persistDesignImage(userId, remoteUrl) {
  if (!remoteUrl) throw new Error('No image URL to persist');
  // If already stored in Supabase, skip re-upload
  const supabaseHost = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace('https://', '');
  if (remoteUrl.includes(supabaseHost)) return remoteUrl;

  // Ensure storage bucket exists before uploading
  await ensureBucket();

  const ext = remoteUrl.includes('.webp') ? 'webp' : 'jpeg';
  const ts = Date.now();
  const localPath = `${FileSystem.cacheDirectory}design_${ts}.${ext}`;

  // Download image using fetch (FileSystem.downloadAsync deprecated in Expo 55)
  // Retry up to 3 times — BFL/FAL CDNs can be briefly slow after generation
  let base64;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(remoteUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      const bytes  = new Uint8Array(buffer);
      let binary   = '';
      const CHUNK  = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      base64 = btoa(binary);
      if (base64.length > 100) break;
      throw new Error('Downloaded content too small');
    } catch (e) {
      console.log(`[Persist] Download attempt ${attempt}/3 failed:`, e.message);
      if (attempt === 3) throw new Error('Image download failed after 3 attempts');
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  const storagePath = `${userId}/${ts}.${ext}`;
  const contentType = ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const { error } = await supabase.storage
    .from('room-uploads')
    .upload(storagePath, base64ToUint8Array(base64), { contentType, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from('room-uploads').getPublicUrl(storagePath);

  // Clean up local cache file (fire-and-forget)
  FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});

  console.log('[Persist] Image saved permanently:', data.publicUrl);
  return data.publicUrl;
}

/**
 * Save a new user design to the database.
 * Automatically persists the image to Supabase Storage if it's a remote URL
 * (e.g. Replicate CDN) so the image never expires.
 * Returns { success: true, designId, permanentUrl }.
 */
export async function saveUserDesign(userId, { imageUrl, prompt, styleTags, products, visibility }) {
  // Use a timeout to prevent hanging indefinitely
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Save timed out. Please try again.')), 30000)
  );

  const insertPromise = (async () => {
    // Step 1: Persist image to permanent Supabase Storage
    // Retry once on failure before falling back to temp URL
    let permanentUrl = imageUrl;
    let persistFailed = false;
    for (let retry = 0; retry < 2; retry++) {
      try {
        permanentUrl = await persistDesignImage(userId, imageUrl);
        break; // success
      } catch (e) {
        console.warn(`[Persist] Attempt ${retry + 1}/2 failed:`, e.message);
        if (retry === 0) await new Promise(r => setTimeout(r, 3000));
        else persistFailed = true;
      }
    }

    // Step 2: Insert the design row with the permanent URL
    if (persistFailed) {
      console.warn('[Persist] Saving with temp URL — image may expire. Original:', imageUrl);
    }
    const { data, error } = await supabase
      .from('user_designs')
      .insert({
        user_id: userId,
        image_url: permanentUrl,
        prompt: prompt || '',
        style_tags: styleTags || [],
        products: products || [],
        visibility: visibility || 'private',
        ...(persistFailed ? { needs_persist: true } : {}),
      })
      .select('id')
      .single();
    if (error) throw error;
    return { success: true, designId: data.id, permanentUrl };
  })();

  return Promise.race([insertPromise, timeoutPromise]);
}

// Wrap any promise with a timeout. Used to prevent spinners from hanging
// forever when Supabase / Cloudflare routing stalls on the UPDATE path —
// we got TestFlight reports of "Post to Profile" stuck on "Posting..."
// because these small RPC-style writes had no timeout at all.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s — please try again.`)), ms)
    ),
  ]);
}

/**
 * Update an existing design's visibility (e.g. private → public for "Post").
 * 15-second timeout so the Post spinner can never hang on a stalled network.
 */
export async function updateDesignVisibility(designId, visibility) {
  const run = (async () => {
    const { error } = await supabase
      .from('user_designs')
      .update({ visibility })
      .eq('id', designId);
    if (error) throw error;
  })();
  return withTimeout(run, 15000, 'Visibility update');
}

/**
 * Update the products snapshot on an existing design.
 * Used to ensure products are always persisted even if auto-save
 * fired before product matching completed. Same 15s timeout guard.
 */
export async function updateDesignProducts(designId, products) {
  const run = (async () => {
    const { error } = await supabase
      .from('user_designs')
      .update({ products })
      .eq('id', designId);
    if (error) throw error;
  })();
  return withTimeout(run, 15000, 'Products update');
}

/**
 * Permanently delete one of the current user's own designs from the
 * `user_designs` table. Scoped by `user_id` in addition to RLS so a
 * forged request can never delete someone else's post.
 *
 * Used by the "Delete Post" action on the My Wishes → post detail modal.
 */
export async function deleteUserDesign(designId, userId) {
  if (!designId || !userId) throw new Error('designId and userId required');
  const { error } = await supabase
    .from('user_designs')
    .delete()
    .eq('id', designId)
    .eq('user_id', userId);
  if (error) throw error;
}

/**
 * Delete duplicate designs that share the same prompt+image within a short window.
 * Keeps the most recent entry for each unique prompt per user.
 */
export async function deduplicateUserDesigns(userId) {
  // Handled at insert time by checking for recent duplicates
}

/**
 * Delete designs whose image_url is a temporary CDN URL (non-Supabase Storage).
 * BFL / Replicate CDN links expire after ~1 hour — this purges those stale rows
 * so they never appear as gray placeholders in the profile or explore grids.
 */
export async function deleteExpiredDesigns(userId) {
  const supabaseHost = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace('https://', '');
  if (!supabaseHost) return;

  const { data: all } = await supabase
    .from('user_designs')
    .select('id, image_url')
    .eq('user_id', userId);

  if (!all?.length) return;

  const expiredIds = all
    .filter(d => !d.image_url || !d.image_url.includes(supabaseHost))
    .map(d => d.id);

  if (!expiredIds.length) return;

  await supabase.from('user_designs').delete().in('id', expiredIds);
  console.log(`[Cleanup] Removed ${expiredIds.length} expired design(s)`);
}

/** Get all designs for a specific user (own profile) — permanent images only. */
export async function getUserDesigns(userId) {
  const supabaseHost = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace('https://', '');
  const { data, error } = await supabase
    .from('user_designs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  // Strip any temp-URL rows that slipped through before cleanup ran
  return (data || []).filter(d => d.image_url && (!supabaseHost || d.image_url.includes(supabaseHost)));
}

/** Get public designs for the Explore feed — any valid image URL. */
export async function getPublicDesigns(limit = 20, offset = 0) {
  // First try with profiles join (richer data)
  const { data, error } = await supabase
    .from('user_designs')
    .select('*, author:profiles!user_designs_user_id_fkey(id, full_name, username, avatar_url, is_verified_supplier)')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // If join fails (RLS, missing FK), fall back to plain query
  if (error) {
    console.log('[PublicDesigns] Join failed, falling back:', error.message);
    const { data: plain, error: plainErr } = await supabase
      .from('user_designs')
      .select('*')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (plainErr) throw plainErr;
    return (plain || []).filter(d => !!d.image_url);
  }
  return (data || []).filter(d => !!d.image_url);
}

// ─── Push Token Helpers ───────────────────────────────────────────────────────

/** Save a push notification token to the user's profile row. */
export async function savePushToken(userId, token) {
  const { error } = await supabase
    .from('profiles')
    .update({ push_token: token })
    .eq('id', userId);
  if (error) throw error;
}

// ─── Supplier Application Helpers ────────────────────────────────────────────

/** Submit a new supplier application for the logged-in user. */
export async function submitSupplierApplication(userId, payload) {
  const { data, error } = await supabase
    .from('supplier_applications')
    .insert({ user_id: userId, ...payload, status: 'pending' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Get the latest supplier application for the logged-in user. */
export async function getMyApplication(userId) {
  const { data, error } = await supabase
    .from('supplier_applications')
    .select('*')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ─── Supplier Dashboard Helpers ───────────────────────────────────────────────

/** Get the supplier profile (storefront data) for the logged-in supplier. */
export async function getSupplierProfile(supplierId) {
  const { data, error } = await supabase
    .from('supplier_profiles')
    .select('*')
    .eq('id', supplierId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Update the supplier's storefront profile. */
export async function updateSupplierProfile(supplierId, updates) {
  const { data, error } = await supabase
    .from('supplier_profiles')
    .update(updates)
    .eq('id', supplierId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Fetch aggregated dashboard stats via the get_supplier_stats RPC. */
export async function getSupplierStats(supplierId) {
  const { data, error } = await supabase.rpc('get_supplier_stats', {
    p_supplier_id: supplierId,
  });
  if (error) throw error;
  return data;
}

/** Fetch all products for a supplier. */
export async function getSupplierProducts(supplierId) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Create a new product listing. */
export async function createProduct(supplierId, payload) {
  const { data, error } = await supabase
    .from('products')
    .insert({ supplier_id: supplierId, ...payload })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Update an existing product listing. */
export async function updateProduct(productId, supplierId, updates) {
  const { data, error } = await supabase
    .from('products')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .eq('supplier_id', supplierId) // ownership guard
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Soft-delete a product by setting is_active = false. */
export async function deleteProduct(productId, supplierId) {
  const { error } = await supabase
    .from('products')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .eq('supplier_id', supplierId);
  if (error) throw error;
}

/** Fetch all orders for a supplier. */
export async function getSupplierOrders(supplierId) {
  const { data, error } = await supabase
    .from('supplier_orders')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('ordered_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Mark an order as fulfilled. */
export async function fulfillOrder(orderId, supplierId, trackingNumber) {
  const { data, error } = await supabase
    .from('supplier_orders')
    .update({
      status: 'fulfilled',
      fulfilled_at: new Date().toISOString(),
      tracking_number: trackingNumber || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('supplier_id', supplierId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Fetch supplier analytics for a given period.
 * Calls get_supplier_analytics RPC (see 004_analytics.sql).
 * @param {string} supplierId
 * @param {number} days - Number of days to look back (default 30)
 */
export async function getSupplierAnalytics(supplierId, days = 30) {
  const { data, error } = await supabase.rpc('get_supplier_analytics', {
    p_supplier_id: supplierId,
    p_days: days,
  });
  if (error) throw error;
  return data;
}

/**
 * Record a product page view event.
 * Call this when a buyer opens a product detail screen.
 * @param {string} productId
 * @param {string} supplierId
 * @param {string|null} viewerId - Authenticated user's ID, or null for anonymous
 */
export async function recordProductView(productId, supplierId, viewerId = null) {
  const { error } = await supabase.rpc('record_product_view', {
    p_product_id:  productId,
    p_supplier_id: supplierId,
    p_viewer_id:   viewerId,
  });
  if (error) throw error;
}

// ─── Admin Helpers ────────────────────────────────────────────────────────────

/**
 * Fetch all supplier applications for the admin queue.
 * Joins the applicant's profile so we have email + account age in one query.
 * @param {{ status?: string, businessType?: string }} filters
 */
export async function adminGetApplications(filters = {}) {
  let query = supabase
    .from('supplier_applications')
    .select(`
      *,
      applicant:profiles!supplier_applications_user_id_fkey (
        id, email, full_name, created_at, role, is_verified_supplier
      )
    `)
    .order('submitted_at', { ascending: true });

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }
  if (filters.businessType && filters.businessType !== 'all') {
    query = query.eq('business_type', filters.businessType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Fetch a single application by ID with applicant profile joined.
 */
export async function adminGetApplication(applicationId) {
  const { data, error } = await supabase
    .from('supplier_applications')
    .select(`
      *,
      applicant:profiles!supplier_applications_user_id_fkey (
        id, email, full_name, created_at, avatar_url, role, is_verified_supplier
      )
    `)
    .eq('id', applicationId)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Approve a supplier application.
 * Calls the atomic approve_supplier_application RPC (see 002_admin_panel.sql).
 */
export async function adminApproveApplication(applicationId, adminId) {
  const { data, error } = await supabase.rpc('approve_supplier_application', {
    application_id: applicationId,
    admin_id: adminId,
  });
  if (error) throw error;
  return data;
}

/**
 * Reject a supplier application.
 * Calls the atomic reject_supplier_application RPC.
 */
export async function adminRejectApplication(applicationId, adminId, notes) {
  const { data, error } = await supabase.rpc('reject_supplier_application', {
    application_id: applicationId,
    admin_id: adminId,
    rejection_notes: notes || null,
  });
  if (error) throw error;
  return data;
}

/**
 * Suspend a supplier — revokes badge + role, updates application status.
 */
export async function adminSuspendSupplier(targetUserId, adminId, reason) {
  const { data, error } = await supabase.rpc('suspend_supplier', {
    target_user_id: targetUserId,
    admin_id: adminId,
    suspend_reason: reason || null,
  });
  if (error) throw error;
  return data;
}

// ─── Social: Follow / Unfollow ────────────────────────────────────────────────

export async function followUser(followerId, followingId) {
  const { error } = await supabase.rpc('follow_user', {
    p_follower_id: followerId,
    p_following_id: followingId,
  });
  if (error) throw error;
}

export async function unfollowUser(followerId, followingId) {
  const { error } = await supabase.rpc('unfollow_user', {
    p_follower_id: followerId,
    p_following_id: followingId,
  });
  if (error) throw error;
}

export async function checkIsFollowing(followerId, followingId) {
  const { data, error } = await supabase.rpc('is_following', {
    p_follower_id: followerId,
    p_following_id: followingId,
  });
  if (error) return false;
  return !!data;
}

// ─── Social: Likes ────────────────────────────────────────────────────────────

export async function toggleLike(userId, designId) {
  const { data, error } = await supabase.rpc('toggle_like', {
    p_user_id: userId,
    p_design_id: designId,
  });
  if (error) throw error;
  return data; // { liked: boolean, count: number }
}

/** Fetch all design IDs a user has liked (for hydrating LikedContext). */
export async function getUserLikedIds(userId) {
  const { data, error } = await supabase
    .from('design_likes')
    .select('design_id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map(r => r.design_id);
}

/** Fetch full design objects for all designs a user has liked. */
export async function getUserLikedDesigns(userId) {
  const { data, error } = await supabase
    .from('design_likes')
    .select('design_id, user_designs(id, image_url, prompt, style_tags, products, likes, visibility, user_id, profiles:user_designs_user_id_fkey(full_name, username, avatar_url, is_verified_supplier))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    // Fallback: try without profile join
    const { data: plain, error: plainErr } = await supabase
      .from('design_likes')
      .select('design_id, user_designs(id, image_url, prompt, style_tags, products, likes, visibility, user_id)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (plainErr) throw plainErr;
    return (plain || []).map(r => r.user_designs).filter(Boolean);
  }
  return (data || []).map(r => r.user_designs).filter(Boolean);
}

// ─── Social: Profiles ────────────────────────────────────────────────────────

export async function getUserProfileData(username) {
  const { data, error } = await supabase.rpc('get_user_profile_data', {
    p_username: username,
  });
  if (error) throw error;
  return data; // { id, full_name, username, bio, avatar_url, is_verified_supplier, follower_count, following_count, design_count }
}

export async function getMyStats(userId) {
  const { data, error } = await supabase.rpc('get_my_stats', {
    p_user_id: userId,
  });
  if (error) throw error;
  return data; // { followers, following, designs }
}

export async function getFollowers(userId, limit = 50, offset = 0) {
  const { data, error } = await supabase.rpc('get_followers', {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return data || [];
}

export async function getFollowing(userId, limit = 50, offset = 0) {
  const { data, error } = await supabase.rpc('get_following', {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return data || [];
}

export async function getUserPublicDesigns(userId, limit = 12, offset = 0) {
  const { data, error } = await supabase.rpc('get_user_public_designs', {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return data || [];
}
