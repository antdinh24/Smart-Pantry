import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { GroceryItem, GroceryStats } from '../types';
import { mockGroceryItems, MOCK_MONTHLY_AVERAGE } from '../services/mockDataService';
import { calculateGroceryTotal } from '../utils/calculations';

interface GroceryContextType {
  items: GroceryItem[];
  stats: GroceryStats;
  addItem: (item: Omit<GroceryItem, 'id'>) => void;
  updateItem: (id: number, updates: Partial<GroceryItem>) => void;
  deleteItem: (id: number) => void;
  toggleItem: (id: number) => void;
  clearCompleted: () => void;
  getItemById: (id: number) => GroceryItem | undefined;
}

const GroceryContext = createContext<GroceryContextType | undefined>(undefined);

export function GroceryProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<GroceryItem[]>(mockGroceryItems);

  const checkedCount = items.filter(item => item.checked).length;
  const remainingCount = items.length - checkedCount;
  const totalPrice = calculateGroceryTotal(items);

  const stats: GroceryStats = {
    totalPrice,
    checkedCount,
    remainingCount,
    monthlyAverage: MOCK_MONTHLY_AVERAGE,
  };

  const addItem = useCallback((item: Omit<GroceryItem, 'id'>) => {
    const newId = Math.max(...items.map(i => i.id), 0) + 1;
    const newItem: GroceryItem = { ...item, id: newId };
    setItems(prev => [...prev, newItem]);
  }, [items]);

  const updateItem = useCallback((id: number, updates: Partial<GroceryItem>) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const deleteItem = useCallback((id: number) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const toggleItem = useCallback((id: number) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, checked: !item.checked } : item
    ));
  }, []);

  const clearCompleted = useCallback(() => {
    setItems(prev => prev.filter(item => !item.checked));
  }, []);

  const getItemById = useCallback((id: number) => {
    return items.find(item => item.id === id);
  }, [items]);

  const value: GroceryContextType = {
    items,
    stats,
    addItem,
    updateItem,
    deleteItem,
    toggleItem,
    clearCompleted,
    getItemById,
  };

  return <GroceryContext.Provider value={value}>{children}</GroceryContext.Provider>;
}

export function useGrocery() {
  const context = useContext(GroceryContext);
  if (context === undefined) {
    throw new Error('useGrocery must be used within a GroceryProvider');
  }
  return context;
}

