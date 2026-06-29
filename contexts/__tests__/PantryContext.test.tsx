/**
 * contexts/__tests__/PantryContext.test.tsx
 *
 * Tests for PantryProvider and the usePantry() hook.
 *
 * STRATEGY:
 *   Render the hook inside its provider using renderHook(callback, { wrapper }).
 *   Mock APIService to control what the backend returns for each test.
 *   Wait for the initial useEffect fetch to complete with waitFor() before asserting.
 *   Wrap mutations (addItem, updateItem, deleteItem) in act() so React flushes
 *   all state updates before we assert.
 *
 * WHY CONTEXT TESTS MATTER:
 *   Screen tests mock usePantry() entirely. If PantryContext has a bug (e.g.
 *   updating state even when the API rejects), no screen test would catch it.
 *   These tests are the only thing that verifies the context's own logic.
 *
 * WHAT IS TESTED:
 *   - Initial data fetch on mount — success, loading state, and error
 *   - isUrgent flag computed locally from expiration_date (not from API response)
 *   - stats derivation: totalItems, expiringSoonCount, categoriesCount
 *   - categories list: unique and correct
 *   - addItem / updateItem / deleteItem — API call + state update (and no-op on failure)
 *   - refreshItems re-fetches and replaces state
 *   - getItemById — hit and miss
 *   - getFilteredItems — no filter, category, search query, both combined
 *   - usePantry() outside provider throws a helpful error
 */

import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { PantryProvider, usePantry } from '../PantryContext'
import { APIService } from '../../services/api'

// ── Mock APIService ─────────────────────────────────────────────────────────────
//
// PantryContext imports { APIService } (named export) from services/api.
// We only mock the four methods PantryContext actually calls.

jest.mock('../../services/api', () => ({
  APIService: {
    getPantryItems: jest.fn(),
    addPantryItem: jest.fn(),
    updatePantryItem: jest.fn(),
    deletePantryItem: jest.fn(),
  },
}))

const mockGetPantryItems = APIService.getPantryItems as jest.Mock
const mockAddPantryItem = APIService.addPantryItem as jest.Mock
const mockUpdatePantryItem = APIService.updatePantryItem as jest.Mock
const mockDeletePantryItem = APIService.deletePantryItem as jest.Mock

// ── Fixtures ────────────────────────────────────────────────────────────────────

// Build an expiry date 1 day from now so ITEM_URGENT is always within 3 days
const tomorrow = new Date()
tomorrow.setDate(tomorrow.getDate() + 1)
const EXPIRY_TOMORROW = tomorrow.toISOString().split('T')[0]

/** Standard item: far-future expiry → NOT urgent */
const ITEM_FRESH = {
  id: 'item-1',
  ingredient_name: 'Eggs',
  quantity: 12,
  unit: 'count',
  category: 'dairy',
  expiration_date: '2099-12-31',
  added_date: '2025-01-01',
  user_id: 'user-1',
  is_synced: true,
  barcode: null,
  normalized_name: 'eggs',
}

/** Item expiring tomorrow → urgent === true */
const ITEM_URGENT = {
  id: 'item-2',
  ingredient_name: 'Milk',
  quantity: 1,
  unit: 'L',
  category: 'dairy',
  expiration_date: EXPIRY_TOMORROW,
  added_date: '2025-01-01',
  user_id: 'user-1',
  is_synced: true,
  barcode: null,
  normalized_name: 'milk',
}

/** Item in a different category so tests can verify category filtering */
const ITEM_VEGETABLE = {
  id: 'item-3',
  ingredient_name: 'Carrot',
  quantity: 3,
  unit: 'count',
  category: 'vegetables',
  expiration_date: '2099-12-31',
  added_date: '2025-01-01',
  user_id: 'user-1',
  is_synced: true,
  barcode: null,
  normalized_name: 'carrot',
}

// ── Provider wrapper ─────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PantryProvider>{children}</PantryProvider>
)

// ── Shared setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  // Default: empty pantry, all mutations succeed
  mockGetPantryItems.mockResolvedValue([])
  mockAddPantryItem.mockResolvedValue({ ...ITEM_FRESH, id: 'server-id' })
  mockUpdatePantryItem.mockResolvedValue({ ...ITEM_FRESH, quantity: 99 })
  mockDeletePantryItem.mockResolvedValue(undefined)
})

// =============================================================================
// Initial fetch
// =============================================================================

