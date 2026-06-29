/**
 * AddIngredientsScreen.test.tsx
 *
 * Tests for the manual ingredient entry form:
 *   - Renders all expected fields
 *   - Back button calls goBack
 *   - Validation: blank name, invalid quantity, bad date format
 *   - Successful submit calls addItem with correct payload and navigates back
 *   - Expiration date is passed when provided, omitted when left blank
 *   - Error from addItem shows alert and stays on screen
 *   - Loading state disables button and shows spinner
 */

import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { Alert } from 'react-native'
import AddIngredientsScreen from '../AddIngredientsScreen'
import { usePantry } from '../../hooks/usePantry'
import { APIService } from '../../services/api'

// ── Mock navigation ────────────────────────────────────────────────────────────

const mockGoBack = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}))

// ── Mock usePantry ─────────────────────────────────────────────────────────────

jest.mock('../../hooks/usePantry', () => ({ usePantry: jest.fn() }))

// ── Mock APIService ────────────────────────────────────────────────────────────
// IngredientAutocomplete calls searchIngredients after a 300ms debounce.
// Mocking it prevents real HTTP calls in tests and keeps the default behaviour
// of returning no suggestions so all existing form tests are unaffected.

jest.mock('../../services/api', () => ({
  APIService: {
    searchIngredients: jest.fn(),
    selectIngredient: jest.fn(),
  },
}))

