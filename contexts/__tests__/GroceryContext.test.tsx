/**
 * contexts/__tests__/GroceryContext.test.tsx
 *
 * Tests for GroceryProvider and the useGrocery() hook.
 *
 * STRATEGY:
 *   GroceryContext has no async API calls — it initialises from mockGroceryItems
 *   (a module-level constant from services/mockDataService). We mock that module
 *   with a small, controlled fixture so test outcomes are deterministic regardless
 *   of what the real mock data looks like.
 *
 *   calculateGroceryTotal is NOT mocked — we let the real implementation run.
 *   It sums prices of UNCHECKED items only.
 *
 *   IMPORTANT: All state mutations MUST use `await act(async () => { ... })`.
 *   In React 19 / RNTL v14, act() always returns a Promise. Calling it without
 *   await means state updates are not committed before assertions run, causing
 *   both stale results and null result.current errors in subsequent tests.
 *
 * WHAT IS TESTED:
 *   - Initial items come from mockGroceryItems
 *   - addItem assigns ID = max(existing IDs) + 1
 *   - addItem when list is empty assigns ID = 1
 *   - toggleItem flips the checked flag
 *   - clearCompleted removes only checked items
 *   - deleteItem removes the correct item by ID
 *   - updateItem patches only the specified fields
 *   - getItemById returns the item or undefined for a missing ID
 *   - stats.totalPrice sums unchecked-item prices only
 *   - stats.checkedCount and remainingCount stay correct after mutations
 *   - stats.monthlyAverage equals MOCK_MONTHLY_AVERAGE from the mock module
 *   - useGrocery() called outside GroceryProvider throws a descriptive error
 */

import React, { ReactNode } from 'react'
import { renderHook, act } from '@testing-library/react-native'
import { GroceryProvider, useGrocery } from '../GroceryContext'

// ── Mock mockDataService ──────────────────────────────────────────────────────
//
// GroceryContext reads mockGroceryItems and MOCK_MONTHLY_AVERAGE at module
// initialisation time (used as useState initial value and inline const).
// The values are defined inline in the factory to avoid babel-jest hoisting
// issues (module-level const references are undefined when the factory runs).

jest.mock('../../services/mockDataService', () => ({
  mockGroceryItems: [
    { id: 1, name: 'Milk',  quantity: '1 gallon', price: 4.00, checked: false, category: 'Dairy'  },
    { id: 2, name: 'Bread', quantity: '1 loaf',   price: 3.00, checked: false, category: 'Bakery' },
    { id: 3, name: 'Eggs',  quantity: '1 dozen',  price: 5.00, checked: true,  category: 'Dairy'  },
  ],
  MOCK_MONTHLY_AVERAGE: 250.0,
  getMockMealSchedules: jest.fn().mockReturnValue([]),
}))

// Match the MOCK_MONTHLY_AVERAGE defined in the factory above
const TEST_MONTHLY_AVERAGE = 250.0

// ── Provider wrapper ──────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: ReactNode }) => (
  <GroceryProvider>{children}</GroceryProvider>
)

// ── Shared setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

// =============================================================================
// Initial state
// =============================================================================

describe('GroceryContext — initial state', () => {
  it('initialises items from mockGroceryItems', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })

    expect(result.current.items).toHaveLength(3)
    expect(result.current.items[0].name).toBe('Milk')
    expect(result.current.items[1].name).toBe('Bread')
    expect(result.current.items[2].name).toBe('Eggs')
  })

  it('computes totalPrice as the sum of UNCHECKED item prices', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })
    // Milk(4) + Bread(3) = 7.00; Eggs is checked → excluded by calculateGroceryTotal
    expect(result.current.stats.totalPrice).toBeCloseTo(7.00)
  })

  it('computes checkedCount correctly from initial data', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })
    expect(result.current.stats.checkedCount).toBe(1)  // only Eggs is checked
  })

  it('computes remainingCount = total - checkedCount', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })
    expect(result.current.stats.remainingCount).toBe(2)  // 3 total − 1 checked
  })

  it('sets monthlyAverage from MOCK_MONTHLY_AVERAGE', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })
    expect(result.current.stats.monthlyAverage).toBe(TEST_MONTHLY_AVERAGE)
  })
})

// =============================================================================
// addItem
// =============================================================================

describe('GroceryContext — addItem', () => {
  it('assigns ID = max(existing IDs) + 1', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })
    // Existing IDs are [1, 2, 3] → next ID is 4

    await act(async () => {
      result.current.addItem({ name: 'Butter', quantity: '1 stick', price: 2.50, checked: false, category: 'Dairy' })
    })

    expect(result.current.items).toHaveLength(4)
    expect(result.current.items[3].id).toBe(4)
    expect(result.current.items[3].name).toBe('Butter')
  })

  it('appends the new item to the end of the list', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })

    await act(async () => {
      result.current.addItem({ name: 'Yogurt', quantity: '2 cups', price: 3.99, checked: false, category: 'Dairy' })
    })

    const last = result.current.items[result.current.items.length - 1]
    expect(last.name).toBe('Yogurt')
  })

  it('assigns ID = 1 when the list is empty', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })

    // Clear all three initial items so the list is empty
    await act(async () => {
      result.current.deleteItem(1)
      result.current.deleteItem(2)
      result.current.deleteItem(3)
    })
    expect(result.current.items).toHaveLength(0)

    await act(async () => {
      result.current.addItem({ name: 'Apple', quantity: '3 count', price: 1.99, checked: false, category: 'Produce' })
    })

    // Math.max(...[], 0) + 1 = 0 + 1 = 1
    expect(result.current.items[0].id).toBe(1)
  })

  it('updates stats after adding an unchecked item', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })
    const priceBefore = result.current.stats.totalPrice  // 7.00

    await act(async () => {
      result.current.addItem({ name: 'Cheese', quantity: '200g', price: 4.00, checked: false, category: 'Dairy' })
    })

    expect(result.current.stats.totalPrice).toBeCloseTo(priceBefore + 4.00)
    expect(result.current.stats.remainingCount).toBe(3)
  })
})

