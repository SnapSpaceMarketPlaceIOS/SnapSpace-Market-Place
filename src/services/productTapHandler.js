import { Linking } from 'react-native';
import { trackEvent } from './trackingService';
import { getAffiliateUrl } from './affiliateProducts';

/**
 * ProductTapHandler — the function that pays SnapSpace.
 *
 * Called by EVERY "Shop Now" / "Buy on Amazon" button in the entire app:
 *   Home (Deal of the Day, New Arrivals, Picked For You)
 *   Snap result product cards
 *   Cart
 *   Explore / ShopTheLook
 *   ProductDetail
 *
 * ORDER IS MANDATORY:
 *   1. trackEvent() fires BEFORE the link opens
 *   2. Linking.openURL() opens the affiliate deep link
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

  // Step 2: Resolve the affiliate URL
  const url = getAffiliateUrl(product) ?? product.affiliateUrl ?? null;
  if (!url) return;

  // Step 3: Open the affiliate deep link
  const canOpen = await Linking.canOpenURL(url);
  if (canOpen) {
    await Linking.openURL(url);
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
