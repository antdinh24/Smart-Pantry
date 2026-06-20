/**
 * PantryContext.tsx
 *
 * PURPOSE:
 *   Manages the user's pantry items for the entire app. Any screen that needs
 *   to read or modify pantry data calls usePantry() instead of making API
 *   calls directly. This means the pantry list stays in sync everywhere.
 *
 * WHAT CHANGED FROM THE OLD VERSION:
 *   The old version used hardcoded mock data (mockPantryItems). This version
 *   fetches real data from the FastAPI backend on mount and persists changes
 *   via API calls.
 *
 * HOW DATA FLOWS:
 *   1. PantryProvider mounts → calls APIService.getPantryItems()
 *   2. Items are stored in React state (in-memory, fast to read)
 *   3. When user adds/edits/deletes:
 *        a. API call is made first (persists to backend/Supabase)
 *        b. On success, local state is updated (UI re-renders instantly)
 *        c. On failure, state is NOT updated (error is surfaced to the caller)
 *
 * URGENT FLAG:
 *   The `urgent` field doesn't come from the backend — it's computed here
 *   from `expiration_date` using isUrgent() from calculations.ts.
 *   Items expiring within 3 days are marked urgent.
 *
 * EXPOSED VIA usePantry():
 *   items          — full list with urgent flag computed
 *   stats          — totals, category count, expiring soon count
 *   categories     — unique categories for filter UI
 *   loading        — true while initial fetch is in progress
 *   error          — error message if initial fetch failed
 *   addItem        — POST /pantry
 *   updateItem     — PUT /pantry/:id
 *   deleteItem     — DELETE /pantry/:id
 *   refreshItems   — re-fetch from API (pull-to-refresh)
 *   getItemById    — find a single item by UUID
 *   getFilteredItems — filter + search helper
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
  useMemo,
} from 'react';
import { PantryItem, PantryStats } from '../types';
import { APIService } from '../services/api';
import {
  getExpiringItems,
  getCategories,
  filterByCategory,
  searchItems,
  isUrgent,
} from '../utils/calculations';

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT TYPE
// Describes everything usePantry() returns.
// ─────────────────────────────────────────────────────────────────────────────

interface PantryContextType {
  /** All pantry items with the computed `urgent` flag. Empty array while loading. */
  items: PantryItem[];
  /** Aggregate stats: total count, category count, expiring soon count */
  stats: PantryStats;
  /** Sorted unique list of category strings for the filter UI */
  categories: string[];
  /** True while the initial API fetch is in progress */
  loading: boolean;
  /** Error message if the initial fetch failed, null otherwise */
  error: string | null;

  /**
   * addItem — sends POST /pantry and adds the item to local state.
   * @param item - The item fields (no id — backend generates the UUID)
   * @throws Error if the API call fails
   */
  addItem: (item: {
    ingredient_name: string;
    quantity: number;
    unit?: string;
    category?: string;
    barcode?: string;
    expiration_date?: string;
  }) => Promise<void>;

  /**
   * updateItem — sends PUT /pantry/:id and updates local state.
   * @param id      - UUID of the item to update
   * @param updates - Partial fields to change
   * @throws Error if the API call fails
   */
  updateItem: (id: string, updates: Partial<PantryItem>) => Promise<void>;

  /**
   * deleteItem — sends DELETE /pantry/:id and removes from local state.
   * @param id - UUID of the item to delete
   * @throws Error if the API call fails
   */
  deleteItem: (id: string) => Promise<void>;

  /**
   * refreshItems — re-fetches all pantry items from the API.
   * Call this after pull-to-refresh or returning from another screen.
   */
  refreshItems: () => Promise<void>;

  /**
   * getItemById — finds an item in the local cache by UUID.
   * Returns undefined if not found.
   */
  getItemById: (id: string) => PantryItem | undefined;

  /**
   * getFilteredItems — applies optional category filter and text search.
   * Both parameters are optional; omitting them returns all items.
   */
  getFilteredItems: (category?: string, searchQuery?: string) => PantryItem[];
}

const PantryContext = createContext<PantryContextType | undefined>(undefined);

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

