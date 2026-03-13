import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LikedContext = createContext(null);
const STORAGE_KEY = '@snapspace_liked';

export function LikedProvider({ children }) {
  const [liked, setLiked] = useState({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((data) => {
        if (data) setLiked(JSON.parse(data));
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(liked)).catch(() => {});
  }, [liked, hydrated]);

  const toggleLiked = (id) => {
    setLiked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <LikedContext.Provider value={{ liked, toggleLiked }}>
      {children}
    </LikedContext.Provider>
  );
}

export function useLiked() {
  const ctx = useContext(LikedContext);
  if (!ctx) throw new Error('useLiked must be used within LikedProvider');
  return ctx;
}
