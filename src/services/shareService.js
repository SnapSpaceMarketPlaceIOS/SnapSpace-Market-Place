/**
 * shareService.js — premium-share URL generator
 *
 * Replaces the raw Supabase storage URL in the iOS share sheet with a
 * branded landing page URL: `https://homegenie.app/wish/<shareId>`.
 *
 * Recipient experience changes from:
 *   "lqjfnpibbjymhzupqtda.supabase.co/.../1777431537448" + raw fullscreen image
 * to:
 *   "homegenie.app/wish/Xa9bK_mQ2p" + iMessage rich preview card with
 *   HomeGenie title, image hero, and an App Store CTA on tap.
 *
 * Flow:
 *   1. Caller has the image URL + prompt for the wish to share
 *   2. We POST to Supabase via the create_shared_wish RPC, which writes
 *      a row in shared_wishes and returns a 10-char URL-safe id
 *   3. We build the public landing URL using EXPO_PUBLIC_WEB_DOMAIN
 *   4. Caller hands that URL to Share.share({ url, message })
 *
 * Failure modes (createShareableWishURL → graceful fallback):
 *   - Not signed in: returns the raw image URL (preserves prior behavior)
 *   - RPC fails (network, RLS regression, etc.): returns the raw image URL
 *     and logs a warning — the share still works, just without the
 *     premium landing page
 *   - The web domain isn't deployed yet: the `homegenie.app/wish/...`
 *     URL still goes out via the share sheet; deploy lands later, all
 *     existing share links activate retroactively (the row already
 *     exists in shared_wishes when the page goes live)
 */
import { supabase } from './supabase';

// EXPO_PUBLIC_WEB_DOMAIN is intentionally NOT defaulted — the new share
// flow is dormant until the web app is actually deployed. Without this
// env var, createShareableWishURL falls back to the raw image URL,
// preserving the pre-Build-114 share behavior. Set this to your domain
// (e.g. "homegenie.app", no trailing slash) only after the Next.js
// landing page is live, otherwise recipients tap a link that 404s.
const WEB_DOMAIN = (process.env.EXPO_PUBLIC_WEB_DOMAIN || '').replace(/\/+$/, '');

/**
 * Create a shareable wish row + return a branded landing URL.
 *
 * @param {object} args
 * @param {string} args.imageUrl  — required, the rendered design image
 * @param {string} [args.prompt]  — optional, the user's prompt (used as caption + OG title)
 * @param {string} [args.roomType] — optional, e.g. 'living-room'
 * @returns {Promise<string>} — the share URL to hand to Share.share. Falls
 *   back to imageUrl on any failure so the share never breaks.
 */
export async function createShareableWishURL({ imageUrl, prompt, roomType } = {}) {
  if (!imageUrl) return '';

  // Feature gate: if no web domain is configured, the landing page isn't
  // deployed yet — return the raw image URL so the share still works.
  if (!WEB_DOMAIN) return imageUrl;

  try {
    const { data, error } = await supabase.rpc('create_shared_wish', {
      p_image_url: imageUrl,
      p_prompt:    prompt    ?? null,
      p_room_type: roomType  ?? null,
    });
    if (error) {
      console.warn('[shareService] create_shared_wish RPC failed:', error.message);
      return imageUrl;
    }
    const id = Array.isArray(data) ? data[0]?.id : data?.id;
    if (!id) {
      console.warn('[shareService] create_shared_wish returned no id; falling back to image URL');
      return imageUrl;
    }
    return `https://${WEB_DOMAIN}/wish/${id}`;
  } catch (e) {
    console.warn('[shareService] unexpected failure; falling back to image URL:', e?.message || e);
    return imageUrl;
  }
}