describe('PantryContext — initial fetch', () => {
  it('calls getPantryItems once on mount', async () => {
    await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(mockGetPantryItems).toHaveBeenCalledTimes(1))
  })

  it('starts with loading = true and ends with loading = false', async () => {
    // Use a deferred promise so we can observe the in-flight state
    let resolveItems!: (items: any[]) => void
    mockGetPantryItems.mockReturnValue(
      new Promise<any[]>(res => { resolveItems = res })
    )

    const { result } = await renderHook(() => usePantry(), { wrapper })
    expect(result.current.loading).toBe(true)

    await act(async () => { resolveItems([]) })
    expect(result.current.loading).toBe(false)
  })

  it('populates items from the API response', async () => {
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH])
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].ingredient_name).toBe('Eggs')
  })

  it('sets an error message and leaves items empty when API rejects', async () => {
    mockGetPantryItems.mockRejectedValue(new Error('Network error'))
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Network error')
    expect(result.current.items).toHaveLength(0)
  })

  it('sets loading = false even when the fetch fails', async () => {
    mockGetPantryItems.mockRejectedValue(new Error('fail'))
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
  })
})

// =============================================================================
// urgent flag (computed locally, not from API)
// =============================================================================

describe('PantryContext — urgent flag', () => {
  it('marks items expiring within 3 days as urgent: true', async () => {
    mockGetPantryItems.mockResolvedValue([ITEM_URGENT])
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items[0].urgent).toBe(true)
  })

  it('marks items with a far-future expiry as urgent: false', async () => {
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH])
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items[0].urgent).toBe(false)
  })
})

// =============================================================================
// stats derivation
// =============================================================================

describe('PantryContext — stats', () => {
  it('totalItems equals the item count returned by the API', async () => {
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH, ITEM_VEGETABLE])
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.stats.totalItems).toBe(2)
  })

  it('expiringSoonCount counts items expiring within 3 days', async () => {
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH, ITEM_URGENT])
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.stats.expiringSoonCount).toBe(1)
  })

  it('expiringSoonCount is 0 when no items are near expiry', async () => {
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH])
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.stats.expiringSoonCount).toBe(0)
  })

  it('categoriesCount counts distinct categories', async () => {
    // ITEM_FRESH and ITEM_URGENT are both "dairy"; ITEM_VEGETABLE is "vegetables" → 2 distinct
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH, ITEM_URGENT, ITEM_VEGETABLE])
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.stats.categoriesCount).toBe(2)
  })

  it('expiringItems contains only the items that expire soon', async () => {
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH, ITEM_URGENT])
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.stats.expiringItems).toHaveLength(1)
    expect(result.current.stats.expiringItems[0].ingredient_name).toBe('Milk')
  })
})

// =============================================================================
// categories
// =============================================================================

describe('PantryContext — categories', () => {
  it('returns the unique set of categories present in the items', async () => {
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH, ITEM_URGENT, ITEM_VEGETABLE])
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.categories).toHaveLength(2)
    expect(result.current.categories).toContain('dairy')
    expect(result.current.categories).toContain('vegetables')
  })

  it('returns an empty array when there are no items', async () => {
    mockGetPantryItems.mockResolvedValue([])
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.categories).toEqual([])
  })
})

// =============================================================================
// addItem
// =============================================================================

describe('PantryContext — addItem', () => {
  it('calls addPantryItem with the provided item data', async () => {
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addItem({ ingredient_name: 'Eggs', quantity: 12 })
    })

    expect(mockAddPantryItem).toHaveBeenCalledWith(
      expect.objectContaining({ ingredient_name: 'Eggs', quantity: 12 })
    )
  })

  it('appends the backend-returned item (with server-assigned id) to local state', async () => {
    const serverItem = { ...ITEM_FRESH, id: 'server-assigned-id' }
    mockAddPantryItem.mockResolvedValue(serverItem)

    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addItem({ ingredient_name: 'Eggs', quantity: 12 })
    })

    expect(result.current.items.find(i => i.id === 'server-assigned-id')).toBeDefined()
  })

  it('does NOT update local state when addPantryItem throws', async () => {
    mockAddPantryItem.mockRejectedValue(new Error('API error'))

    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let caughtError: Error | undefined
    await act(async () => {
      try {
        await result.current.addItem({ ingredient_name: 'Eggs', quantity: 1 })
      } catch (e: any) {
        caughtError = e
      }
    })

    expect(caughtError?.message).toBe('API error')
    expect(result.current.items).toHaveLength(0)
  })
})

// =============================================================================
// updateItem
// =============================================================================

