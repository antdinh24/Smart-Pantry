import React, { createContext, useContext, useState, useCallback, ReactNode, useMemo } from 'react';
import { PantryItem, PantryStats } from '../types';
import { mockPantryItems } from '../services/mockDataService';
import { getExpiringItems, getCategories, filterByCategory, searchItems, isUrgent } from '../utils/calculations';

interface PantryContextType {
  items: PantryItem[];
  stats: PantryStats;
  categories: string[];
  addItem: (item: Omit<PantryItem, 'id'>) => void;
  updateItem: (id: number, updates: Partial<PantryItem>) => void;
  deleteItem: (id: number) => void;
  getItemById: (id: number) => PantryItem | undefined;
  getFilteredItems: (category?: string, searchQuery?: string) => PantryItem[];
}

const PantryContext = createContext<PantryContextType | undefined>(undefined);

export function PantryProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PantryItem[]>(mockPantryItems);

  // Update urgent status based on expiry
  const itemsWithUrgent = useMemo(() => {
    return items.map(item => ({
      ...item,
      urgent: isUrgent(item),
    }));
  }, [items]);

  const expiringItems = useMemo(() => getExpiringItems(itemsWithUrgent, 3), [itemsWithUrgent]);

  const stats: PantryStats = useMemo(() => ({
    totalItems: itemsWithUrgent.length,
    categoriesCount: getCategories(itemsWithUrgent).length,
    expiringSoonCount: expiringItems.length,
    expiringItems,
  }), [itemsWithUrgent, expiringItems]);

  const categories = useMemo(() => getCategories(itemsWithUrgent), [itemsWithUrgent]);

  const addItem = useCallback((item: Omit<PantryItem, 'id'>) => {
    setItems(prev => {
      const newId = Math.max(...prev.map(i => i.id), 0) + 1;
      const newItem: PantryItem = { ...item, id: newId, urgent: false }; // urgent will be recalculated in useMemo
      return [...prev, newItem];
    });
  }, []);

  const updateItem = useCallback((id: number, updates: Partial<PantryItem>) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, ...updates };
        // urgent will be recalculated in useMemo based on expiry
        return updated;
      }
      return item;
    }));
  }, []);

  const deleteItem = useCallback((id: number) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const getItemById = useCallback((id: number) => {
    return itemsWithUrgent.find(item => item.id === id);
  }, [itemsWithUrgent]);

  const getFilteredItems = useCallback((category?: string, searchQuery?: string) => {
    let filtered = itemsWithUrgent;
    
    if (category) {
      filtered = filterByCategory(filtered, category);
    }
    
    if (searchQuery) {
      filtered = searchItems(filtered, searchQuery);
    }
    
    return filtered;
  }, [itemsWithUrgent]);

  const value: PantryContextType = {
    items: itemsWithUrgent,
    stats,
    categories,
    addItem,
    updateItem,
    deleteItem,
    getItemById,
    getFilteredItems,
  };

  return <PantryContext.Provider value={value}>{children}</PantryContext.Provider>;
}

export function usePantry() {
  const context = useContext(PantryContext);
  if (context === undefined) {
    throw new Error('usePantry must be used within a PantryProvider');
  }
  return context;
}

