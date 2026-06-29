/**
 * EditPantryItemScreen.test.tsx
 *
 * Tests for the edit pantry item screen:
 *   - "Item not found" fallback when getItemById returns undefined
 *   - Pre-populated form with existing item data
 *   - Back button calls goBack
 *   - Save validation: blank name, invalid quantity, bad date format
 *   - Successful save calls updateItem and navigates back
 *   - Failed save shows error alert
 *   - Delete button shows confirmation alert
 *   - Confirm delete: calls deleteItem and navigation.pop(2)
 *   - Cancel delete: does not call deleteItem
 *   - Failed delete shows error alert
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import EditPantryItemScreen from '../EditPantryItemScreen'
import { usePantry } from '../../hooks/usePantry'

// ── Mock navigation + route ────────────────────────────────────────────────────

const mockGoBack = jest.fn()
const mockPop = jest.fn()
const mockUseRoute = jest.fn()

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, pop: mockPop }),
  useRoute: () => mockUseRoute(),
}))

// ── Mock usePantry ─────────────────────────────────────────────────────────────

jest.mock('../../hooks/usePantry', () => ({ usePantry: jest.fn() }))

const mockGetItemById = jest.fn()
const mockUpdateItem = jest.fn()
const mockDeleteItem = jest.fn()

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ITEM_ID = 'item-abc-123'

const ITEM = {
  id: ITEM_ID,
  ingredient_name: 'Whole Milk',
  quantity: 2,
  unit: 'L',
  category: 'dairy',
  expiration_date: '2025-12-31',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUpdateItem.mockResolvedValue(undefined)
  mockDeleteItem.mockResolvedValue(undefined);
  (usePantry as jest.Mock).mockReturnValue({
    getItemById: mockGetItemById,
    updateItem: mockUpdateItem,
    deleteItem: mockDeleteItem,
  })
  mockGetItemById.mockReturnValue(ITEM)
  mockUseRoute.mockReturnValue({ params: { itemId: ITEM_ID } })
})

// ─────────────────────────────────────────────────────────────────────────────
// Item not found fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('EditPantryItemScreen item not found', () => {
  beforeEach(() => {
    mockGetItemById.mockReturnValue(undefined)
  })

  it('shows "Item not found." error view', async () => {
    const { getByText } = await render(<EditPantryItemScreen />)
    expect(getByText('Item not found.')).toBeTruthy()
  })

  it('"Go Back" button calls goBack', async () => {
    const { getByText } = await render(<EditPantryItemScreen />)
    await fireEvent.press(getByText('Go Back'))
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Rendering with existing item
// ─────────────────────────────────────────────────────────────────────────────

describe('EditPantryItemScreen rendering', () => {
  it('renders without crashing', async () => {
    const { getByText } = await render(<EditPantryItemScreen />)
    expect(getByText('Edit Item')).toBeTruthy()
  })

  it('pre-fills the name field with the item ingredient name', async () => {
    const { getByDisplayValue } = await render(<EditPantryItemScreen />)
    expect(getByDisplayValue('Whole Milk')).toBeTruthy()
  })

  it('pre-fills the quantity field with the item quantity', async () => {
    const { getByDisplayValue } = await render(<EditPantryItemScreen />)
    expect(getByDisplayValue('2')).toBeTruthy()
  })

  it('pre-fills the expiration date', async () => {
    const { getByDisplayValue } = await render(<EditPantryItemScreen />)
    expect(getByDisplayValue('2025-12-31')).toBeTruthy()
  })

  it('shows Save Changes and Delete Item buttons', async () => {
    const { getByText } = await render(<EditPantryItemScreen />)
    expect(getByText('Save Changes')).toBeTruthy()
    expect(getByText('Delete Item')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

describe('EditPantryItemScreen navigation', () => {
  it('back button calls goBack', async () => {
    const { getByTestId } = await render(<EditPantryItemScreen />)
    await fireEvent.press(getByTestId('icon-arrow-left'))
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Save validation
// ─────────────────────────────────────────────────────────────────────────────

describe('EditPantryItemScreen save validation', () => {
  it('shows alert when name is blank', async () => {
    const { getByText, getByDisplayValue } = await render(<EditPantryItemScreen />)
    await fireEvent.changeText(getByDisplayValue('Whole Milk'), '')
    await fireEvent.press(getByText('Save Changes'))
    expect(Alert.alert).toHaveBeenCalledWith('Name Required', expect.any(String))
    expect(mockUpdateItem).not.toHaveBeenCalled()
  })

  it('shows alert when quantity is not a valid number', async () => {
    const { getByText, getByDisplayValue } = await render(<EditPantryItemScreen />)
    await fireEvent.changeText(getByDisplayValue('2'), 'abc')
    await fireEvent.press(getByText('Save Changes'))
    expect(Alert.alert).toHaveBeenCalledWith('Invalid Quantity', expect.any(String))
    expect(mockUpdateItem).not.toHaveBeenCalled()
  })

  it('shows alert when quantity is zero', async () => {
    const { getByText, getByDisplayValue } = await render(<EditPantryItemScreen />)
    await fireEvent.changeText(getByDisplayValue('2'), '0')
    await fireEvent.press(getByText('Save Changes'))
    expect(Alert.alert).toHaveBeenCalledWith('Invalid Quantity', expect.any(String))
    expect(mockUpdateItem).not.toHaveBeenCalled()
  })

  it('shows alert when expiration date format is invalid', async () => {
    const { getByText, getByDisplayValue } = await render(<EditPantryItemScreen />)
    await fireEvent.changeText(getByDisplayValue('2025-12-31'), '31/12/2025')
    await fireEvent.press(getByText('Save Changes'))
    expect(Alert.alert).toHaveBeenCalledWith('Invalid Date', expect.any(String))
    expect(mockUpdateItem).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Save — success path
// ─────────────────────────────────────────────────────────────────────────────

describe('EditPantryItemScreen save success', () => {
  it('calls updateItem with correct payload and navigates back', async () => {
    const { getByText } = await render(<EditPantryItemScreen />)
    await fireEvent.press(getByText('Save Changes'))
    await waitFor(() =>
      expect(mockUpdateItem).toHaveBeenCalledWith(ITEM_ID, {
        ingredient_name: 'Whole Milk',
        quantity: 2,
        unit: 'L',
        category: 'dairy',
        expiration_date: '2025-12-31',
      })
    )
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })

  it('passes null for expiration_date when field is cleared', async () => {
    const { getByText, getByDisplayValue } = await render(<EditPantryItemScreen />)
    await fireEvent.changeText(getByDisplayValue('2025-12-31'), '')
    await fireEvent.press(getByText('Save Changes'))
    await waitFor(() =>
      expect(mockUpdateItem).toHaveBeenCalledWith(ITEM_ID, expect.objectContaining({
        expiration_date: null,
      }))
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Save — error path
// ─────────────────────────────────────────────────────────────────────────────

describe('EditPantryItemScreen save error', () => {
  it('shows error alert when updateItem throws', async () => {
    mockUpdateItem.mockRejectedValue(new Error('Server error'))
    const { getByText } = await render(<EditPantryItemScreen />)
    await fireEvent.press(getByText('Save Changes'))
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String))
    )
    expect(mockGoBack).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────────────────────

describe('EditPantryItemScreen delete', () => {
  it('shows confirmation alert when Delete Item is pressed', async () => {
    const { getByText } = await render(<EditPantryItemScreen />)
    await fireEvent.press(getByText('Delete Item'))
    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Item',
      expect.stringContaining('Whole Milk'),
      expect.any(Array)
    )
  })

  it('calls deleteItem and pop(2) when Delete is confirmed', async () => {
    const { getByText } = await render(<EditPantryItemScreen />)
    await fireEvent.press(getByText('Delete Item'))

    // Simulate pressing the "Delete" button in the confirmation alert
    const alertArgs = (Alert.alert as jest.Mock).mock.calls[0]
    const deleteButton = alertArgs[2].find((b: any) => b.text === 'Delete')
    await deleteButton.onPress()

    await waitFor(() => expect(mockDeleteItem).toHaveBeenCalledWith(ITEM_ID))
    expect(mockPop).toHaveBeenCalledWith(2)
  })

  it('does not call deleteItem when Cancel is pressed', async () => {
    const { getByText } = await render(<EditPantryItemScreen />)
    await fireEvent.press(getByText('Delete Item'))

    const alertArgs = (Alert.alert as jest.Mock).mock.calls[0]
    const cancelButton = alertArgs[2].find((b: any) => b.text === 'Cancel')
    // Cancel has no onPress (style: 'cancel') — just verify deleteItem not called
    if (cancelButton.onPress) cancelButton.onPress()

    expect(mockDeleteItem).not.toHaveBeenCalled()
  })

  it('shows error alert when deleteItem throws', async () => {
    mockDeleteItem.mockRejectedValue(new Error('Delete failed'))
    const { getByText } = await render(<EditPantryItemScreen />)
    await fireEvent.press(getByText('Delete Item'))

    const alertArgs = (Alert.alert as jest.Mock).mock.calls[0]
    const deleteButton = alertArgs[2].find((b: any) => b.text === 'Delete')
    await deleteButton.onPress()

    await waitFor(() => {
      const allCalls = (Alert.alert as jest.Mock).mock.calls
      const errorCall = allCalls.find((c: any[]) => c[0] === 'Error')
      expect(errorCall).toBeTruthy()
    })
    expect(mockPop).not.toHaveBeenCalled()
  })
})
