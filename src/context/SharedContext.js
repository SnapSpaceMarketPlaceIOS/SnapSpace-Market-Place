import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SharedContext = createContext(null);
const STORAGE_KEY = '@snapspace_shared';

export function SharedProvider({ children }) {
  const [shared, setShared] = useState({});
  const [hydrated, setHydrated] = useState(false);

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