describe('PantryContext — updateItem', () => {
  it('calls updatePantryItem with the correct id and updates payload', async () => {
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH])
    mockUpdatePantryItem.mockResolvedValue({ ...ITEM_FRESH, quantity: 99 })

    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateItem('item-1', { quantity: 99 })
    })

    expect(mockUpdatePantryItem).toHaveBeenCalledWith('item-1', { quantity: 99 })
  })

  it('replaces the item in local state with the backend response', async () => {
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH])
    mockUpdatePantryItem.mockResolvedValue({ ...ITEM_FRESH, quantity: 99 })

    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateItem('item-1', { quantity: 99 })
    })

    expect(result.current.items[0].quantity).toBe(99)
  })

  it('does NOT update local state when updatePantryItem throws', async () => {
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH])
    mockUpdatePantryItem.mockRejectedValue(new Error('API error'))

    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      try {
        await result.current.updateItem('item-1', { quantity: 99 })
      } catch {
        // expected
      }
    })

    // Original quantity must still be 12
    expect(result.current.items[0].quantity).toBe(12)
  })
})

// =============================================================================
// deleteItem
// =============================================================================

describe('PantryContext — deleteItem', () => {
  it('calls deletePantryItem with the correct id', async () => {
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH])

    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteItem('item-1')
    })

    expect(mockDeletePantryItem).toHaveBeenCalledWith('item-1')
  })

  it('removes the item from local state after API confirms deletion', async () => {
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH])

    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteItem('item-1')
    })

    expect(result.current.items).toHaveLength(0)
  })

  it('does NOT remove the item from local state when deletePantryItem throws', async () => {
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH])
    mockDeletePantryItem.mockRejectedValue(new Error('API error'))

    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      try {
        await result.current.deleteItem('item-1')
      } catch {
        // expected — item must remain in state
      }
    })

    expect(result.current.items).toHaveLength(1)
  })
})

// =============================================================================
// refreshItems
// =============================================================================

describe('PantryContext — refreshItems', () => {
  it('re-fetches from the API and replaces local state with the new data', async () => {
    mockGetPantryItems
      .mockResolvedValueOnce([ITEM_FRESH])      // initial mount
      .mockResolvedValueOnce([ITEM_VEGETABLE])  // after refresh

    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items[0].ingredient_name).toBe('Eggs')

    await act(async () => {
      await result.current.refreshItems()
    })

    expect(result.current.items[0].ingredient_name).toBe('Carrot')
    expect(mockGetPantryItems).toHaveBeenCalledTimes(2)
  })
})

// =============================================================================
// getItemById
// =============================================================================

describe('PantryContext — getItemById', () => {
  it('returns the correct item when the id exists', async () => {
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH, ITEM_VEGETABLE])
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.getItemById('item-3')?.ingredient_name).toBe('Carrot')
  })

  it('returns undefined for an id that does not exist', async () => {
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH])
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.getItemById('nonexistent')).toBeUndefined()
  })
})

// =============================================================================
// getFilteredItems
// =============================================================================

describe('PantryContext — getFilteredItems', () => {
  beforeEach(() => {
    mockGetPantryItems.mockResolvedValue([ITEM_FRESH, ITEM_URGENT, ITEM_VEGETABLE])
  })

  it('returns all items when no filters are provided', async () => {
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.getFilteredItems()).toHaveLength(3)
  })

  it('filters by category', async () => {
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const dairy = result.current.getFilteredItems('dairy')
    expect(dairy).toHaveLength(2)
    expect(dairy.every(i => i.category === 'dairy')).toBe(true)
  })

  it('filters by search query (ingredient_name match)', async () => {
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const results = result.current.getFilteredItems(undefined, 'carrot')
    expect(results).toHaveLength(1)
    expect(results[0].ingredient_name).toBe('Carrot')
  })

  it('applies both category and search query together', async () => {
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    // category = dairy + search = "milk" → only Milk
    const results = result.current.getFilteredItems('dairy', 'milk')
    expect(results).toHaveLength(1)
    expect(results[0].ingredient_name).toBe('Milk')
  })

  it('returns an empty array when no items match the category', async () => {
    const { result } = await renderHook(() => usePantry(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.getFilteredItems('nonexistent-category')).toHaveLength(0)
  })
})

// =============================================================================
// usePantry guard
// =============================================================================

describe('usePantry guard', () => {
  it('throws a descriptive error when called outside PantryProvider', async () => {
    // renderHook rejects its promise when the hook throws during render.
    // Use .rejects.toThrow() rather than expecting a synchronous throw.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await expect(renderHook(() => usePantry())).rejects.toThrow(
      'usePantry must be used within a PantryProvider'
    )

    spy.mockRestore()
  })
})
