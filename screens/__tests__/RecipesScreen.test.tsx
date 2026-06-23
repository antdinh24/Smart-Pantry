/**
 * RecipesScreen.test.tsx
 *
 * Tests for the Recipes screen: loading/error/empty states, recipe card
 * rendering, the AI generation flow (guest gate, empty pantry guard, success),
 * sort chip interaction, and "View Recipe" navigation.
 *
 * Mocking strategy:
 *   - useRecipes() — controls loading/error/generating/recipe list
 *   - usePantry()  — controls pantry item count (needed for generation guard)
 *   - useAuth()    — controls isGuest flag (guest gate)
 *   - useNavigation() — captures navigate() calls
 *
 * RNTL v14 quirks:
 *   - render() is async → must be awaited
 *   - fireEvent.press is async → must be awaited
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import RecipesScreen from '../RecipesScreen'
import { useRecipes } from '../../hooks/useRecipes'
import { usePantry } from '../../hooks/usePantry'
import { useAuth } from '../../contexts/AuthContext'

// ── Mock navigation ───────────────────────────────────────────────────────────

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}))

// ── Mock hooks ────────────────────────────────────────────────────────────────

jest.mock('../../hooks/useRecipes', () => ({ useRecipes: jest.fn() }))
jest.mock('../../hooks/usePantry', () => ({ usePantry: jest.fn() }))
jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeRecipe = (overrides: Record<string, any> = {}) => ({
  id: 'r-1',
  title: 'Pasta Carbonara',
  description: 'A classic Italian pasta dish',
  match_percentage: 75,
  prep_time_minutes: 10,
  cook_time_minutes: 20,
  difficulty: 'easy',
  cuisine_type: 'Italian',
  ...overrides,
})

const makePantryItem = (name: string) => ({
  id: 'p-1',
  ingredient_name: name,
  quantity: 1,
  unit: 'count',
  category: 'produce',
  expiration_date: null,
})

// ── Default mock values (overridden per-test as needed) ───────────────────────

const mockGenerateRecipe = jest.fn()
const mockGetFilteredRecipes = jest.fn()

beforeEach(() => {
  jest.clearAllMocks();

  (useRecipes as jest.Mock).mockReturnValue({
    loading: false,
    error: null,
    generating: false,
    generateRecipe: mockGenerateRecipe,
    getFilteredRecipes: mockGetFilteredRecipes,
  });

  (usePantry as jest.Mock).mockReturnValue({ items: [] });

  (useAuth as jest.Mock).mockReturnValue({ isGuest: false, signOut: jest.fn() })

  mockGetFilteredRecipes.mockReturnValue([])
  mockGenerateRecipe.mockResolvedValue(undefined)
})

// ─────────────────────────────────────────────────────────────────────────────
// Loading state
// ─────────────────────────────────────────────────────────────────────────────

describe('RecipesScreen loading state', () => {
  it('shows a spinner and loading text while recipes are fetching', async () => {
    (useRecipes as jest.Mock).mockReturnValue({
      loading: true,
      error: null,
      generating: false,
      generateRecipe: mockGenerateRecipe,
      getFilteredRecipes: mockGetFilteredRecipes.mockReturnValue([]),
    })
    const { getByText } = await render(<RecipesScreen />)
    expect(getByText('Loading recipes…')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Error state
// ─────────────────────────────────────────────────────────────────────────────

describe('RecipesScreen error state', () => {
  it('shows the error message when the fetch fails', async () => {
    (useRecipes as jest.Mock).mockReturnValue({
      loading: false,
      error: 'Could not load recipes',
      generating: false,
      generateRecipe: mockGenerateRecipe,
      getFilteredRecipes: mockGetFilteredRecipes.mockReturnValue([]),
    })
    const { getByText } = await render(<RecipesScreen />)
    expect(getByText('Could not load recipes')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

describe('RecipesScreen empty state', () => {
  it('shows "No recipes yet" when the recipe list is empty', async () => {
    mockGetFilteredRecipes.mockReturnValue([])
    const { getByText } = await render(<RecipesScreen />)
    expect(getByText('No recipes yet')).toBeTruthy()
  })

  it('shows the hint to add pantry items', async () => {
    mockGetFilteredRecipes.mockReturnValue([])
    const { getByText } = await render(<RecipesScreen />)
    expect(getByText(/Add items to your pantry/i)).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Recipe cards
// ─────────────────────────────────────────────────────────────────────────────

describe('RecipesScreen recipe cards', () => {
  beforeEach(() => {
    mockGetFilteredRecipes.mockReturnValue([makeRecipe()])
  })

  it('renders the recipe title', async () => {
    const { getByText } = await render(<RecipesScreen />)
    expect(getByText('Pasta Carbonara')).toBeTruthy()
  })

  it('shows the match percentage badge', async () => {
    const { getByText } = await render(<RecipesScreen />)
    expect(getByText('75% Match')).toBeTruthy()
  })

  it('shows combined prep + cook time', async () => {
    const { getByText } = await render(<RecipesScreen />)
    expect(getByText('30 min')).toBeTruthy()
  })

  it('shows "? min" when both time fields are null', async () => {
    mockGetFilteredRecipes.mockReturnValue([
      makeRecipe({ prep_time_minutes: null, cook_time_minutes: null }),
    ])
    const { getByText } = await render(<RecipesScreen />)
    expect(getByText('? min')).toBeTruthy()
  })

  it('renders a "View Recipe" button for each recipe', async () => {
    mockGetFilteredRecipes.mockReturnValue([makeRecipe(), makeRecipe({ id: 'r-2', title: 'Omelette' })])
    const { getAllByText } = await render(<RecipesScreen />)
    expect(getAllByText('View Recipe')).toHaveLength(2)
  })

  it('navigates to RecipeDetail when "View Recipe" is tapped', async () => {
    const recipe = makeRecipe({ id: 'r-99', title: 'My Recipe' })
    mockGetFilteredRecipes.mockReturnValue([recipe])
    const { getByText } = await render(<RecipesScreen />)
    await fireEvent.press(getByText('View Recipe'))
    expect(mockNavigate).toHaveBeenCalledWith('RecipeDetail', {
      recipeId: 'r-99',
      title: 'My Recipe',
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Create Recipe — disabled when pantry is empty
// ─────────────────────────────────────────────────────────────────────────────

describe('RecipesScreen "Create Recipe" disabled state', () => {
  it('disables the button and shows "Add pantry items first" when pantry is empty', async () => {
    (usePantry as jest.Mock).mockReturnValue({ items: [] })
    const { getByText } = await render(<RecipesScreen />)
    expect(getByText('Add pantry items first')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Create Recipe — guest gate
// ─────────────────────────────────────────────────────────────────────────────

describe('RecipesScreen guest gate', () => {
  it('shows "Account Required" alert when a guest taps Create Recipe', async () => {
    (useAuth as jest.Mock).mockReturnValue({ isGuest: true, signOut: jest.fn() });
    (usePantry as jest.Mock).mockReturnValue({ items: [makePantryItem('Eggs')] })
    const { getByText } = await render(<RecipesScreen />)
    await fireEvent.press(getByText('Create Recipe'))
    expect(Alert.alert).toHaveBeenCalledWith(
      'Account Required',
      expect.stringContaining('free account'),
      expect.any(Array)
    )
  })

  it('does not call generateRecipe when guest gate blocks execution', async () => {
    (useAuth as jest.Mock).mockReturnValue({ isGuest: true, signOut: jest.fn() });
    (usePantry as jest.Mock).mockReturnValue({ items: [makePantryItem('Eggs')] })
    const { getByText } = await render(<RecipesScreen />)
    await fireEvent.press(getByText('Create Recipe'))
    expect(mockGenerateRecipe).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Create Recipe — successful generation
// ─────────────────────────────────────────────────────────────────────────────

describe('RecipesScreen recipe generation', () => {
  const pantryItems = [
    makePantryItem('Eggs'),
    makePantryItem('Butter'),
    makePantryItem('Flour'),
  ]

  beforeEach(() => {
    (usePantry as jest.Mock).mockReturnValue({ items: pantryItems })
  })

  it('calls generateRecipe with the ingredient names from the pantry', async () => {
    const { getByText } = await render(<RecipesScreen />)
    await fireEvent.press(getByText('Create Recipe'))
    await waitFor(() =>
      expect(mockGenerateRecipe).toHaveBeenCalledWith(['Eggs', 'Butter', 'Flour'])
    )
  })

  it('shows an alert when generation fails', async () => {
    mockGenerateRecipe.mockRejectedValue(new Error('Server error'))
    const { getByText } = await render(<RecipesScreen />)
    await fireEvent.press(getByText('Create Recipe'))
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Generation Failed',
        expect.any(String)
      )
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Sort chips
// ─────────────────────────────────────────────────────────────────────────────

describe('RecipesScreen sort chips', () => {
  beforeEach(() => {
    mockGetFilteredRecipes.mockReturnValue([makeRecipe()])
  })

  it('shows Match, Time, and Name sort chips when recipes are present', async () => {
    const { getByText } = await render(<RecipesScreen />)
    expect(getByText('Match')).toBeTruthy()
    expect(getByText('Time')).toBeTruthy()
    expect(getByText('Name')).toBeTruthy()
  })

  it('calls getFilteredRecipes with "time" when Time chip is tapped', async () => {
    const { getByText } = await render(<RecipesScreen />)
    await fireEvent.press(getByText('Time'))
    // getFilteredRecipes is called on render — the last call should use 'time'
    const calls = mockGetFilteredRecipes.mock.calls
    expect(calls[calls.length - 1][0]).toBe('time')
  })

  it('calls getFilteredRecipes with "name" when Name chip is tapped', async () => {
    const { getByText } = await render(<RecipesScreen />)
    await fireEvent.press(getByText('Name'))
    const calls = mockGetFilteredRecipes.mock.calls
    expect(calls[calls.length - 1][0]).toBe('name')
  })

  it('does not show sort chips when recipe list is empty', async () => {
    mockGetFilteredRecipes.mockReturnValue([])
    const { queryByText } = await render(<RecipesScreen />)
    expect(queryByText('Match')).toBeNull()
  })
})
