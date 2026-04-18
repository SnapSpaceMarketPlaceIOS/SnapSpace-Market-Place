import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const SharedContext = createContext(null);
const STORAGE_KEY = '@snapspace_shared';

export function SharedProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [shared, setShared] = useState({});
  const [hydrated, setHydrated] = useState(false);

  // Reset on sign-out / account switch. Ignore the initial bootstrap
  // transition so a cold-boot doesn't wipe valid persisted flags.
  const lastUserIdRef = useRef(undefined);
  useEffect(() => {
    if (authLoading) return;
    const currentId = user?.id || null;
    const previousId = lastUserIdRef.current;
    if (previousId === currentId) return;
    lastUserIdRef.current = currentId;
    if (previousId === undefined) return;
    setShared({});
  }, [user?.id, authLoading]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((data) => {
        if (data) setShared(JSON.parse(data));
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(shared)).catch(() => {});
  }, [shared, hydrated]);

  const addShared = (id) => {
    setShared((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <SharedContext.Provider value={{ shared, addShared }}>
      {children}
    </SharedContext.Provider>
  );
}

export function useShared() {
  const ctx = useContext(SharedContext);
  if (!ctx) throw new Error('useShared must be used within SharedProvider');
  return ctx;
}
