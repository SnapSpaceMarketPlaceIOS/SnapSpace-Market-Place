import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PRODUCT_CATALOG } from '../data/productCatalog';

const CartContext = createContext();
const STORAGE_KEY = '@snapspace_cart';

function parsePrice(priceStr) {
  if (typeof priceStr === 'number') return priceStr;
  const cleaned = priceStr.replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [hydrated, setHydrated] = useState(false);

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
              source:       item.source       || match.source       || null,
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
          source: product.source || null,
          asin: product.asin || null,
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