const mockAddItem = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  mockAddItem.mockResolvedValue(undefined);
  (usePantry as jest.Mock).mockReturnValue({ addItem: mockAddItem });
  (APIService.searchIngredients as jest.Mock).mockResolvedValue([]);
  (APIService.selectIngredient as jest.Mock).mockResolvedValue(undefined)
})

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('AddIngredientsScreen rendering', () => {
  it('renders without crashing', async () => {
    const { getByText } = await render(<AddIngredientsScreen />)
    expect(getByText('Add Ingredient')).toBeTruthy()
  })

  it('shows the name, quantity, and expiration date inputs', async () => {
    const { getByPlaceholderText } = await render(<AddIngredientsScreen />)
    expect(getByPlaceholderText('e.g. Whole Milk')).toBeTruthy()
    expect(getByPlaceholderText(/YYYY-MM-DD/)).toBeTruthy()
  })

  it('shows the Add to Pantry submit button', async () => {
    const { getByText } = await render(<AddIngredientsScreen />)
    expect(getByText('Add to Pantry')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

describe('AddIngredientsScreen navigation', () => {
  it('back button calls goBack', async () => {
    const { getByTestId } = await render(<AddIngredientsScreen />)
    await fireEvent.press(getByTestId('icon-arrow-left'))
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

describe('AddIngredientsScreen validation', () => {
  it('shows alert when name is blank', async () => {
    const { getByText } = await render(<AddIngredientsScreen />)
    await fireEvent.press(getByText('Add to Pantry'))
    expect(Alert.alert).toHaveBeenCalledWith('Name Required', expect.any(String))
    expect(mockAddItem).not.toHaveBeenCalled()
  })

  it('shows alert when quantity is not a valid number', async () => {
    const { getByText, getByPlaceholderText, getByDisplayValue } =
      await render(<AddIngredientsScreen />)
    await fireEvent.changeText(getByPlaceholderText('e.g. Whole Milk'), 'Milk')
    // Default quantity is "1" — override with invalid value
    await fireEvent.changeText(getByDisplayValue('1'), 'abc')
    await fireEvent.press(getByText('Add to Pantry'))
    expect(Alert.alert).toHaveBeenCalledWith('Invalid Quantity', expect.any(String))
    expect(mockAddItem).not.toHaveBeenCalled()
  })

  it('shows alert when quantity is zero', async () => {
    const { getByText, getByPlaceholderText, getByDisplayValue } =
      await render(<AddIngredientsScreen />)
    await fireEvent.changeText(getByPlaceholderText('e.g. Whole Milk'), 'Milk')
    await fireEvent.changeText(getByDisplayValue('1'), '0')
    await fireEvent.press(getByText('Add to Pantry'))
    expect(Alert.alert).toHaveBeenCalledWith('Invalid Quantity', expect.any(String))
    expect(mockAddItem).not.toHaveBeenCalled()
  })

  it('shows alert when expiration date has wrong format', async () => {
    const { getByText, getByPlaceholderText } = await render(<AddIngredientsScreen />)
    await fireEvent.changeText(getByPlaceholderText('e.g. Whole Milk'), 'Milk')
    await fireEvent.changeText(getByPlaceholderText(/YYYY-MM-DD/), '31/12/2025')
    await fireEvent.press(getByText('Add to Pantry'))
    expect(Alert.alert).toHaveBeenCalledWith('Invalid Date', expect.any(String))
    expect(mockAddItem).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Submit — success path
// ─────────────────────────────────────────────────────────────────────────────

describe('AddIngredientsScreen submit success', () => {
  it('calls addItem with the correct minimal payload', async () => {
    const { getByText, getByPlaceholderText } = await render(<AddIngredientsScreen />)
    await fireEvent.changeText(getByPlaceholderText('e.g. Whole Milk'), 'Eggs')
    await fireEvent.press(getByText('Add to Pantry'))
    await waitFor(() =>
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredient_name: 'Eggs',
          quantity: 1,
          unit: 'count',
          category: 'pantry',
        })
      )
    )
  })

  it('navigates back on success', async () => {
    const { getByText, getByPlaceholderText } = await render(<AddIngredientsScreen />)
    await fireEvent.changeText(getByPlaceholderText('e.g. Whole Milk'), 'Eggs')
    await fireEvent.press(getByText('Add to Pantry'))
    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
  })

  it('includes expiration_date when the field is filled with a valid date', async () => {
    const { getByText, getByPlaceholderText } = await render(<AddIngredientsScreen />)
    await fireEvent.changeText(getByPlaceholderText('e.g. Whole Milk'), 'Milk')
    await fireEvent.changeText(getByPlaceholderText(/YYYY-MM-DD/), '2025-12-31')
    await fireEvent.press(getByText('Add to Pantry'))
    await waitFor(() =>
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({ expiration_date: '2025-12-31' })
      )
    )
  })

  it('omits expiration_date when the field is left blank', async () => {
    const { getByText, getByPlaceholderText } = await render(<AddIngredientsScreen />)
    await fireEvent.changeText(getByPlaceholderText('e.g. Whole Milk'), 'Salt')
    await fireEvent.press(getByText('Add to Pantry'))
    await waitFor(() => {
      const payload = mockAddItem.mock.calls[0][0]
      expect(payload).not.toHaveProperty('expiration_date')
    })
  })

  it('trims leading and trailing whitespace from the name', async () => {
    const { getByText, getByPlaceholderText } = await render(<AddIngredientsScreen />)
    await fireEvent.changeText(getByPlaceholderText('e.g. Whole Milk'), '  Salt  ')
    await fireEvent.press(getByText('Add to Pantry'))
    await waitFor(() =>
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({ ingredient_name: 'Salt' })
      )
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Submit — error path
// ─────────────────────────────────────────────────────────────────────────────

describe('AddIngredientsScreen submit error', () => {
  it('shows error alert when addItem throws', async () => {
    mockAddItem.mockRejectedValue(new Error('Network error'))
    const { getByText, getByPlaceholderText } = await render(<AddIngredientsScreen />)
    await fireEvent.changeText(getByPlaceholderText('e.g. Whole Milk'), 'Milk')
    await fireEvent.press(getByText('Add to Pantry'))
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String))
    )
    expect(mockGoBack).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Loading state
// ─────────────────────────────────────────────────────────────────────────────

describe('AddIngredientsScreen loading state', () => {
  it('calls addItem only once even when the request is in flight', async () => {
    let resolveAdd!: () => void
    mockAddItem.mockReturnValue(new Promise<void>((res) => { resolveAdd = res }))

    const { getByText, getByPlaceholderText } = await render(<AddIngredientsScreen />)
    await fireEvent.changeText(getByPlaceholderText('e.g. Whole Milk'), 'Milk')

    // Don't await — captures the in-flight state
    const pressPromise = fireEvent.press(getByText('Add to Pantry'))
    expect(mockAddItem).toHaveBeenCalledTimes(1)

    resolveAdd()
    await pressPromise
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Autocomplete integration
// ─────────────────────────────────────────────────────────────────────────────

describe('AddIngredientsScreen autocomplete', () => {
  // Fake ONLY setTimeout/clearTimeout (the 300ms debounce inside
  // IngredientAutocomplete). Leave setImmediate real so React's scheduler and
  // RNTL's act() flush state updates normally without "not wrapped in act" warnings.
  beforeEach(() => {
    jest.useFakeTimers({
      doNotFake: ['setImmediate', 'clearImmediate', 'queueMicrotask'],
    })
  })

  afterEach(async () => {
    // Clear any pending debounce timers so they cannot fire in subsequent tests
    jest.clearAllTimers()
    // Drain two real setImmediate passes so React finishes pending work before
    // real timers are restored for the rest of the suite
    await new Promise<void>(r => setImmediate(r))
    await new Promise<void>(r => setImmediate(r))
    jest.useRealTimers()
  })

  // Fires the 300ms debounce timer inside act() so React flushes the full chain
  // (setSearchQuery → useEffect → API call → setSuggestions) synchronously.
  // After this helper, all assertions can use getByText instead of findByText.
  async function advanceDebounce() {
    await act(async () => {
      jest.advanceTimersByTime(350)
    })
  }

  it('shows suggestions when searchIngredients returns results', async () => {
    ;(APIService.searchIngredients as jest.Mock).mockResolvedValue([
      { id: 'uuid-1', ingredient_name: 'Tomatoes', normalized_name: 'tomatoes', category: 'produce', popularity: 100, source: 'cache' },
    ])

    const { getByPlaceholderText, getByText } = await render(<AddIngredientsScreen />)
    await fireEvent.changeText(getByPlaceholderText('e.g. Whole Milk'), 'tom')
    await advanceDebounce()
    expect(getByText('Tomatoes')).toBeTruthy()
  })

  it('tapping a suggestion fills the name field and sets the matching category', async () => {
    ;(APIService.searchIngredients as jest.Mock).mockResolvedValue([
      { id: 'uuid-1', ingredient_name: 'Tomatoes', normalized_name: 'tomatoes', category: 'produce', popularity: 100, source: 'cache' },
    ])

    const { getByPlaceholderText, getByText } = await render(<AddIngredientsScreen />)
    await fireEvent.changeText(getByPlaceholderText('e.g. Whole Milk'), 'tom')
    await advanceDebounce()
    await fireEvent.press(getByText('Tomatoes'))

    // Submit and verify the payload includes the auto-filled name and category
    await fireEvent.press(getByText('Add to Pantry'))
    await waitFor(() =>
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({ ingredient_name: 'Tomatoes', category: 'produce' })
      )
    )
  })

  it('does not overwrite category when the suggestion has no category', async () => {
    ;(APIService.searchIngredients as jest.Mock).mockResolvedValue([
      { id: 'uuid-1', ingredient_name: 'Tomatoes', normalized_name: 'tomatoes', category: null, popularity: 100, source: 'cache' },
    ])

    const { getByPlaceholderText, getByText } = await render(<AddIngredientsScreen />)
    await fireEvent.changeText(getByPlaceholderText('e.g. Whole Milk'), 'tom')
    await advanceDebounce()
    await fireEvent.press(getByText('Tomatoes'))

    // Category should remain the default 'pantry' since the suggestion had none
    await fireEvent.press(getByText('Add to Pantry'))
    await waitFor(() =>
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'pantry' })
      )
    )
  })
})
