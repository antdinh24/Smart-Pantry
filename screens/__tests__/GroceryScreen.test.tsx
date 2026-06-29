/**
 * GroceryScreen.test.tsx
 *
 * Tests for the grocery list screen:
 *   - Renders the budget card and shopping list
 *   - Toggle item calls toggleItem with the item id
 *   - "+" button shows the add form; "x" button hides it
 *   - Adding item with a valid name calls addItem and closes the form
 *   - Adding item with blank name does NOT call addItem
 *   - "Clear completed" visible when checkedCount > 0, calls clearCompleted
 *   - "Clear completed" hidden when checkedCount = 0
 *   - Empty item list renders without crashing
 *   - Back button calls goBack
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import GroceryScreen from '../GroceryScreen'
import { useGrocery } from '../../hooks/useGrocery'

// ── Mock navigation ────────────────────────────────────────────────────────────

const mockGoBack = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}))

// ── Mock useGrocery ────────────────────────────────────────────────────────────

jest.mock('../../hooks/useGrocery', () => ({ useGrocery: jest.fn() }))

const mockToggleItem = jest.fn()
const mockAddItem = jest.fn()
const mockClearCompleted = jest.fn()

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeGroceryItem = (overrides: Record<string, any> = {}) => ({
  id: 1,
  name: 'Eggs',
  quantity: '12',
  price: 3.99,
  checked: false,
  ...overrides,
})

const DEFAULT_STATS = {
  totalPrice: 0,
  checkedCount: 0,
  remainingCount: 0,
  monthlyAverage: 150,
}

function mockGrocery({
  items = [] as ReturnType<typeof makeGroceryItem>[],
  stats = DEFAULT_STATS,
} = {}) {
  (useGrocery as jest.Mock).mockReturnValue({
    items,
    stats,
    toggleItem: mockToggleItem,
    addItem: mockAddItem,
    clearCompleted: mockClearCompleted,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAddItem.mockReturnValue(undefined)
  mockGrocery()
})

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('GroceryScreen rendering', () => {
  it('renders without crashing', async () => {
    const { getByText } = await render(<GroceryScreen />)
    expect(getByText('Grocery List')).toBeTruthy()
  })

  it('shows the budget card with estimated total', async () => {
    const { getByText } = await render(<GroceryScreen />)
    expect(getByText('Estimated Total')).toBeTruthy()
    expect(getByText('$0.00')).toBeTruthy()
  })

  it('renders items from the hook', async () => {
    mockGrocery({
      items: [
        makeGroceryItem({ id: 1, name: 'Eggs', price: 3.99 }),
        makeGroceryItem({ id: 2, name: 'Bread', price: 2.50 }),
      ],
      stats: { ...DEFAULT_STATS, remainingCount: 2 },
    })
    const { getByText } = await render(<GroceryScreen />)
    expect(getByText('Eggs')).toBeTruthy()
    expect(getByText('Bread')).toBeTruthy()
  })

  it('shows the remaining count in the budget footer', async () => {
    mockGrocery({
      items: [makeGroceryItem()],
      stats: { ...DEFAULT_STATS, remainingCount: 1 },
    })
    const { getByText } = await render(<GroceryScreen />)
    expect(getByText('1 item remaining')).toBeTruthy()
  })

  it('renders with an empty items list without crashing', async () => {
    const { getByText } = await render(<GroceryScreen />)
    expect(getByText('Shopping List')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Toggle item
// ─────────────────────────────────────────────────────────────────────────────

describe('GroceryScreen toggle item', () => {
  it('calls toggleItem with the item id when an item is tapped', async () => {
    mockGrocery({
      items: [makeGroceryItem({ id: 42, name: 'Eggs' })],
      stats: DEFAULT_STATS,
    })
    const { getByText } = await render(<GroceryScreen />)
    await fireEvent.press(getByText('Eggs'))
    expect(mockToggleItem).toHaveBeenCalledWith(42)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Add form
// ─────────────────────────────────────────────────────────────────────────────

describe('GroceryScreen add form', () => {
  it('"+" button shows the add form', async () => {
    const { getByTestId, getByPlaceholderText } = await render(<GroceryScreen />)
    await fireEvent.press(getByTestId('icon-plus'))
    expect(getByPlaceholderText('Item name')).toBeTruthy()
  })

  it('"x" button hides the form after it is open', async () => {
    const { getByTestId, queryByPlaceholderText } = await render(<GroceryScreen />)
    await fireEvent.press(getByTestId('icon-plus'))
    await fireEvent.press(getByTestId('icon-x'))
    expect(queryByPlaceholderText('Item name')).toBeNull()
  })

  it('adds item and closes form when name is provided', async () => {
    const { getByTestId, getByPlaceholderText, getByText, queryByPlaceholderText } =
      await render(<GroceryScreen />)
    await fireEvent.press(getByTestId('icon-plus'))
    await fireEvent.changeText(getByPlaceholderText('Item name'), 'Butter')
    await fireEvent.press(getByText('Add to List'))

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Butter', checked: false })
    )
    // Form should close after successful add
    await waitFor(() =>
      expect(queryByPlaceholderText('Item name')).toBeNull()
    )
  })

  it('does NOT call addItem when name is blank', async () => {
    const { getByTestId, getByText } = await render(<GroceryScreen />)
    await fireEvent.press(getByTestId('icon-plus'))
    await fireEvent.press(getByText('Add to List'))
    expect(mockAddItem).not.toHaveBeenCalled()
  })

  it('uses default quantity "1" when quantity field is left blank', async () => {
    const { getByTestId, getByPlaceholderText, getByText } = await render(<GroceryScreen />)
    await fireEvent.press(getByTestId('icon-plus'))
    await fireEvent.changeText(getByPlaceholderText('Item name'), 'Butter')
    await fireEvent.press(getByText('Add to List'))
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: '1' })
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Clear completed
// ─────────────────────────────────────────────────────────────────────────────

describe('GroceryScreen clear completed', () => {
  it('hides "Clear completed" when no items are checked', async () => {
    const { queryByText } = await render(<GroceryScreen />)
    expect(queryByText('Clear completed')).toBeNull()
  })

  it('shows "Clear completed" when checkedCount > 0', async () => {
    mockGrocery({
      items: [makeGroceryItem({ checked: true })],
      stats: { ...DEFAULT_STATS, checkedCount: 1 },
    })
    const { getByText } = await render(<GroceryScreen />)
    expect(getByText('Clear completed')).toBeTruthy()
  })

  it('calls clearCompleted when the button is pressed', async () => {
    mockGrocery({
      items: [makeGroceryItem({ checked: true })],
      stats: { ...DEFAULT_STATS, checkedCount: 1 },
    })
    const { getByText } = await render(<GroceryScreen />)
    await fireEvent.press(getByText('Clear completed'))
    expect(mockClearCompleted).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

describe('GroceryScreen navigation', () => {
  it('back button calls goBack', async () => {
    const { getByTestId } = await render(<GroceryScreen />)
    await fireEvent.press(getByTestId('icon-arrow-left'))
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })
})
