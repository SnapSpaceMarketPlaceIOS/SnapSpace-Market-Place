/**
 * SnapSpace — Product-Aware Generation Service
 *
 * Client-side wrapper for the generate-with-products Supabase Edge Function.
 *
 * Tier routing:
 *   free tier    → edge function runs Pass 1 only (flux-depth-dev + Vision re-match)
 *   premium tier → edge function runs full pipeline (Pass 1 + SAM + IP-Adapter inpainting × N)
 *
 * Cost per call (tracked server-side in generation_log):
 *   free:    ~$0.035–0.055
 *   premium: ~$0.11–0.27
 *
 * Falls back to the existing local pipeline (replicate.js + visionMatcher.js)
 * if the edge function is unavailable or returns an error, so the app
 * never breaks for the user.
 */

import { supabase } from './supabase';

const FUNCTION_NAME = 'generate-with-products';

/**
 * Check whether the user has remaining quota before showing the generate button.
 * Called on HomeScreen mount so we can show "2 of 3 free uses remaining" in the UI.
 *
 * @param {string} userId
 * @returns {Promise<{
 *   tier: string,
 *   quotaLimit: number,
 *   generationsUsed: number,
 *   generationsRemaining: number,
 *   canGenerate: boolean,
 *   quotaResetDate: string,
 * }>}
 */
export async function getUserQuota(userId) {
  try {
    const { data, error } = await supabase
      .rpc('get_user_quota', { p_user_id: userId });

    if (error || !data?.[0]) {
      // Default: allow generation (fail open so quota issues don't block users)
      return {
        tier: 'free',
        quotaLimit: 5,
        generationsUsed: 0,
        generationsRemaining: 5,
        canGenerate: true,
        quotaResetDate: null,
      };
    }

    const q = data[0];
    return {
      tier:                 q.tier,
      quotaLimit:           q.quota_limit,
      generationsUsed:      q.generations_used,
      generationsRemaining: q.generations_remaining,
      canGenerate:          q.can_generate,
      quotaResetDate:       q.quota_reset_date,
    };
  } catch (err) {
    console.warn('[ProductAwareGen] Quota check failed:', err.message);
    return { canGenerate: true, tier: 'free', generationsRemaining: 5 };
  }
}

/**
 * Generate a product-aware interior design using the edge function pipeline.
 *
 * @param {object} params
 * @param {string} params.roomPhotoUrl    - Public Supabase Storage URL of user's room photo
 * @param {string} params.prompt          - User's design prompt
 * @param {string} params.userId          - Auth user ID
 * @param {'free'|'premium'} params.tier  - User's subscription tier
 * @param {function} params.onStatus      - Callback for status messages (shown in UI)
 *
 * @returns {Promise<{
 *   imageUrl: string,          - Final generated room image URL
 *   products: object[],        - Products matched to the generated room
 *   tier: string,
 *   passesCompleted: number,
 *   costUsd: number,           - Total cost of this generation (for monitoring)
 *   pipeline: string,          - 'v2' (free) or 'v3' (premium)
 * }>}
 */
export async function generateWithProducts({
  roomPhotoUrl,
  prompt,
  userId,
  tier = 'free',
  products = [],
  onStatus = () => {},
}) {
  onStatus('Generating your design…');

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: {
      room_photo_url: roomPhotoUrl,
      prompt,
      user_id: userId,
      tier,
      products: products.map(p => ({
        id:            p.id,
        name:          p.name,
        brand:         p.brand,
        image_url:     p.imageUrl,
        affiliate_url: p.affiliateUrl,
        category:      p.category,
        price:         p.priceValue ?? p.price,
      })),
    },
  });

  if (error) {
    throw new Error(`Generation service error: ${error.message}`);
  }

  // Quota exceeded — surface a specific error the UI can handle
  if (data?.error === 'quota_exceeded') {
    const err = new Error(data.message || 'Free generation limit reached');
    err.code = 'QUOTA_EXCEEDED';
    err.quotaResetDate = data.quota_reset_date;
    err.upgradeUrl = data.upgrade_url;
    throw err;
  }

  if (!data?.image_url) {
    throw new Error('Generation completed but no image URL returned');
  }

  // Log cost to console in dev — useful for monitoring during testing
  if (__DEV__) {
    console.log(
      `[ProductAwareGen] Generation complete | pipeline=${data.pipeline} | ` +
      `passes=${data.passes_completed} | cost=$${data.cost_usd?.toFixed(4)} | ` +
      `duration=${Math.round((data.duration_ms || 0) / 1000)}s`
    );
  }

  return {
    imageUrl:         data.image_url,
    products:         data.products ?? [],
    tier:             data.tier ?? tier,
    passesCompleted:  data.passes_completed ?? 0,
    costUsd:          data.cost_usd ?? 0,
    costBreakdown:    data.cost_breakdown ?? {},
    pipeline:         data.pipeline ?? 'v2',
    durationMs:       data.duration_ms ?? 0,
  };
}
