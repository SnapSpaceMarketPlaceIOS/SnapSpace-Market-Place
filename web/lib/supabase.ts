/**
 * Server-side Supabase client for Next.js.
 *
 * Used by the wish landing page to read shared_wishes rows via the
 * get_shared_wish RPC. Anon key only — no service-role secrets in the
 * web app. The RPC is SECURITY DEFINER and runs with elevated privileges
 * server-side, so anon read is safe and intentional.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — set in Vercel env vars.',
    );
  }
  cached = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cached;
}

export interface SharedWish {
  id: string;
  image_url: string;
  prompt: string | null;
  room_type: string | null;
  created_at: string;
}

export async function fetchSharedWish(id: string): Promise<SharedWish | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('get_shared_wish', { p_id: id });
  if (error) {
    console.warn('[fetchSharedWish] RPC error:', error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) return null;
  return row as SharedWish;
}
