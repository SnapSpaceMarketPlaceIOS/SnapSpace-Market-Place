import { Linking, Alert } from 'react-native';
import { trackEvent } from './trackingService';
import { getAffiliateUrl } from './affiliateProducts';
import { supabase } from './supabase';
import { trackAffiliateClickAndTagUrl } from './purchaseTracking';

/**
 * ProductTapHandler — the function that pays HomeGenie.
 *
 * Called by EVERY "Shop Now" / "Buy on Amazon" button in the entire app:
 *   Home (Deal of the Day, New Arrivals, Picked For You)
 *   Snap result product cards
 *   Cart
 *   Explore / ShopTheLook
 *   ProductDetail
 *
 * ORDER IS MANDATORY:
 *   1. trackEvent() fires BEFORE the link opens (analytics)
 *   2. trackAffiliateClickAndTagUrl() logs the click + appends ascsubtag
 *      for Amazon URLs. It NEVER modifies the existing `tag=` partner
 *      identifier, and non-Amazon URLs pass through unchanged.
 *   3. Linking.openURL() opens the tagged affiliate deep link
 */

/**
 * Handle a Shop Now tap on any product card.
 *
 * @param {object} product - Normalized product object (from affiliateProducts.js)
 */
export async function handleShopNow(product) {
  if (!product) return;

  // Step 1: Fire tracking event before redirect (must come first)
  trackEvent('product_tap', {
    product_id:   product.id   ?? '',
    product_name: product.name ?? '',
    brand:        product.brand ?? '',
    retailer:     product.source ?? product.retailer ?? '',
    price:        product.priceValue ?? product.price ?? 0,
    category:     product.category ?? '',
    style_tag:    (product.styles ?? []).join(','),
    room_type:    product.roomType ?? '',
  });

  // Step 2: Resolve the original affiliate URL (unchanged from before)
  const originalUrl = getAffiliateUrl(product) ?? product.affiliateUrl ?? null;
  if (!originalUrl) {
    // Surface a friendly message instead of silently no-op'ing —
    // users should never tap "Shop Now" and have nothing happen.
    Alert.alert(
      'Product Unavailable',
      "We couldn't find a shopping link for this item right now. Please try another product."
    );
    return;
  }

  // Step 3 (NEW): Attribution tagging for Amazon links.
  // Logs the click via server-side RPC and appends `ascsubtag=<server-generated>`
  // WITHOUT touching the existing `tag=` affiliate identifier. For non-Amazon
  // URLs or logged-out users, this returns the original URL unchanged.
  //
  // The entire attribution layer is capped at AUTH_TIMEOUT_MS + RPC_TIMEOUT_MS
  // and wrapped in try/catch — if anything fails, the original URL opens so
  // affiliate revenue is never lost.
  let urlToOpen = originalUrl;
  try {
    // Wrap auth.getUser() in a short timeout — on iOS 26 cold-TLS this call
    // can hang indefinitely, and we must never block the user's tap.
    const AUTH_TIMEOUT_MS = 800;
    const userPromise = supabase.auth.getUser();
    const userResult = await Promise.race([
      userPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), AUTH_TIMEOUT_MS)),
    ]);
    const userId = userResult?.data?.user?.id;

    urlToOpen = await trackAffiliateClickAndTagUrl({
      userId,
      url:     originalUrl,
      product,
    });
  } catch (e) {
    // Any failure in the attribution layer is non-fatal — the user's tap
    // must always open the original URL so revenue is never lost.
    console.warn('[ProductTapHandler] attribution tag failed (non-fatal):', e?.message || e);
    urlToOpen = originalUrl;
  }

  // Step 4: Open the affiliate deep link (tagged if possible, original otherwise).
  // Do NOT gate on Linking.canOpenURL — iOS returns false for deep link schemes
  // not declared in LSApplicationQueriesSchemes, which would silently drop
  // valid affiliate URLs that would otherwise open in Safari.
  try {
    await Linking.openURL(urlToOpen);
  } catch (e) {
    console.warn('[ProductTapHandler] Linking.openURL failed:', e?.message || e);
  }
}

/**
 * Track a confirmed purchase.
 * Call this if a returning deep link confirms a completed transaction.
 *
 * @param {string} productId
 * @param {number} revenue - commission-eligible sale amount
 */
export function trackConfirmedPurchase(productId, revenue) {
  trackEvent('purchase', { product_id: productId, revenue });
}