export function PantryProvider({ children }: { children: ReactNode }) {
  /**
   * Raw items from the API. The `urgent` field is not set here —
   * it's computed in the `itemsWithUrgent` memo below.
   */
  const [items, setItems] = useState<PantryItem[]>([]);

  /** True while the initial GET /pantry call is in progress */
  const [loading, setLoading] = useState(true);

  /** Error message from the initial fetch, or null */
  const [error, setError] = useState<string | null>(null);

  // ── Derived state (computed from raw items, no extra API calls) ───────────

  /**
   * itemsWithUrgent
   *
   * Adds the `urgent` boolean to every item based on expiration_date.
   * Re-computed whenever `items` changes.
   * Using useMemo means this only recalculates when items actually change —
   * not on every render.
   */
  const itemsWithUrgent = useMemo(() => {
    return items.map(item => ({
      ...item,
      urgent: isUrgent(item),
    }));
  }, [items]);

  /** Items expiring within 3 days — used for the stats badge and HomeScreen alert */
  const expiringItems = useMemo(
    () => getExpiringItems(itemsWithUrgent, 3),
    [itemsWithUrgent]
  );

  /** Aggregate numbers shown on PantryScreen and HomeScreen */
  const stats: PantryStats = useMemo(
    () => ({
      totalItems: itemsWithUrgent.length,
      categoriesCount: getCategories(itemsWithUrgent).length,
      expiringSoonCount: expiringItems.length,
      expiringItems,
    }),
    [itemsWithUrgent, expiringItems]
  );

  /** Sorted list of unique category names for the filter chip row */
  const categories = useMemo(
    () => getCategories(itemsWithUrgent),
    [itemsWithUrgent]
  );

  // ── Initial data load ─────────────────────────────────────────────────────

  useEffect(() => {
    fetchItems();
  }, []);

  /**
   * fetchItems
   *
   * Loads all pantry items from the backend.
   * Called once on mount and also exposed as refreshItems() for pull-to-refresh.
   *
   * WHY not just use the useEffect directly?
   *   We extract it as a named async function so we can also expose it as
   *   `refreshItems` without duplicating the logic.
   */
  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await APIService.getPantryItems();
      setItems(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load pantry items.');
      console.error('PantryContext: fetchItems failed', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * addItem
   *
   * Sends the new item to the backend, then appends the returned item
   * (which includes the backend-generated UUID) to local state.
   *
   * WHY append the backend response rather than building the item locally?
   *   The backend assigns the UUID and may set normalized_name and other
   *   derived fields. Using the backend's response keeps local state accurate.
   */
  const addItem = useCallback(async (item: {
    ingredient_name: string;
    quantity: number;
    unit?: string;
    category?: string;
    barcode?: string;
    expiration_date?: string;
  }) => {
    const newItem = await APIService.addPantryItem(item);
    // Append the backend-created item (with its UUID) to the local list
    setItems(prev => [...prev, newItem]);
  }, []);

  /**
   * updateItem
   *
   * Sends the updated fields to the backend, then replaces the item in
   * local state with the backend's response.
   *
   * @param id      - UUID of the item to update
   * @param updates - Only the fields that changed
   */
  const updateItem = useCallback(async (id: string, updates: Partial<PantryItem>) => {
    const updatedItem = await APIService.updatePantryItem(id, updates);
    // Replace the old item with the updated version from the backend
    setItems(prev => prev.map(item => item.id === id ? updatedItem : item));
  }, []);

  /**
   * deleteItem
   *
   * Sends DELETE to the backend, then removes the item from local state.
   *
   * WHY remove from local state AFTER the API call succeeds?
   *   If we removed it optimistically (before the API call) and the call failed,
   *   the item would disappear from the UI but still exist in the database —
   *   confusing for the user. Waiting for success keeps UI and database in sync.
   *
   * @param id - UUID of the item to delete
   */
  const deleteItem = useCallback(async (id: string) => {
    await APIService.deletePantryItem(id);
    // Only remove from local state after the backend confirmed deletion
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  // ── Read helpers ──────────────────────────────────────────────────────────

  /**
   * getItemById
   *
   * Finds a single item by UUID from the in-memory list.
   * Returns undefined if not found (caller should handle this case).
   */
  const getItemById = useCallback(
    (id: string) => itemsWithUrgent.find(item => item.id === id),
    [itemsWithUrgent]
  );

  /**
   * getFilteredItems
   *
   * Applies an optional category filter and/or text search to the full list.
   * Returns all items if neither argument is provided.
   *
   * @param category    - Filter to this category (e.g. "dairy"), or undefined for all
   * @param searchQuery - Text to search in ingredient_name, or undefined for all
   */
  const getFilteredItems = useCallback(
    (category?: string, searchQuery?: string) => {
      let filtered = itemsWithUrgent;
      if (category) filtered = filterByCategory(filtered, category);
      if (searchQuery) filtered = searchItems(filtered, searchQuery);
      return filtered;
    },
    [itemsWithUrgent]
  );

  // ── Context value ─────────────────────────────────────────────────────────

  const value: PantryContextType = {
    items: itemsWithUrgent,
    stats,
    categories,
    loading,
    error,
    addItem,
    updateItem,
    deleteItem,
    refreshItems: fetchItems,
    getItemById,
    getFilteredItems,
  };

  return <PantryContext.Provider value={value}>{children}</PantryContext.Provider>;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * usePantry
 *
 * Custom hook to access pantry data and actions from any screen.
 * Must be used inside a component that is a descendant of PantryProvider.
 *
 * Usage:
 *   const { items, loading, addItem, deleteItem } = usePantry()
 *
 * Throws an error if called outside PantryProvider — this is intentional so
 * developers get a clear error message instead of silent undefined bugs.
 */
export function usePantry(): PantryContextType {
  const context = useContext(PantryContext);
  if (context === undefined) {
    throw new Error('usePantry must be used within a PantryProvider');
  }
  return context;
}
