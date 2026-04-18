import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const OrderHistoryContext = createContext();
const STORAGE_KEY = '@snapspace_order_history';


export function OrderHistoryProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  // Reset on sign-out / account switch. Ignore the initial bootstrap
  // transition (undefined → first user.id) so a cold-boot doesn't wipe
  // a valid persisted history.
  const lastUserIdRef = useRef(undefined);
  useEffect(() => {
    if (authLoading) return;
    const currentId = user?.id || null;
    const previousId = lastUserIdRef.current;
    if (previousId === currentId) return;
    lastUserIdRef.current = currentId;
    if (previousId === undefined) return;
    setOrders([]);
  }, [user?.id, authLoading]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((data) => {
        if (data) {
          setOrders(JSON.parse(data));
        } else {
          setOrders([]);
        }
      })
      .catch(() => {
        setOrders([]);
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(orders)).catch(() => {});
  }, [orders, hydrated]);

  const addOrder = ({ items, subtotal, shipping, total }) => {
    const newOrder = {
      id: `ORD-${Math.floor(100000 + Math.random() * 900000)}`,
      date: new Date().toISOString(),
      status: 'Confirmed',
      items: items.map((item) => ({ ...item })),
      subtotal,
      shipping,
      total,
    };
    setOrders((prev) => [newOrder, ...prev]);
  };

  return (
    <OrderHistoryContext.Provider value={{ orders, addOrder }}>
      {children}
    </OrderHistoryContext.Provider>
  );
}

export function useOrderHistory() {
  const ctx = useContext(OrderHistoryContext);
  if (!ctx) throw new Error('useOrderHistory must be used within an OrderHistoryProvider');
  return ctx;
}
