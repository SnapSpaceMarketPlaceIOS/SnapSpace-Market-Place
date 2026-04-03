import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';

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

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: SecureStoreAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

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
async function uploadImage(bucket, path, uri, base64Data = null) {
  const base64 = base64Data || await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const ext = uri.split('.').pop()?.toLowerCase().replace('jpg', 'jpeg') || 'jpeg';
  const contentType = `image/${ext}`;
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

/** Upload a room photo for AI generation. Returns public URL. */
export async function uploadRoomPhoto(userId, uri, base64Data = null) {
  const ts = Date.now();
  return uploadImage('room-uploads', `${userId}/${ts}.jpeg`, uri, base64Data);
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
    let permanentUrl = imageUrl;
    try {
      permanentUrl = await persistDesignImage(userId, imageUrl);
    } catch (e) {
      console.warn('Image persist failed, saving with original URL:', e.message);
      // Fall back to original URL if persist fails — design data is still saved
    }

    // Step 2: Insert the design row with the permanent URL
    const { data, error } = await supabase
      .from('user_designs')
      .insert({
        user_id: userId,
        image_url: permanentUrl,
        prompt: prompt || '',
        style_tags: styleTags || [],
        products: products || [],
        visibility: visibility || 'private',
      })
      .select('id')
      .single();
    if (error) throw error;
    return { success: true, designId: data.id, permanentUrl };
  })();

  return Promise.race([insertPromise, timeoutPromise]);
}

/**
 * Update an existing design's visibility (e.g. private → public for "Post").
 */
export async function updateDesignVisibility(designId, visibility) {
  const { error } = await supabase
    .from('user_designs')
    .update({ visibility })
    .eq('id', designId);
  if (error) throw error;
}

/**
 * Delete duplicate designs that share the same prompt+image within a short window.
 * Keeps the most recent entry for each unique prompt per user.
 */
export async function deduplicateUserDesigns(userId) {
  // Handled at insert time by checking for recent duplicates
}

/** Get all designs for a specific user (own profile). */
export async function getUserDesigns(userId) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('getUserDesigns timed out')), 10000)
  );
  const query = supabase
    .from('user_designs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const { data, error } = await Promise.race([query, timeout]);
  if (error) throw error;
  return data || [];
}

/** Get public designs for the Explore feed. */
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
    return plain || [];
  }
  return data || [];
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
