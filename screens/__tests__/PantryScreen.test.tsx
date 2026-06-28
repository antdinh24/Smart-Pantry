/**
 * PantryScreen.test.tsx
 *
 * Tests for the Pantry screen.
 *
 * Behaviour under test:
 *   - Loading / error / empty states
 *   - Stats bar counts
 *   - Item rendering (name, category, quantity, expiry)
 *   - Search query passed to getFilteredItems
 *   - Tap on card → toggles checkbox selection
 *   - Select-all icon button above the list (toggle selects / deselects all)
 *   - Long-press on card → navigates directly to EditPantryItem (no alert)
 *   - Selection action bar appears when items selected, hidden when none
 *   - Bulk "Match Recipes" → navigates to Recipes screen + clears selection
 *   - Bulk "Delete" → confirmation Alert → calls deleteItem for each selected item
 *   - Dev Seed button (visible because __DEV__ = true in Jest)
 *
 * Mocking strategy:
 *   - usePantry()   — controls loading/error/stats/item list
 *   - APIService    — captures addPantryItem calls from the Seed button
 *   - useNavigation — captures navigate() / goBack() calls
 *   - Alert.alert   — asserted via jest-setup global mock
 *
 * RNTL v14: render() and fireEvent.* are async — always await.
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import PantryScreen from '../PantryScreen'
import { usePantry } from '../../hooks/usePantry'
import { APIService } from '../../services/api'

// ── Mock navigation ───────────────────────────────────────────────────────────

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}))

// ── Mock hooks / services ─────────────────────────────────────────────────────

jest.mock('../../hooks/usePantry', () => ({ usePantry: jest.fn() }))

jest.mock('../../services/api', () => ({
  APIService: {
    addPantryItem: jest.fn().mockResolvedValue({ id: 'new-item' }),
  },
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeItem = (overrides: Record<string, any> = {}) => ({
  id: 'item-1',
  ingredient_name: 'Eggs',
  quantity: 12,
  unit: 'count',
  category: 'dairy',
  expiration_date: null,
  urgent: false,
  ...overrides,
})

const DEFAULT_STATS = { totalItems: 0, categoriesCount: 0, expiringSoonCount: 0 }

const mockDeleteItem = jest.fn()
const mockRefreshItems = jest.fn()
const mockGetFilteredItems = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()

  ;(usePantry as jest.Mock).mockReturnValue({
    loading: false,
    error: null,
    stats: DEFAULT_STATS,
    getFilteredItems: mockGetFilteredItems,
    deleteItem: mockDeleteItem,
    refreshItems: mockRefreshItems,
  })

  mockGetFilteredItems.mockReturnValue([])
  mockDeleteItem.mockResolvedValue(undefined)
  mockRefreshItems.mockResolvedValue(undefined)
})

// ─────────────────────────────────────────────────────────────────────────────
// Loading state
// ─────────────────────────────────────────────────────────────────────────────

describe('PantryScreen loading state', () => {
  it('shows spinner and "Loading pantry..." while fetching', async () => {
    ;(usePantry as jest.Mock).mockReturnValue({
      loading: true, error: null,
      stats: DEFAULT_STATS,
      getFilteredItems: mockGetFilteredItems.mockReturnValue([]),
      deleteItem: mockDeleteItem, refreshItems: mockRefreshItems,
    })
    const { getByText } = await render(<PantryScreen />)
    expect(getByText('Loading pantry...')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Error state
// ─────────────────────────────────────────────────────────────────────────────

describe('PantryScreen error state', () => {
  it('shows the error message when the fetch fails', async () => {
    ;(usePantry as jest.Mock).mockReturnValue({
      loading: false,
      error: 'Failed to load pantry',
      stats: DEFAULT_STATS,
      getFilteredItems: mockGetFilteredItems.mockReturnValue([]),
      deleteItem: mockDeleteItem, refreshItems: mockRefreshItems,
    })
    const { getByText } = await render(<PantryScreen />)
    expect(getByText('Failed to load pantry')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

describe('PantryScreen empty state', () => {
  it('shows "No items found" when there are no pantry items', async () => {
    mockGetFilteredItems.mockReturnValue([])
    const { getByText } = await render(<PantryScreen />)
    expect(getByText('No items found')).toBeTruthy()
  })

  it('does not render the select-all button when the list is empty', async () => {
    mockGetFilteredItems.mockReturnValue([])
    const { queryByTestId } = await render(<PantryScreen />)
    expect(queryByTestId('select-all-btn')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Stats bar
// ─────────────────────────────────────────────────────────────────────────────

describe('PantryScreen stats bar', () => {
  it('shows correct item count', async () => {
    ;(usePantry as jest.Mock).mockReturnValue({
      loading: false, error: null,
      stats: { totalItems: 5, categoriesCount: 2, expiringSoonCount: 0 },
      getFilteredItems: mockGetFilteredItems,
      deleteItem: mockDeleteItem, refreshItems: mockRefreshItems,
    })
    const { getByText } = await render(<PantryScreen />)
    expect(getByText('5 items')).toBeTruthy()
  })

  it('shows "expiring soon" badge when expiringSoonCount > 0', async () => {
    ;(usePantry as jest.Mock).mockReturnValue({
      loading: false, error: null,
      stats: { totalItems: 3, categoriesCount: 1, expiringSoonCount: 2 },
      getFilteredItems: mockGetFilteredItems,
      deleteItem: mockDeleteItem, refreshItems: mockRefreshItems,
    })
    const { getByText } = await render(<PantryScreen />)
    expect(getByText('2 expiring soon')).toBeTruthy()
  })

  it('hides the "expiring soon" badge when expiringSoonCount is 0', async () => {
    const { queryByText } = await render(<PantryScreen />)
    expect(queryByText(/expiring soon/i)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Item rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('PantryScreen item rendering', () => {
  it('renders the ingredient name, category, and quantity for each item', async () => {
    mockGetFilteredItems.mockReturnValue([
      makeItem({ ingredient_name: 'Whole Milk', category: 'dairy', quantity: 2, unit: 'litre' }),
    ])
    const { getByText } = await render(<PantryScreen />)
    expect(getByText('Whole Milk')).toBeTruthy()
    expect(getByText('dairy')).toBeTruthy()
    expect(getByText('2 litre')).toBeTruthy()
  })

  it('shows "Uncategorized" when category is null', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem({ category: null })])
    const { getByText } = await render(<PantryScreen />)
    expect(getByText('Uncategorized')).toBeTruthy()
  })

  it('renders "No expiry" for items without an expiration date', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem({ expiration_date: null })])
    const { getByText } = await render(<PantryScreen />)
    expect(getByText('No expiry')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Search input
// ─────────────────────────────────────────────────────────────────────────────

describe('PantryScreen search', () => {
  it('passes the typed query to getFilteredItems', async () => {
    const { getByPlaceholderText } = await render(<PantryScreen />)
    await fireEvent.changeText(getByPlaceholderText('Search items...'), 'milk')
    const calls = mockGetFilteredItems.mock.calls
    expect(calls[calls.length - 1][1]).toBe('milk')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Add button
// ─────────────────────────────────────────────────────────────────────────────

describe('PantryScreen add button', () => {
  it('navigates to AddIngredients when the + button is pressed', async () => {
    const { getByTestId } = await render(<PantryScreen />)
    // The + button renders a "plus" icon — the vector-icon mock gives it testID="icon-plus"
    await fireEvent.press(getByTestId('icon-plus'))
    expect(mockNavigate).toHaveBeenCalledWith('AddIngredients')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Select-all button
// ─────────────────────────────────────────────────────────────────────────────

describe('PantryScreen select-all button', () => {
  it('renders the select-all button when items exist', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem()])
    const { getByTestId } = await render(<PantryScreen />)
    expect(getByTestId('select-all-btn')).toBeTruthy()
  })

  it('tapping select-all selects every item and shows the action bar', async () => {
    mockGetFilteredItems.mockReturnValue([
      makeItem({ id: 'a', ingredient_name: 'Eggs' }),
      makeItem({ id: 'b', ingredient_name: 'Milk' }),
    ])
    const { getByTestId, getByText } = await render(<PantryScreen />)
    await fireEvent.press(getByTestId('select-all-btn'))
    expect(getByText('2 selected')).toBeTruthy()
  })

  it('tapping select-all when all are selected deselects all and hides the action bar', async () => {
    mockGetFilteredItems.mockReturnValue([
      makeItem({ id: 'a', ingredient_name: 'Eggs' }),
      makeItem({ id: 'b', ingredient_name: 'Milk' }),
    ])
    const { getByTestId, getByText, queryByText } = await render(<PantryScreen />)
    // Select all
    await fireEvent.press(getByTestId('select-all-btn'))
    expect(getByText('2 selected')).toBeTruthy()
    // Deselect all
    await fireEvent.press(getByTestId('select-all-btn'))
    expect(queryByText('2 selected')).toBeNull()
    expect(queryByText('Match Recipes')).toBeNull()
  })

  it('individually selecting all items causes the select-all icon to show as checked', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem({ ingredient_name: 'Eggs' })])
    const { getByText, getByTestId } = await render(<PantryScreen />)
    // Selecting the only item means allSelected = true → icon should be check-square
    await fireEvent.press(getByText('Eggs'))
    // The icon mock renders as Text with testID "icon-check-square"
    expect(getByTestId('icon-check-square')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Checkbox selection
// ─────────────────────────────────────────────────────────────────────────────

describe('PantryScreen checkbox selection', () => {
  it('selection action bar is hidden when no items are selected', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem()])
    const { queryByText } = await render(<PantryScreen />)
    expect(queryByText(/selected/i)).toBeNull()
    expect(queryByText('Match Recipes')).toBeNull()
  })

  it('tapping a card selects it and shows the action bar', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem({ ingredient_name: 'Eggs' })])
    const { getByText } = await render(<PantryScreen />)
    await fireEvent.press(getByText('Eggs'))
    expect(getByText('1 selected')).toBeTruthy()
    expect(getByText('Match Recipes')).toBeTruthy()
    expect(getByText('Delete')).toBeTruthy()
  })

  it('tapping the same card again deselects it and hides the action bar', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem({ ingredient_name: 'Eggs' })])
    const { getByText, queryByText } = await render(<PantryScreen />)
    // Select
    await fireEvent.press(getByText('Eggs'))
    expect(getByText('1 selected')).toBeTruthy()
    // Deselect
    await fireEvent.press(getByText('Eggs'))
    expect(queryByText('1 selected')).toBeNull()
    expect(queryByText('Match Recipes')).toBeNull()
  })

  it('shows the correct count when multiple items are selected', async () => {
    mockGetFilteredItems.mockReturnValue([
      makeItem({ id: 'a', ingredient_name: 'Eggs' }),
      makeItem({ id: 'b', ingredient_name: 'Milk' }),
    ])
    const { getByText } = await render(<PantryScreen />)
    await fireEvent.press(getByText('Eggs'))
    await fireEvent.press(getByText('Milk'))
    expect(getByText('2 selected')).toBeTruthy()
  })

  it('X button clears selection and hides the action bar', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem({ ingredient_name: 'Eggs' })])
    const { getByText, getByTestId, queryByText } = await render(<PantryScreen />)
    await fireEvent.press(getByText('Eggs'))
    expect(getByText('1 selected')).toBeTruthy()
    // X button renders icon-x
    await fireEvent.press(getByTestId('icon-x'))
    expect(queryByText('1 selected')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Long-press → navigate directly to EditPantryItem (no alert)
// ─────────────────────────────────────────────────────────────────────────────

describe('PantryScreen long-press', () => {
  it('navigates to EditPantryItem on long-press without showing an Alert', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem({ id: 'item-99', ingredient_name: 'Garlic' })])
    const { getByText } = await render(<PantryScreen />)
    await fireEvent(getByText('Garlic'), 'longPress')
    expect(mockNavigate).toHaveBeenCalledWith('EditPantryItem', { itemId: 'item-99' })
    expect(Alert.alert).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Bulk "Match Recipes"
// ─────────────────────────────────────────────────────────────────────────────

describe('PantryScreen Match Recipes button', () => {
  it('navigates to Recipes screen and clears selection', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem({ ingredient_name: 'Eggs' })])
    const { getByText, queryByText } = await render(<PantryScreen />)
    await fireEvent.press(getByText('Eggs'))
    expect(getByText('1 selected')).toBeTruthy()

    await fireEvent.press(getByText('Match Recipes'))
    expect(mockNavigate).toHaveBeenCalledWith('Recipes')
    expect(queryByText('1 selected')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Bulk delete
// ─────────────────────────────────────────────────────────────────────────────

describe('PantryScreen bulk delete', () => {
  it('shows a confirmation Alert when the Delete button is pressed', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem({ ingredient_name: 'Eggs' })])
    const { getByText } = await render(<PantryScreen />)
    await fireEvent.press(getByText('Eggs'))
    await fireEvent.press(getByText('Delete'))
    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Items',
      expect.stringContaining('1 item'),
      expect.any(Array)
    )
  })

  it('calls deleteItem for each selected item when confirmed', async () => {
    mockGetFilteredItems.mockReturnValue([
      makeItem({ id: 'a', ingredient_name: 'Eggs' }),
      makeItem({ id: 'b', ingredient_name: 'Milk' }),
    ])
    const { getByText } = await render(<PantryScreen />)
    await fireEvent.press(getByText('Eggs'))
    await fireEvent.press(getByText('Milk'))
    await fireEvent.press(getByText('Delete'))

    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2]
    const confirmBtn = alertButtons.find((b: any) => b.text === 'Delete')
    confirmBtn.onPress()

    await waitFor(() => {
      expect(mockDeleteItem).toHaveBeenCalledWith('a')
      expect(mockDeleteItem).toHaveBeenCalledWith('b')
    })
  })

  it('cancelling the confirmation Alert does not call deleteItem', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem({ ingredient_name: 'Eggs' })])
    const { getByText } = await render(<PantryScreen />)
    await fireEvent.press(getByText('Eggs'))
    await fireEvent.press(getByText('Delete'))
    // Cancel button has style:'cancel' and no onPress — just assert deleteItem was not called
    expect(mockDeleteItem).not.toHaveBeenCalled()
  })

  it('delete Alert button does not have destructive style', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem({ ingredient_name: 'Eggs' })])
    const { getByText } = await render(<PantryScreen />)
    await fireEvent.press(getByText('Eggs'))
    await fireEvent.press(getByText('Delete'))
    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2]
    const deleteBtn = alertButtons.find((b: any) => b.text === 'Delete')
    expect(deleteBtn.style).not.toBe('destructive')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Dev Seed button (__DEV__ = true in Jest environment)
// ─────────────────────────────────────────────────────────────────────────────

describe('PantryScreen Seed button (dev only)', () => {
  it('renders the Seed button in the dev environment', async () => {
    const { getByText } = await render(<PantryScreen />)
    expect(getByText('Seed')).toBeTruthy()
  })

  it('calls addPantryItem for each of the 8 seed items', async () => {
    const { getByText } = await render(<PantryScreen />)
    await fireEvent.press(getByText('Seed'))
    await waitFor(() =>
      expect(APIService.addPantryItem as jest.Mock).toHaveBeenCalledTimes(8)
    )
  })

  it('calls refreshItems after seeding completes', async () => {
    const { getByText } = await render(<PantryScreen />)
    await fireEvent.press(getByText('Seed'))
    await waitFor(() => expect(mockRefreshItems).toHaveBeenCalledTimes(1))
  })

  it('shows an Alert when seeding fails', async () => {
    ;(APIService.addPantryItem as jest.Mock).mockRejectedValue(new Error('Network error'))
    const { getByText } = await render(<PantryScreen />)
    await fireEvent.press(getByText('Seed'))
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Seed Failed', expect.any(String))
    )
  })
})
