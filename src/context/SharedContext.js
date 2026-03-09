import React, { createContext, useContext, useState } from 'react';

const SharedContext = createContext(null);

export function SharedProvider({ children }) {
  const [shared, setShared] = useState({});

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
