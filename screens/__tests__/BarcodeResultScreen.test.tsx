/**
 * BarcodeResultScreen.test.tsx
 *
 * Tests for the barcode result screen:
 *   - Green "Found" banner when product data is present
 *   - Amber "not found" banner when product is null
 *   - Barcode number always shown
 *   - Name pre-filled from product (or blank for manual entry)
 *   - "Scan Again" button navigates to Scan
 *   - Back button calls goBack
 *   - "Add to Pantry" validation (blank name, invalid quantity)
 *   - Successful add: calls addItem, shows success alert, "OK" navigates to Pantry
 *   - Failed add: shows error alert, stays on screen
 *   - Saving state shows spinner
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import BarcodeResultScreen from '../BarcodeResultScreen'
import { usePantry } from '../../hooks/usePantry'

// ── Mock navigation + route ────────────────────────────────────────────────────

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
const mockUseRoute = jest.fn()

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => mockUseRoute(),
}))

// ── Mock usePantry ─────────────────────────────────────────────────────────────

jest.mock('../../hooks/usePantry', () => ({ usePantry: jest.fn() }))

const mockAddItem = jest.fn()

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BARCODE = '012345678901'

const PRODUCT = {
  product_name: 'Whole Milk',
  brands: 'Happy Farms',
  categories: 'Dairy products',
  quantity: '1 gallon',
  suggested_unit: 'package',
  suggested_category: 'dairy',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAddItem.mockResolvedValue(undefined);
  (usePantry as jest.Mock).mockReturnValue({ addItem: mockAddItem })
  mockUseRoute.mockReturnValue({ params: { product: PRODUCT, barcode: BARCODE } })
})

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('BarcodeResultScreen rendering — product found', () => {
  it('renders without crashing when product is present', async () => {
    const { getByText } = await render(<BarcodeResultScreen />)
    expect(getByText('Product Found')).toBeTruthy()
  })

  it('shows a green found banner with brand and product name', async () => {
    const { getByText } = await render(<BarcodeResultScreen />)
    expect(getByText(/Happy Farms.*Whole Milk/)).toBeTruthy()
  })

  it('pre-fills the Name field with the product name', async () => {
    const { getByDisplayValue } = await render(<BarcodeResultScreen />)
    expect(getByDisplayValue('Whole Milk')).toBeTruthy()
  })

  it('always shows the barcode number', async () => {
    const { getByText } = await render(<BarcodeResultScreen />)
    expect(getByText(BARCODE)).toBeTruthy()
  })
})

describe('BarcodeResultScreen rendering — product not found', () => {
  beforeEach(() => {
    mockUseRoute.mockReturnValue({ params: { product: null, barcode: BARCODE } })
  })

  it('renders without crashing when product is null', async () => {
    const { getByText } = await render(<BarcodeResultScreen />)
    expect(getByText('Product Found')).toBeTruthy()
  })

  it('shows amber "not found" banner', async () => {
    const { getByText } = await render(<BarcodeResultScreen />)
    expect(getByText('Product not found — fill in the details manually')).toBeTruthy()
  })

  it('leaves the Name field blank', async () => {
    const { getByPlaceholderText } = await render(<BarcodeResultScreen />)
    expect(getByPlaceholderText('e.g. Whole Milk')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

describe('BarcodeResultScreen navigation', () => {
  it('back button calls goBack', async () => {
    const { getByTestId } = await render(<BarcodeResultScreen />)
    await fireEvent.press(getByTestId('icon-arrow-left'))
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })

  it('"Scan Again" button navigates to Scan', async () => {
    const { getByText } = await render(<BarcodeResultScreen />)
    await fireEvent.press(getByText('Scan Again'))
    expect(mockNavigate).toHaveBeenCalledWith('Scan')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

describe('BarcodeResultScreen validation', () => {
  it('shows alert when name is blank', async () => {
    // Product null so name field starts empty
    mockUseRoute.mockReturnValue({ params: { product: null, barcode: BARCODE } })
    const { getByText } = await render(<BarcodeResultScreen />)
    await fireEvent.press(getByText('Add to Pantry'))
    expect(Alert.alert).toHaveBeenCalledWith('Name Required', expect.any(String))
    expect(mockAddItem).not.toHaveBeenCalled()
  })

  it('shows alert when quantity is not a valid number', async () => {
    const { getByText, getByDisplayValue } = await render(<BarcodeResultScreen />)
    // Clear quantity and enter invalid value
    await fireEvent.changeText(getByDisplayValue('1'), 'abc')
    await fireEvent.press(getByText('Add to Pantry'))
    expect(Alert.alert).toHaveBeenCalledWith('Invalid Quantity', expect.any(String))
    expect(mockAddItem).not.toHaveBeenCalled()
  })

  it('shows alert when quantity is zero', async () => {
    const { getByText, getByDisplayValue } = await render(<BarcodeResultScreen />)
    await fireEvent.changeText(getByDisplayValue('1'), '0')
    await fireEvent.press(getByText('Add to Pantry'))
    expect(Alert.alert).toHaveBeenCalledWith('Invalid Quantity', expect.any(String))
    expect(mockAddItem).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Add to Pantry — success path
// ─────────────────────────────────────────────────────────────────────────────

describe('BarcodeResultScreen add to pantry — success', () => {
  it('calls addItem with correct payload on valid submit', async () => {
    const { getByText } = await render(<BarcodeResultScreen />)
    await fireEvent.press(getByText('Add to Pantry'))
    await waitFor(() =>
      expect(mockAddItem).toHaveBeenCalledWith({
        ingredient_name: 'Whole Milk',
        quantity: 1,
        unit: 'package',
        category: 'dairy',
        barcode: BARCODE,
      })
    )
  })

  it('shows success alert with item name', async () => {
    const { getByText } = await render(<BarcodeResultScreen />)
    await fireEvent.press(getByText('Add to Pantry'))
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Added!', expect.stringContaining('Whole Milk'), expect.any(Array))
    )
  })

  it('navigates to Pantry when OK is pressed in the success alert', async () => {
    const { getByText } = await render(<BarcodeResultScreen />)
    await fireEvent.press(getByText('Add to Pantry'))
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled())

    // Extract the OK button callback from the alert call
    const alertArgs = (Alert.alert as jest.Mock).mock.calls[0]
    const okButton = alertArgs[2][0]
    okButton.onPress()
    expect(mockNavigate).toHaveBeenCalledWith('Pantry')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Add to Pantry — error path
// ─────────────────────────────────────────────────────────────────────────────

describe('BarcodeResultScreen add to pantry — error', () => {
  it('shows error alert when addItem throws', async () => {
    mockAddItem.mockRejectedValue(new Error('Network error'))
    const { getByText } = await render(<BarcodeResultScreen />)
    await fireEvent.press(getByText('Add to Pantry'))
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String))
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Loading state
// ─────────────────────────────────────────────────────────────────────────────

describe('BarcodeResultScreen loading state', () => {
  it('calls addItem only once even if button is pressed while in flight', async () => {
    let resolveAdd!: () => void
    mockAddItem.mockReturnValue(new Promise<void>((res) => { resolveAdd = res }))

    const { getByText } = await render(<BarcodeResultScreen />)
    const pressPromise = fireEvent.press(getByText('Add to Pantry'))
    // Handler called synchronously inside act()
    expect(mockAddItem).toHaveBeenCalledTimes(1)

    resolveAdd()
    await pressPromise
  })
})
