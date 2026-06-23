/**
 * ReceiptConfirmScreen.test.tsx
 *
 * Tests for the receipt confirmation screen: item rendering, individual checkbox
 * toggle, select-all/deselect-all, the confirm button label and disabled state,
 * the API call payload (selected items only, without the `selected` field),
 * pantry refresh after confirm, navigation to Pantry, and the error alert.
 *
 * Mocking strategy:
 *   - useRoute()  — supplies receipt params (receiptId, items, merchant, total)
 *   - usePantry() — supplies refreshItems (from PantryContext directly)
 *   - APIService.confirmReceipt — captured to verify payload shape
 *   - useNavigation() — captures navigate() calls
 *
 * RNTL v14 quirks:
 *   - render() is async → must be awaited
 *   - fireEvent.press is async → must be awaited
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import ReceiptConfirmScreen from '../ReceiptConfirmScreen'
import { usePantry } from '../../contexts/PantryContext'
import { APIService } from '../../services/api'

// ── Mock navigation + route ───────────────────────────────────────────────────

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
const mockUseRoute = jest.fn()

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => mockUseRoute(),
}))

// ── Mock PantryContext (ReceiptConfirmScreen imports it directly) ──────────────

jest.mock('../../contexts/PantryContext', () => ({ usePantry: jest.fn() }))

// ── Mock APIService ───────────────────────────────────────────────────────────

jest.mock('../../services/api', () => ({
  APIService: {
    confirmReceipt: jest.fn(),
  },
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const INITIAL_ITEMS = [
  { item: 'Whole Milk', price: 3.99, quantity: 1, category: 'dairy', selected: true },
  { item: 'Sourdough Bread', price: 4.99, quantity: 1, category: 'bakery', selected: true },
  { item: 'Chicken Breast', price: 8.99, quantity: 2, category: 'meat', selected: true },
]

const DEFAULT_PARAMS = {
  receiptId: 'receipt-123',
  items: INITIAL_ITEMS,
  merchant: 'Walmart',
  total: 17.97,
}

const mockRefreshItems = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()

  mockUseRoute.mockReturnValue({ params: DEFAULT_PARAMS });
  (usePantry as jest.Mock).mockReturnValue({ refreshItems: mockRefreshItems });
  (APIService.confirmReceipt as jest.Mock).mockResolvedValue({ success: true })
  mockRefreshItems.mockResolvedValue(undefined)
})

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('ReceiptConfirmScreen rendering', () => {
  it('shows the merchant name in the header', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    expect(getByText('Walmart')).toBeTruthy()
  })

  it('falls back to "Receipt Items" when merchant is null', async () => {
    mockUseRoute.mockReturnValue({
      params: { ...DEFAULT_PARAMS, merchant: null },
    })
    const { getByText } = await render(<ReceiptConfirmScreen />)
    expect(getByText('Receipt Items')).toBeTruthy()
  })

  it('shows the receipt total when total > 0', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    expect(getByText('$17.97')).toBeTruthy()
  })

  it('renders all item names', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    expect(getByText('Whole Milk')).toBeTruthy()
    expect(getByText('Sourdough Bread')).toBeTruthy()
    expect(getByText('Chicken Breast')).toBeTruthy()
  })

  it('renders item prices', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    expect(getByText('$3.99')).toBeTruthy()
    expect(getByText('$4.99')).toBeTruthy()
    expect(getByText('$8.99')).toBeTruthy()
  })

  it('shows the correct item count in the summary', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    expect(getByText(/3 items found/i)).toBeTruthy()
  })

  it('shows "3 selected" when all items start selected', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    expect(getByText(/3 selected/i)).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Confirm button label
// ─────────────────────────────────────────────────────────────────────────────

describe('ReceiptConfirmScreen confirm button', () => {
  it('shows "Add 3 Items to Pantry" when all 3 are selected', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    expect(getByText('Add 3 Items to Pantry')).toBeTruthy()
  })

  it('shows "Add 1 Item to Pantry" (singular) when exactly 1 is selected', async () => {
    mockUseRoute.mockReturnValue({
      params: {
        ...DEFAULT_PARAMS,
        items: [
          { ...INITIAL_ITEMS[0], selected: true },
          { ...INITIAL_ITEMS[1], selected: false },
          { ...INITIAL_ITEMS[2], selected: false },
        ],
      },
    })
    const { getByText } = await render(<ReceiptConfirmScreen />)
    expect(getByText('Add 1 Item to Pantry')).toBeTruthy()
  })

  it('shows "No Items Selected" and is disabled when no items are checked', async () => {
    mockUseRoute.mockReturnValue({
      params: {
        ...DEFAULT_PARAMS,
        items: INITIAL_ITEMS.map((i) => ({ ...i, selected: false })),
      },
    })
    const { getByText } = await render(<ReceiptConfirmScreen />)
    expect(getByText('No Items Selected')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Item toggle (individual checkbox)
// ─────────────────────────────────────────────────────────────────────────────

describe('ReceiptConfirmScreen individual toggle', () => {
  it('deselects an item when its row is tapped', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    // All 3 start selected — tap Whole Milk to deselect it
    await fireEvent.press(getByText('Whole Milk'))
    // Button count should drop to 2
    expect(getByText('Add 2 Items to Pantry')).toBeTruthy()
  })

  it('re-selects an item when tapped a second time', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    await fireEvent.press(getByText('Whole Milk'))   // deselect
    await fireEvent.press(getByText('Whole Milk'))   // re-select
    expect(getByText('Add 3 Items to Pantry')).toBeTruthy()
  })

  it('updates the "X selected" counter after toggling', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    await fireEvent.press(getByText('Sourdough Bread'))
    expect(getByText(/2 selected/i)).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Select All / Deselect All toggle
// ─────────────────────────────────────────────────────────────────────────────

describe('ReceiptConfirmScreen toggleAll', () => {
  it('shows "Deselect All" when all items are selected', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    expect(getByText('Deselect All')).toBeTruthy()
  })

  it('deselects all items when "Deselect All" is tapped', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    await fireEvent.press(getByText('Deselect All'))
    expect(getByText('No Items Selected')).toBeTruthy()
  })

  it('shows "Select All" after deselecting all', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    await fireEvent.press(getByText('Deselect All'))
    expect(getByText('Select All')).toBeTruthy()
  })

  it('selects all items when "Select All" is tapped from a partial state', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    // Deselect one item to get to a partial state
    await fireEvent.press(getByText('Whole Milk'))
    expect(getByText('Select All')).toBeTruthy()

    await fireEvent.press(getByText('Select All'))
    expect(getByText('Add 3 Items to Pantry')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Confirm — API call payload
// ─────────────────────────────────────────────────────────────────────────────

describe('ReceiptConfirmScreen confirm API call', () => {
  it('calls confirmReceipt with the receiptId', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    await fireEvent.press(getByText('Add 3 Items to Pantry'))
    await waitFor(() =>
      expect(APIService.confirmReceipt).toHaveBeenCalledWith(
        'receipt-123',
        expect.any(Array)
      )
    )
  })

  it('sends only selected items, with the `selected` field stripped', async () => {
    // Deselect Sourdough Bread — only Whole Milk and Chicken Breast should be sent
    const { getByText } = await render(<ReceiptConfirmScreen />)
    await fireEvent.press(getByText('Sourdough Bread'))
    await fireEvent.press(getByText('Add 2 Items to Pantry'))

    await waitFor(() => {
      const [, payload] = (APIService.confirmReceipt as jest.Mock).mock.calls[0]
      expect(payload).toHaveLength(2)
      // The `selected` field must be stripped before sending to the backend
      expect(payload[0]).not.toHaveProperty('selected')
      expect(payload[1]).not.toHaveProperty('selected')
      // The items that WERE sent should be Whole Milk and Chicken Breast
      expect(payload.map((i: any) => i.item)).toEqual(
        expect.arrayContaining(['Whole Milk', 'Chicken Breast'])
      )
    })
  })

  it('does not call confirmReceipt when no items are selected', async () => {
    mockUseRoute.mockReturnValue({
      params: {
        ...DEFAULT_PARAMS,
        items: INITIAL_ITEMS.map((i) => ({ ...i, selected: false })),
      },
    })
    const { getByText } = await render(<ReceiptConfirmScreen />)
    // The button is disabled — pressing it should be a no-op
    await fireEvent.press(getByText('No Items Selected'))
    // Small delay to catch any unintended async calls
    await new Promise((r) => setTimeout(r, 50))
    expect(APIService.confirmReceipt).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Confirm — success flow
// ─────────────────────────────────────────────────────────────────────────────

describe('ReceiptConfirmScreen successful confirm', () => {
  it('calls refreshItems after a successful confirm', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    await fireEvent.press(getByText('Add 3 Items to Pantry'))
    await waitFor(() => expect(mockRefreshItems).toHaveBeenCalledTimes(1))
  })

  it('navigates to Pantry after a successful confirm', async () => {
    const { getByText } = await render(<ReceiptConfirmScreen />)
    await fireEvent.press(getByText('Add 3 Items to Pantry'))
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('Pantry')
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Confirm — error flow
// ─────────────────────────────────────────────────────────────────────────────

describe('ReceiptConfirmScreen confirm failure', () => {
  it('shows an error alert when confirmReceipt throws', async () => {
    ;(APIService.confirmReceipt as jest.Mock).mockRejectedValue(new Error('Network error'))
    const { getByText } = await render(<ReceiptConfirmScreen />)
    await fireEvent.press(getByText('Add 3 Items to Pantry'))
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Failed to Add Items',
        expect.any(String),
        expect.any(Array)
      )
    )
  })

  it('does not navigate to Pantry when the confirm call fails', async () => {
    ;(APIService.confirmReceipt as jest.Mock).mockRejectedValue(new Error('Server error'))
    const { getByText } = await render(<ReceiptConfirmScreen />)
    await fireEvent.press(getByText('Add 3 Items to Pantry'))
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled())
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