// =============================================================================
// toggleItem
// =============================================================================

describe('GroceryContext — toggleItem', () => {
  it('flips checked=false to checked=true', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })
    expect(result.current.items[0].checked).toBe(false)  // Milk

    await act(async () => { result.current.toggleItem(1) })

    expect(result.current.items[0].checked).toBe(true)
  })

  it('flips checked=true to checked=false', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })
    expect(result.current.items[2].checked).toBe(true)  // Eggs

    await act(async () => { result.current.toggleItem(3) })

    expect(result.current.items[2].checked).toBe(false)
  })

  it('does not affect other items', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })

    await act(async () => { result.current.toggleItem(1) })

    // Bread and Eggs should be unchanged
    expect(result.current.items[1].checked).toBe(false)
    expect(result.current.items[2].checked).toBe(true)
  })

  it('updates stats after toggling an unchecked item to checked', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })
    // Initially: 1 checked, 2 remaining, totalPrice=7 (Milk=4, Bread=3)

    await act(async () => { result.current.toggleItem(1) })  // Mark Milk as checked

    expect(result.current.stats.checkedCount).toBe(2)
    expect(result.current.stats.remainingCount).toBe(1)
    // Milk now checked → excluded from total; only Bread(3) is unchecked
    expect(result.current.stats.totalPrice).toBeCloseTo(3.00)
  })
})

// =============================================================================
// clearCompleted
// =============================================================================

describe('GroceryContext — clearCompleted', () => {
  it('removes all items where checked=true', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })
    // Eggs (id=3) is the only checked item

    await act(async () => { result.current.clearCompleted() })

    expect(result.current.items).toHaveLength(2)
    expect(result.current.items.find(i => i.name === 'Eggs')).toBeUndefined()
  })

  it('keeps all unchecked items intact', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })

    await act(async () => { result.current.clearCompleted() })

    const names = result.current.items.map(i => i.name)
    expect(names).toContain('Milk')
    expect(names).toContain('Bread')
  })

  it('is a no-op when no items are checked', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })

    // Uncheck Eggs first so nothing is checked
    await act(async () => { result.current.toggleItem(3) })
    const countBefore = result.current.items.length

    await act(async () => { result.current.clearCompleted() })

    expect(result.current.items).toHaveLength(countBefore)
  })
})

// =============================================================================
// deleteItem
// =============================================================================

describe('GroceryContext — deleteItem', () => {
  it('removes the item with the given ID', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })

    await act(async () => { result.current.deleteItem(2) })  // delete Bread

    expect(result.current.items).toHaveLength(2)
    expect(result.current.items.find(i => i.id === 2)).toBeUndefined()
  })

  it('does not remove other items', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })

    await act(async () => { result.current.deleteItem(2) })

    expect(result.current.items.find(i => i.id === 1)).toBeDefined()  // Milk still there
    expect(result.current.items.find(i => i.id === 3)).toBeDefined()  // Eggs still there
  })

  it('is a no-op when the ID does not exist', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })

    await act(async () => { result.current.deleteItem(999) })

    expect(result.current.items).toHaveLength(3)
  })
})

// =============================================================================
// updateItem
// =============================================================================

describe('GroceryContext — updateItem', () => {
  it('patches only the specified fields', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })

    await act(async () => { result.current.updateItem(1, { price: 5.00 }) })

    const milk = result.current.items.find(i => i.id === 1)!
    expect(milk.price).toBe(5.00)
    expect(milk.name).toBe('Milk')        // unchanged
    expect(milk.quantity).toBe('1 gallon') // unchanged
  })

  it('does not affect other items', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })

    await act(async () => { result.current.updateItem(1, { name: 'Skim Milk' }) })

    expect(result.current.items.find(i => i.id === 2)?.name).toBe('Bread')  // unchanged
  })

  it('is a no-op when the ID does not exist', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })
    const namesBefore = result.current.items.map(i => i.name)

    await act(async () => { result.current.updateItem(999, { name: 'Ghost' }) })

    expect(result.current.items.map(i => i.name)).toEqual(namesBefore)
  })
})

// =============================================================================
// getItemById
// =============================================================================

describe('GroceryContext — getItemById', () => {
  it('returns the correct item when the ID exists', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })

    expect(result.current.getItemById(2)?.name).toBe('Bread')
  })

  it('returns undefined when the ID does not exist', async () => {
    const { result } = await renderHook(() => useGrocery(), { wrapper })

    expect(result.current.getItemById(999)).toBeUndefined()
  })
})

// =============================================================================
// Provider guard
// =============================================================================

describe('GroceryContext — provider guard', () => {
  it('throws a descriptive error when useGrocery is called outside GroceryProvider', async () => {
    await expect(renderHook(() => useGrocery())).rejects.toThrow(
      'useGrocery must be used within a GroceryProvider'
    )
  })
})
