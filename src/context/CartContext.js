import React, { createContext, useContext, useState, useMemo, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Build 147 (C1): lazy facade. CartContext mounts at app boot via
// CartProvider; importing PRODUCT_CATALOG here used to wake the 2.87 MB
// data module on cold start. getCatalog() defers that load until the
// rehydration callback actually runs (already async via AsyncStorage),
// keeping it off the first-paint critical path entirely.
import { getCatalog } from '../data/productCatalog';
import { useAuth } from './AuthContext';
import { hapticMedium } from '../utils/haptics';
// Build 143 — analytics instrumentation. Safe no-op when PostHog isn't
// registered (dev build with no API key).
import { trackEvent, EVENTS } from '../services/analytics';

const CartContext = createContext();
const STORAGE_KEY = '@snapspace_cart';

function parsePrice(priceStr) {
  if (typeof priceStr === 'number' && isFinite(priceStr)) return priceStr;
  if (priceStr == null) return 0;
  // Coerce anything else (object, boolean, etc.) to string before .replace
  // so a malformed catalog entry can never crash the cart. Prior to this
  // guard, a product with price:{amount:X} would throw "replace is not a
  // function" from inside addToCart on tap.
  const str = typeof priceStr === 'string' ? priceStr : String(priceStr);
  const cleaned = str.replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

export function CartProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  // Detect sign-out / account switch and wipe the in-memory cart immediately.
  // Ref starts as `undefined` so we can distinguish "first real observation
  // after auth bootstrap" (do nothing — let hydrated data stay) from a
  // genuine sign-out or user switch (wipe items).
  const lastUserIdRef = useRef(undefined);
  useEffect(() => {
    if (authLoading) return;        // auth still bootstrapping — ignore
    const currentId = user?.id || null;
    const previousId = lastUserIdRef.current;
    if (previousId === currentId) return;
    lastUserIdRef.current = currentId;
    if (previousId === undefined) return;  // first real read — don't wipe
    setItems([]);                   // sign-out or account switch — start fresh
  }, [user?.id, authLoading]);

  // Load persisted cart on mount — enrich missing imageUrl/affiliateUrl from catalog
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((data) => {
        if (data) {
          const loaded = JSON.parse(data);
          // Build 147 (C1): resolve catalog INSIDE the rehydration callback
          // so the heavy data module isn't touched if the user has no
          // cart to rehydrate. Also defers off the first-paint window.
          const catalog = getCatalog();
          const enriched = loaded.map((item) => {
            // Always try to enrich — an item may have imageUrl but be missing asin/affiliateUrl
            if (item.imageUrl && item.asin && item.affiliateUrl && item.source) return item;
            const match = catalog.find(
              (p) => p.name === item.name && p.brand === item.brand
            );
            if (!match) return item;
            return {
              ...item,
              imageUrl:     item.imageUrl     || match.imageUrl     || null,
              affiliateUrl: item.affiliateUrl || match.affiliateUrl || null,
              // Build 107 fix: default to 'amazon' rather than null. The
              // catalog is now Amazon-only and the cart's checkout flow
              // requires `source === 'amazon'` to engage the multi-cart
              // URL builder. Items with `source: null` (legacy carts from
              // old builds, or AI-matched products where source dropped
              // through the matcher) were silently failing checkout.
              source:       item.source       || match.source       || 'amazon',
              asin:         item.asin         || match.asin         || null,
            };
          });
          setItems(enriched);
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  // Persist cart whenever items change (skip initial empty state before hydration).
  //
  // Build 147 (H11): debounce the write 300 ms. Every quantity bump,
  // add/remove, and rehydration write used to JSON.stringify + hit
  // AsyncStorage immediately — during a browse session with rapid
  // cart edits this thrashes disk for no benefit. The debounce
  // coalesces bursts.
  //
  // Safety: we hold the latest items in a ref AND flush immediately on
  // background/inactive AppState transitions. iOS may suspend the JS
  // thread shortly after backgrounding, so a pending debounced timer
  // is not guaranteed to fire — without the AppState flush, a user who
  // adds an item and immediately home-buttons could lose the edit.
  const cartWriteTimerRef = useRef(null);
  const pendingItemsRef = useRef(items);
  useEffect(() => { pendingItemsRef.current = items; }, [items]);

  const flushCartWrite = () => {
    if (cartWriteTimerRef.current) {
      clearTimeout(cartWriteTimerRef.current);
      cartWriteTimerRef.current = null;
    }
    // Direct sync-attempt write of the latest known state. AsyncStorage is
    // still async, but we kick the promise BEFORE JS yields to the
    // background suspension.
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pendingItemsRef.current)).catch(() => {});
  };

  useEffect(() => {
    if (!hydrated) return;
    if (cartWriteTimerRef.current) clearTimeout(cartWriteTimerRef.current);
    cartWriteTimerRef.current = setTimeout(() => {
      cartWriteTimerRef.current = null;
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
    }, 300);
    return () => {
      if (cartWriteTimerRef.current) {
        clearTimeout(cartWriteTimerRef.current);
        cartWriteTimerRef.current = null;
      }
    };
  }, [items, hydrated]);

  // Force-flush on background — see comment above.
  useEffect(() => {
    if (!hydrated) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        flushCartWrite();
      }
    });
    return () => sub.remove();
  }, [hydrated]);

  const addToCart = (product) => {
    // Guard against stale/missing product. Callers (e.g. ProductVisualizeModal)
    // may fire onAddToCart after the parent has cleared its visualizeResult
    // state, which can leave `product` undefined on the next tap. Silently
    // no-op rather than crash — the modal already guards its press handler,
    // so reaching here with no product means a programmer error downstream.
    if (!product || !product.name) return;
    // Build 108: medium-impact haptic on every add-to-cart. This is one of
    // the highest-value tactile moments in the app — users who feel the
    // confirmation "thump" trust the action landed without watching the
    // cart badge. Wired at the context level so every caller benefits.
    hapticMedium();
    // Build 143 — fire BEFORE setItems so a render-time error inside the
    // updater can't suppress the analytics event. cart_add captures even
    // if the product was already in the cart (we still treat the tap as
    // an "intent to buy" signal — quantity bump is implicit in our funnel).
    trackEvent(EVENTS.CART_ADD, {
      product_name: product.name,
      brand: product.brand || null,
      price: parsePrice(product.price),
      source: product.source || 'amazon',
      asin: product.asin || null,
      variant: product._matchedVariant?.label || null,
    });
    setItems((prev) => {
      // Build 131 — variant-aware cart key. When the matcher picked a
      // specific variant for this product (e.g. "Sage Green" of a chair
      // available in 6 colors), the variant id/label is suffixed onto the
      // key so adding two different variants of the same product creates
      // two cart entries instead of merging into one. Backward-compatible:
      // products without _matchedVariant get the legacy `name__brand` key,
      // matching every cart entry from prior builds.
      const variantTag = product._matchedVariant
        ? (product._matchedVariant.id || product._matchedVariant.label || '')
            .toString()
            .toLowerCase()
            .replace(/\s+/g, '-')
        : null;
      const key = variantTag
        ? `${product.name}__${product.brand}__${variantTag}`
        : `${product.name}__${product.brand}`;
      const existing = prev.find((item) => item.key === key);
      if (existing) {
        return prev.map((item) =>
          item.key === key ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          key,
          name: product.name,
          brand: product.brand,
          price: parsePrice(product.price),
          priceDisplay: typeof product.price === 'string' ? product.price : `$${product.price}`,
          imageUrl: product.imageUrl || null,
          affiliateUrl: product.affiliateUrl || null,
          // Build 107 fix: default to 'amazon'. Catalog is Amazon-only;
          // missing source means the upstream call site forgot to
          // forward it, not that the item is from another vendor. This
          // closes the bug where some products in the cart silently
          // failed the "Buy on Amazon" checkout filter.
          source: product.source || 'amazon',
          asin: product.asin || null,
          rating: product.rating || null,
          reviewCount: product.reviewCount || null,
          // Build 131 — preserve variant info on cart items so the
          // checkout/PDP flow can show the right color and the user
          // doesn't have to re-pick a variant they already chose.
          variantLabel: product._matchedVariant?.label || null,
          variantId:    product._matchedVariant?.id || null,
          quantity: 1,
        },
      ];
    });
  };

  const removeFromCart = (key) => {
    // Build 143 — find the item BEFORE filtering so we can capture its
    // name/brand/price in the event payload. If the key isn't in the cart
    // (defensive), we still no-op silently — no event, no setState churn.
    const item = items.find((i) => i.key === key);
    if (!item) return;
    trackEvent(EVENTS.CART_REMOVE, {
      product_name: item.name,
      brand: item.brand || null,
      price: item.price,
      source: item.source || 'amazon',
      asin: item.asin || null,
    });
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  const updateQuantity = (key, delta) => {
    setItems((prev) =>
      prev.map((item) =>
        item.key === key
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item
      )
    );
  };

  const clearCart = () => setItems([]);

  const cartCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items]
  );

  return (
    <CartContext.Provider
      value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, cartCount, subtotal }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
