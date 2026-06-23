/**
 * PantryScreen.test.tsx
 *
 * Tests for the Pantry screen: loading/error/empty states, item rendering,
 * search query passed to the hook, long-press action menu, delete flow,
 * and the dev Seed button (visible in Jest because __DEV__ = true).
 *
 * Mocking strategy:
 *   - usePantry()   — controls loading/error/stats/item list
 *   - APIService    — captures addPantryItem calls from the Seed button
 *   - useNavigation — captures navigate() calls
 *   - Alert.alert   — asserted via jest-setup global mock
 *
 * RNTL v14 quirks:
 *   - render() is async → must be awaited
 *   - fireEvent.press / fireEvent.changeText / fireEvent() are async → must be awaited
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
  jest.clearAllMocks();

  (usePantry as jest.Mock).mockReturnValue({
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
    (usePantry as jest.Mock).mockReturnValue({
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
    (usePantry as jest.Mock).mockReturnValue({
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
})

// ─────────────────────────────────────────────────────────────────────────────
// Stats bar
// ─────────────────────────────────────────────────────────────────────────────

describe('PantryScreen stats bar', () => {
  it('shows correct item count', async () => {
    (usePantry as jest.Mock).mockReturnValue({
      loading: false, error: null,
      stats: { totalItems: 5, categoriesCount: 2, expiringSoonCount: 0 },
      getFilteredItems: mockGetFilteredItems,
      deleteItem: mockDeleteItem, refreshItems: mockRefreshItems,
    })
    const { getByText } = await render(<PantryScreen />)
    expect(getByText('5 items')).toBeTruthy()
  })

  it('shows "expiring soon" badge when expiringSoonCount > 0', async () => {
    (usePantry as jest.Mock).mockReturnValue({
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
    // getFilteredItems is called on every render — verify the last call had the query
    const calls = mockGetFilteredItems.mock.calls
    expect(calls[calls.length - 1][1]).toBe('milk')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Long-press action menu
// ─────────────────────────────────────────────────────────────────────────────

describe('PantryScreen long-press menu', () => {
  it('shows an Alert with the item name when an item is long-pressed', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem({ ingredient_name: 'Garlic' })])
    const { getByText } = await render(<PantryScreen />)
    await fireEvent(getByText('Garlic'), 'longPress')
    expect(Alert.alert).toHaveBeenCalledWith(
      'Garlic',
      'What would you like to do?',
      expect.any(Array)
    )
  })

  it('navigates to EditPantryItem when Edit is chosen', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem({ id: 'item-99', ingredient_name: 'Garlic' })])
    const { getByText } = await render(<PantryScreen />)
    await fireEvent(getByText('Garlic'), 'longPress')

    // Simulate tapping the "Edit" option in the Alert
    const alertOptions = (Alert.alert as jest.Mock).mock.calls[0][2]
    const editOption = alertOptions.find((o: any) => o.text === 'Edit')
    editOption.onPress()

    expect(mockNavigate).toHaveBeenCalledWith(
      'EditPantryItem',
      { itemId: 'item-99' }
    )
  })

  it('shows a second Alert when Delete is chosen from the long-press menu', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem({ ingredient_name: 'Garlic' })])
    const { getByText } = await render(<PantryScreen />)
    await fireEvent(getByText('Garlic'), 'longPress')

    const firstAlertOptions = (Alert.alert as jest.Mock).mock.calls[0][2]
    const deleteOption = firstAlertOptions.find((o: any) => o.text === 'Delete')
    deleteOption.onPress()

    // Should now show a confirmation Alert
    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Item',
      expect.stringContaining('Garlic'),
      expect.any(Array)
    )
  })

  it('calls deleteItem when the confirmation Delete button is pressed', async () => {
    mockGetFilteredItems.mockReturnValue([makeItem({ id: 'item-42', ingredient_name: 'Garlic' })])
    const { getByText } = await render(<PantryScreen />)
    await fireEvent(getByText('Garlic'), 'longPress')

    // First Alert: choose "Delete"
    const firstAlertOptions = (Alert.alert as jest.Mock).mock.calls[0][2]
    firstAlertOptions.find((o: any) => o.text === 'Delete').onPress()

    // Second Alert: choose "Delete" (confirmation)
    const secondAlertOptions = (Alert.alert as jest.Mock).mock.calls[1][2]
    secondAlertOptions.find((o: any) => o.text === 'Delete').onPress()

    await waitFor(() => expect(mockDeleteItem).toHaveBeenCalledWith('item-42'))
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
      expect((APIService.addPantryItem as jest.Mock)).toHaveBeenCalledTimes(8)
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
