import React, { createContext, useContext, useState } from 'react';

const OrderHistoryContext = createContext();

const MOCK_ORDERS = [
  {
    id: 'ORD-847291',
    date: '2026-02-28T14:22:00.000Z',
    status: 'Delivered',
    items: [
      { key: 'sofa__arhaus', name: 'Cloud Modular Sofa', brand: 'Arhaus', price: 2899, quantity: 1 },
      { key: 'lamp__cb2', name: 'Arc Floor Lamp', brand: 'CB2', price: 349, quantity: 2 },
    ],
    subtotal: 3597,
    shipping: 29,
    total: 3626,
  },
  {
    id: 'ORD-623047',
    date: '2026-02-10T09:15:00.000Z',
    status: 'Delivered',
    items: [
      { key: 'rug__rh', name: 'Wool Area Rug', brand: 'Restoration Hardware', price: 899, quantity: 1 },
    ],
    subtotal: 899,
    shipping: 29,
    total: 928,
  },
];

export function OrderHistoryProvider({ children }) {
  const [orders, setOrders] = useState(MOCK_ORDERS);

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
