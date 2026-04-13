import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { toggleLike as toggleLikeRPC, getUserLikedIds } from '../services/supabase';

const LikedContext = createContext(null);
const STORAGE_KEY = '@snapspace_liked';
const STORAGE_KEY_PRODUCTS = '@snapspace_liked_products';

export function LikedProvider({ children }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState({});
  const [hydrated, setHydrated] = useState(false);
  const [likedProducts, setLikedProducts] = useState({});
  const [productsHydrated, setProductsHydrated] = useState(false);

  // Hydrate liked products from AsyncStorage (no Supabase — product IDs are not UUIDs)
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_PRODUCTS)
      .then(data => { if (data) { try { setLikedProducts(JSON.parse(data)); } catch {} } })
      .catch(() => {})
      .finally(() => setProductsHydrated(true));
  }, []);

  // Persist liked products
  useEffect(() => {
    if (!productsHydrated) return;
    AsyncStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(likedProducts)).catch(() => {});
  }, [likedProducts, productsHydrated]);

  // Toggle a product like — stores full product object for display in Liked tab
  const toggleLikedProduct = useCallback((product) => {
    if (!product?.id) return;
    setLikedProducts(prev => {
      const next = { ...prev };
      if (next[product.id]) {
        delete next[product.id];
      } else {
        next[product.id] = product;
      }
      return next;
    });
  }, []);

  // Hydrate: if logged in, fetch from Supabase; otherwise fall back to AsyncStorage
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        if (user?.id) {
          // Fetch server-side likes for this user
          const ids = await getUserLikedIds(user.id);
          if (!cancelled) {
            const map = {};
            ids.forEach(id => { map[id] = true; });
            setLiked(map);
            // Also cache locally for faster next load
            AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map)).catch(() => {});
          }
        } else {
          // Not logged in — use local cache
          const data = await AsyncStorage.getItem(STORAGE_KEY);
          if (!cancelled && data) {
            try { setLiked(JSON.parse(data)); } catch {}
          }
        }
      } catch {
        // Server fetch failed — fall back to local cache
        try {
          const data = await AsyncStorage.getItem(STORAGE_KEY);
          if (!cancelled && data) setLiked(JSON.parse(data));
        } catch {}
      } finally {
        if (!cancelled) setHydrated(true);
      }
    };

    hydrate();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Persist to AsyncStorage whenever liked changes (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(liked)).catch(() => {});
  }, [liked, hydrated]);

  // Toggle like — optimistic UI + server sync
  const toggleLiked = useCallback(async (designId) => {
    // Strip "user-" prefix if present (Explore feed adds this)
    const rawId = typeof designId === 'string' && designId.startsWith('user-')
      ? designId.replace('user-', '')
      : designId;

    // Optimistic update
    const wasLiked = !!liked[rawId];
    setLiked(prev => {
      const next = { ...prev };
      if (wasLiked) {
        delete next[rawId];
      } else {
        next[rawId] = true;
      }
      return next;
    });

    // Sync with server if logged in
    if (user?.id) {
      try {
        const result = await toggleLikeRPC(user.id, rawId);
        // result = { liked: boolean, count: number }
        // Server is authoritative — reconcile if needed
        if (result.liked !== !wasLiked) {
          setLiked(prev => {
            const next = { ...prev };
            if (result.liked) {
              next[rawId] = true;
            } else {
              delete next[rawId];
            }
            return next;
          });
        }
        return result;
      } catch (err) {
        // Server failed — revert optimistic update
        console.warn('[Likes] Server toggle failed, reverting:', err.message);
        setLiked(prev => {
          const next = { ...prev };
          if (wasLiked) {
            next[rawId] = true;
          } else {
            delete next[rawId];
          }
          return next;
        });
        return null;
      }
    }
    return null;
  }, [liked, user?.id]);

  // Helper: check if a design is liked (handles "user-" prefix)
  const isLiked = useCallback((designId) => {
    const rawId = typeof designId === 'string' && designId.startsWith('user-')
      ? designId.replace('user-', '')
      : designId;
    return !!liked[rawId];
  }, [liked]);

  return (
    <LikedContext.Provider value={{ liked, toggleLiked, isLiked, likedProducts, toggleLikedProduct }}>
      {children}
    </LikedContext.Provider>
  );
}

export function useLiked() {
  const ctx = useContext(LikedContext);
  if (!ctx) throw new Error('useLiked must be used within LikedProvider');
  return ctx;
}
