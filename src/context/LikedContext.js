import React, { createContext, useContext, useState } from 'react';

const LikedContext = createContext(null);

export function LikedProvider({ children }) {
  const [liked, setLiked] = useState({});

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
