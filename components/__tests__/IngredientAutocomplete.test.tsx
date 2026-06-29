/**
 * IngredientAutocomplete.test.tsx
 *
 * Tests for the ingredient suggestion component:
 *   - Renders without crashing
 *   - Does not call searchIngredients for short queries (< 2 chars)
 *   - Calls searchIngredients after the 300ms debounce for 2+ char queries
 *   - Fires only one search call when multiple keystrokes happen inside 300ms
 *   - Renders suggestion items returned by searchIngredients
 *   - Renders at most 5 suggestion rows
 *   - Does not crash when searchIngredients returns an empty array
 *   - Tapping a suggestion calls onChangeText with the ingredient name
 *   - Tapping a suggestion calls onSelect with the correct result object
 *   - Tapping a suggestion calls selectIngredient (fire-and-forget)
 *   - Does not call selectIngredient when the suggestion has a null id
 *   - Hides suggestions after one is tapped
 *
 * Timer strategy — selective fake timers + act() advancement:
 *
 *   We fake ONLY setTimeout/clearTimeout (our 300ms debounce). setImmediate,
 *   clearImmediate, and queueMicrotask are left real so React's scheduler
 *   continues working normally.
 *
 *   Every fireEvent call is awaited so that its internal act() scope resolves
 *   completely before the next one starts. This prevents the "overlapping act"
 *   corruption that occurs when three rapid fireEvent.changeText calls each
 *   open a pending async act scope simultaneously.
 *
 *   After firing changeText events, the debounce timer is advanced by wrapping
 *   jest.advanceTimersByTime(350) inside await act(...). React is in test
 *   mode (IS_REACT_ACT_ENVIRONMENT = true), so any setState triggered within
 *   act() flushes synchronously — including passive useEffect hooks and all
 *   downstream microtasks (Promise.then / .finally chains from the mock API).
 *   This means every assertion after the act() call can be synchronous
 *   (getByText instead of findByText).
 */

import React from 'react'
import { render, fireEvent, act } from '@testing-library/react-native'
import IngredientAutocomplete from '../IngredientAutocomplete'
import { APIService } from '../../services/api'

// ── Mock APIService ───────────────────────────────────────────────────────────

jest.mock('../../services/api', () => ({
  APIService: {
    searchIngredients: jest.fn(),
    selectIngredient: jest.fn(),
  },
}))

const mockSearchIngredients = APIService.searchIngredients as jest.Mock
const mockSelectIngredient = APIService.selectIngredient as jest.Mock

// ── Shared test fixtures ──────────────────────────────────────────────────────

const MOCK_SUGGESTIONS = [
  { id: 'uuid-1', ingredient_name: 'Tomatoes',     normalized_name: 'tomatoes',     category: 'produce',    popularity: 100, source: 'cache' },
  { id: 'uuid-2', ingredient_name: 'Tomato Paste',  normalized_name: 'tomato paste', category: 'condiments', popularity: 80,  source: 'cache' },
  { id: 'uuid-3', ingredient_name: 'Tomato Sauce',  normalized_name: 'tomato sauce', category: 'condiments', popularity: 65,  source: 'cache' },
]

// ── Timer setup ───────────────────────────────────────────────────────────────
// Fake ONLY setTimeout/clearTimeout (our 300ms debounce).
// Leave React's scheduler (setImmediate, clearImmediate, queueMicrotask) real
// so jest.advanceTimersByTime() inside act() never fires React's internal
// scheduler callbacks and cannot cause "overlapping act" corruption.

beforeAll(() => {
  jest.useFakeTimers({
    doNotFake: ['setImmediate', 'clearImmediate', 'queueMicrotask'],
  })
})

afterAll(() => {
  jest.useRealTimers()
})

// ── Lifecycle hooks ───────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockSearchIngredients.mockResolvedValue([])
  mockSelectIngredient.mockResolvedValue(undefined)
})

afterEach(async () => {
  // Cancel any pending fake debounce timers so they cannot fire in the next test
  jest.clearAllTimers()
  // Drain real setImmediate passes so React's scheduler completes any pending work
  await new Promise<void>(r => setImmediate(r))
  await new Promise<void>(r => setImmediate(r))
})

// ── Helper: advance the debounce timer inside act() ──────────────────────────
// Fires our fake setTimeout inside a React act() scope. React's test mode
// flushes all state updates, passive effects, and microtasks synchronously
// within the act() call, so assertions after advanceDebounce() are synchronous.
async function advanceDebounce() {
  await act(async () => {
    jest.advanceTimersByTime(350)
  })
}


// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('IngredientAutocomplete rendering', () => {
  it('renders without crashing', async () => {
    const { getByPlaceholderText } = await render(
      <IngredientAutocomplete
        value=""
        onChangeText={jest.fn()}
        onSelect={jest.fn()}
        placeholder="e.g. Whole Milk"
      />
    )
    expect(getByPlaceholderText('e.g. Whole Milk')).toBeTruthy()
  })

  it('renders no suggestions on initial mount', async () => {
    const { queryByText } = await render(
      <IngredientAutocomplete value="" onChangeText={jest.fn()} onSelect={jest.fn()} />
    )
    expect(queryByText('Tomatoes')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Debounce and search trigger
// ─────────────────────────────────────────────────────────────────────────────

describe('IngredientAutocomplete search debounce', () => {
  it('does not call searchIngredients when text is 1 char (below minimum)', async () => {
    const { getByPlaceholderText } = await render(
      <IngredientAutocomplete value="" onChangeText={jest.fn()} onSelect={jest.fn()} placeholder="Search" />
    )
    // text.length < 2 → component skips the timer entirely; no debounce is set
    await fireEvent.changeText(getByPlaceholderText('Search'), 't')
    expect(mockSearchIngredients).not.toHaveBeenCalled()
  })

  it('calls searchIngredients after 300ms debounce when text is 2+ chars', async () => {
    mockSearchIngredients.mockResolvedValue([
      { id: 'uuid-1', ingredient_name: 'Tomatoes', normalized_name: 'tomatoes', category: 'produce', popularity: 100, source: 'cache' },
    ])
    const { getByPlaceholderText, getByText } = await render(
      <IngredientAutocomplete value="" onChangeText={jest.fn()} onSelect={jest.fn()} placeholder="Search" />
    )
    await fireEvent.changeText(getByPlaceholderText('Search'), 'to')
    // Timer not yet fired — no API call yet
    expect(mockSearchIngredients).not.toHaveBeenCalled()
    // Firing the timer inside act() lets React process the full chain
    // (setState → useEffect → API call → setSuggestions) synchronously
    await advanceDebounce()
    expect(getByText('Tomatoes')).toBeTruthy()
    expect(mockSearchIngredients).toHaveBeenCalledWith('to', 10)
  })

  it('fires only one search call when multiple keystrokes happen inside 300ms', async () => {
    mockSearchIngredients.mockResolvedValue([
      { id: 'uuid-1', ingredient_name: 'Tomatoes', normalized_name: 'tomatoes', category: 'produce', popularity: 100, source: 'cache' },
    ])
    const { getByPlaceholderText, getByText } = await render(
      <IngredientAutocomplete value="" onChangeText={jest.fn()} onSelect={jest.fn()} placeholder="Search" />
    )
    // Await each fireEvent so its act() scope closes before the next one starts.
    // Without awaiting, three concurrent async act() scopes trigger React's
    // "overlapping act" warning which corrupts the renderer for subsequent tests.
    await fireEvent.changeText(getByPlaceholderText('Search'), 'to')
    await fireEvent.changeText(getByPlaceholderText('Search'), 'tom')
    await fireEvent.changeText(getByPlaceholderText('Search'), 'toma')
    // Only the last fake timer is still pending (first two were clearTimeout'd)
    await advanceDebounce()
    expect(getByText('Tomatoes')).toBeTruthy()
    expect(mockSearchIngredients).toHaveBeenCalledTimes(1)
    expect(mockSearchIngredients).toHaveBeenCalledWith('toma', 10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suggestions display
// ─────────────────────────────────────────────────────────────────────────────

describe('IngredientAutocomplete suggestions display', () => {
  it('renders suggestion items returned by searchIngredients', async () => {
    mockSearchIngredients.mockResolvedValue(MOCK_SUGGESTIONS)
    const { getByPlaceholderText, getByText } = await render(
      <IngredientAutocomplete value="" onChangeText={jest.fn()} onSelect={jest.fn()} placeholder="Search" />
    )
    await fireEvent.changeText(getByPlaceholderText('Search'), 'tom')
    await advanceDebounce()
    expect(getByText('Tomatoes')).toBeTruthy()
    expect(getByText('Tomato Paste')).toBeTruthy()
  })

  it('renders at most 5 suggestion rows even when the API returns more', async () => {
    const manySuggestions = Array.from({ length: 8 }, (_, i) => ({
      id: `uuid-${i}`,
      ingredient_name: `Ingredient ${i}`,
      normalized_name: `ingredient ${i}`,
      category: 'produce',
      popularity: 100 - i,
      source: 'cache',
    }))
    mockSearchIngredients.mockResolvedValue(manySuggestions)
    const { getByPlaceholderText, getAllByText } = await render(
      <IngredientAutocomplete value="" onChangeText={jest.fn()} onSelect={jest.fn()} placeholder="Search" />
    )
    await fireEvent.changeText(getByPlaceholderText('Search'), 'in')
    await advanceDebounce()
    const items = getAllByText(/Ingredient \d/)
    expect(items.length).toBeLessThanOrEqual(5)
  })

  it('does not crash when searchIngredients resolves with an empty array', async () => {
    mockSearchIngredients.mockResolvedValue([])
    const { getByPlaceholderText, queryByText } = await render(
      <IngredientAutocomplete value="" onChangeText={jest.fn()} onSelect={jest.fn()} placeholder="Search" />
    )
    await fireEvent.changeText(getByPlaceholderText('Search'), 'xyz')
    await advanceDebounce()
    // advanceDebounce flushes the full chain including setLoading(false) from
    // the .finally(), so we can assert synchronously — no waitFor needed
    expect(mockSearchIngredients).toHaveBeenCalledWith('xyz', 10)
    expect(queryByText('Tomatoes')).toBeNull()
    expect(getByPlaceholderText('Search')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Selecting a suggestion
// ─────────────────────────────────────────────────────────────────────────────

describe('IngredientAutocomplete suggestion selection', () => {
  /**
   * Renders the component, types a query, fires the debounce inside act(), and
   * returns the render result once suggestions are visible. All assertions after
   * calling this helper can be synchronous.
   */
  async function renderWithSuggestions(overrides?: { onChangeText?: jest.Mock; onSelect?: jest.Mock }) {
    mockSearchIngredients.mockResolvedValue(MOCK_SUGGESTIONS)
    const result = await render(
      <IngredientAutocomplete
        value=""
        onChangeText={overrides?.onChangeText ?? jest.fn()}
        onSelect={overrides?.onSelect ?? jest.fn()}
        placeholder="Search"
      />
    )
    await fireEvent.changeText(result.getByPlaceholderText('Search'), 'tom')
    await advanceDebounce()
    // Suggestions are now rendered — verify before returning to the test
    expect(result.getByText('Tomatoes')).toBeTruthy()
    return result
  }

  it('calls onChangeText with the ingredient name when a suggestion is tapped', async () => {
    const mockOnChangeText = jest.fn()
    const { getByText } = await renderWithSuggestions({ onChangeText: mockOnChangeText })
    await fireEvent.press(getByText('Tomatoes'))
    expect(mockOnChangeText).toHaveBeenCalledWith('Tomatoes')
  })

  it('calls onSelect with the full result object when a suggestion is tapped', async () => {
    const mockOnSelect = jest.fn()
    const { getByText } = await renderWithSuggestions({ onSelect: mockOnSelect })
    await fireEvent.press(getByText('Tomatoes'))
    expect(mockOnSelect).toHaveBeenCalledTimes(1)
    expect(mockOnSelect).toHaveBeenCalledWith(MOCK_SUGGESTIONS[0])
  })

  it('calls selectIngredient with the suggestion id when tapped', async () => {
    const { getByText } = await renderWithSuggestions()
    await fireEvent.press(getByText('Tomatoes'))
    expect(mockSelectIngredient).toHaveBeenCalledWith('uuid-1')
  })

  it('does not call selectIngredient when the suggestion has a null id', async () => {
    mockSearchIngredients.mockResolvedValue([{ ...MOCK_SUGGESTIONS[0], id: null }])
    const { getByPlaceholderText, getByText } = await render(
      <IngredientAutocomplete value="" onChangeText={jest.fn()} onSelect={jest.fn()} placeholder="Search" />
    )
    await fireEvent.changeText(getByPlaceholderText('Search'), 'tom')
    await advanceDebounce()
    await fireEvent.press(getByText('Tomatoes'))
    expect(mockSelectIngredient).not.toHaveBeenCalled()
  })

  it('hides suggestions after one is tapped', async () => {
    const { getByText, queryByText } = await renderWithSuggestions()
    await fireEvent.press(getByText('Tomatoes'))
    expect(queryByText('Tomato Paste')).toBeNull()
  })
})
