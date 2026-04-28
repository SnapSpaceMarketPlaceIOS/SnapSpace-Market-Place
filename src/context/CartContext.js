import React, { createContext, useContext, useState, useMemo, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PRODUCT_CATALOG } from '../data/productCatalog';
import { useAuth } from './AuthContext';
import { hapticMedium } from '../utils/haptics';

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
          const enriched = loaded.map((item) => {
            // Always try to enrich — an item may have imageUrl but be missing asin/affiliateUrl
            if (item.imageUrl && item.asin && item.affiliateUrl && item.source) return item;
            const match = PRODUCT_CATALOG.find(
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

  // Persist cart whenever items change (skip initial empty state before hydration)
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items, hydrated]);

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
    setItems((prev) => {
      const key = `${product.name}__${product.brand}`;
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
          quantity: 1,
        },
      ];
    });
  };

  const removeFromCart = (key) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
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
