/**
 * RecipeDetailScreen.test.tsx
 *
 * Tests for the recipe detail screen:
 *   - Loading spinner shown while API call is in flight
 *   - Header title shown immediately (before fetch completes)
 *   - Generic error state when the API rejects
 *   - 404-specific error message
 *   - "Try Again" button re-triggers the fetch
 *   - Back button calls goBack in all states
 *   - Loaded state: title, description, match %, difficulty, cuisine, timing
 *   - Loaded state: ingredients list rendered
 *   - Loaded state: instructions list rendered
 *   - Loaded state: nutritional info shown when present
 *   - Loaded state: AI disclaimer shown when is_ai_generated = true
 *   - Loaded state: AI disclaimer hidden when is_ai_generated = false
 *   - Graceful handling of missing ingredient/instruction lists
 */

import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import RecipeDetailScreen from '../RecipeDetailScreen'

// ── Mock APIService (default export) ─────────────────────────────────────────

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { getRecipe: jest.fn() },
}))

import APIService from '../../services/api'
const mockGetRecipe = APIService.getRecipe as jest.Mock

// ── Mock navigation + route ────────────────────────────────────────────────────

const mockGoBack = jest.fn()
const mockUseRoute = jest.fn()

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => mockUseRoute(),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RECIPE_ID = 'recipe-uuid-001'
const RECIPE_TITLE = 'Spaghetti Carbonara'

const MOCK_RECIPE = {
  id: RECIPE_ID,
  title: RECIPE_TITLE,
  description: 'A classic Italian pasta dish.',
  match_percentage: 85,
  difficulty: 'medium',
  cuisine_type: 'Italian',
  prep_time_minutes: 15,
  cook_time_minutes: 30,
  servings: 4,
  ingredient_list: [
    { name: 'Spaghetti', quantity: 200, unit: 'g' },
    { name: 'Eggs', quantity: 3, unit: null },
  ],
  instructions: [
    { step: 1, text: 'Boil water and cook pasta.' },
    { step: 2, text: 'Whisk eggs with cheese.' },
  ],
  nutritional_info: { calories: '450', protein: '20g' },
  is_ai_generated: true,
  user_id: null,
  meal_type: null,
  is_public: true,
  usage_count: 0,
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetRecipe.mockResolvedValue(MOCK_RECIPE)
  mockUseRoute.mockReturnValue({ params: { recipeId: RECIPE_ID, title: RECIPE_TITLE } })
})

// ─────────────────────────────────────────────────────────────────────────────
// Loading state
// ─────────────────────────────────────────────────────────────────────────────

describe('RecipeDetailScreen loading state', () => {
  it('shows loading spinner and "Loading recipe…" while fetching', async () => {
    // Keep the promise unresolved to hold the loading state
    let resolveRecipe!: (r: typeof MOCK_RECIPE) => void
    mockGetRecipe.mockReturnValue(
      new Promise<typeof MOCK_RECIPE>((res) => { resolveRecipe = res })
    )

    const { getByText } = await render(<RecipeDetailScreen />)
    expect(getByText('Loading recipe…')).toBeTruthy()

    // Clean up the pending promise
    await act(async () => { resolveRecipe(MOCK_RECIPE) })
  })

  it('shows the recipe title in the header even while loading', async () => {
    let resolveRecipe!: (r: typeof MOCK_RECIPE) => void
    mockGetRecipe.mockReturnValue(
      new Promise<typeof MOCK_RECIPE>((res) => { resolveRecipe = res })
    )

    const { getAllByText } = await render(<RecipeDetailScreen />)
    expect(getAllByText(RECIPE_TITLE).length).toBeGreaterThanOrEqual(1)

    await act(async () => { resolveRecipe(MOCK_RECIPE) })
  })

  it('back button calls goBack while in loading state', async () => {
    let resolveRecipe!: (r: typeof MOCK_RECIPE) => void
    mockGetRecipe.mockReturnValue(
      new Promise<typeof MOCK_RECIPE>((res) => { resolveRecipe = res })
    )

    const { getByTestId } = await render(<RecipeDetailScreen />)
    await fireEvent.press(getByTestId('icon-arrow-left'))
    expect(mockGoBack).toHaveBeenCalledTimes(1)

    await act(async () => { resolveRecipe(MOCK_RECIPE) })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Error state
// ─────────────────────────────────────────────────────────────────────────────

describe('RecipeDetailScreen error state', () => {
  it('shows generic error message when API rejects', async () => {
    mockGetRecipe.mockRejectedValue(new Error('Network error'))
    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() =>
      expect(
        getByText('Failed to load recipe. Please check your connection and try again.')
      ).toBeTruthy()
    )
  })

  it('shows 404 message when the API returns a 404 response', async () => {
    mockGetRecipe.mockRejectedValue({ response: { status: 404 } })
    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() =>
      expect(getByText('This recipe could not be found.')).toBeTruthy()
    )
  })

  it('shows "Try Again" button in the error state', async () => {
    mockGetRecipe.mockRejectedValue(new Error('Network error'))
    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() => expect(getByText('Try Again')).toBeTruthy())
  })

  it('"Try Again" re-calls getRecipe', async () => {
    mockGetRecipe.mockRejectedValueOnce(new Error('Network error'))
    mockGetRecipe.mockResolvedValueOnce(MOCK_RECIPE)

    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() => expect(getByText('Try Again')).toBeTruthy())
    await fireEvent.press(getByText('Try Again'))
    await waitFor(() => expect(mockGetRecipe).toHaveBeenCalledTimes(2))
  })

  it('back button calls goBack in the error state', async () => {
    mockGetRecipe.mockRejectedValue(new Error('fail'))
    const { getByTestId } = await render(<RecipeDetailScreen />)
    await waitFor(() => expect(getByTestId('icon-arrow-left')).toBeTruthy())
    await fireEvent.press(getByTestId('icon-arrow-left'))
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Loaded state — metadata
// ─────────────────────────────────────────────────────────────────────────────

describe('RecipeDetailScreen loaded state — metadata', () => {
  it('shows the recipe title in the hero section', async () => {
    const { getAllByText } = await render(<RecipeDetailScreen />)
    await waitFor(() =>
      expect(getAllByText(RECIPE_TITLE).length).toBeGreaterThanOrEqual(1)
    )
  })

  it('shows the recipe description', async () => {
    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() =>
      expect(getByText('A classic Italian pasta dish.')).toBeTruthy()
    )
  })

  it('shows the match percentage badge', async () => {
    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() => expect(getByText('85% match')).toBeTruthy())
  })

  it('shows the difficulty badge', async () => {
    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() => expect(getByText('medium')).toBeTruthy())
  })

  it('shows the cuisine type badge', async () => {
    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() => expect(getByText('Italian')).toBeTruthy())
  })

  it('shows prep time formatted correctly', async () => {
    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() => expect(getByText('15 min')).toBeTruthy())
  })

  it('shows cook time formatted correctly', async () => {
    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() => expect(getByText('30 min')).toBeTruthy())
  })

  it('shows servings count', async () => {
    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() => expect(getByText('4')).toBeTruthy())
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Loaded state — ingredients
// ─────────────────────────────────────────────────────────────────────────────

describe('RecipeDetailScreen loaded state — ingredients', () => {
  it('shows the Ingredients section heading', async () => {
    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() => expect(getByText('Ingredients')).toBeTruthy())
  })

  it('renders each ingredient name', async () => {
    const { getAllByText } = await render(<RecipeDetailScreen />)
    // "Spaghetti" also appears in the recipe title "Spaghetti Carbonara";
    // use getAllByText and verify at least one match exists.
    await waitFor(() => {
      expect(getAllByText(/Spaghetti/).length).toBeGreaterThanOrEqual(1)
      // "Eggs" is unique to the ingredient list
      expect(getAllByText(/Eggs/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('does not crash when ingredient_list is empty', async () => {
    mockGetRecipe.mockResolvedValue({ ...MOCK_RECIPE, ingredient_list: [] })
    const { queryByText } = await render(<RecipeDetailScreen />)
    await waitFor(() =>
      expect(queryByText('Ingredients')).toBeNull()
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Loaded state — instructions
// ─────────────────────────────────────────────────────────────────────────────

describe('RecipeDetailScreen loaded state — instructions', () => {
  it('shows the Instructions section heading', async () => {
    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() => expect(getByText('Instructions')).toBeTruthy())
  })

  it('renders each instruction step text', async () => {
    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() => {
      expect(getByText('Boil water and cook pasta.')).toBeTruthy()
      expect(getByText('Whisk eggs with cheese.')).toBeTruthy()
    })
  })

  it('does not crash when instructions is empty', async () => {
    mockGetRecipe.mockResolvedValue({ ...MOCK_RECIPE, instructions: [] })
    const { queryByText } = await render(<RecipeDetailScreen />)
    await waitFor(() =>
      expect(queryByText('Instructions')).toBeNull()
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Loaded state — nutritional info
// ─────────────────────────────────────────────────────────────────────────────

describe('RecipeDetailScreen loaded state — nutrition', () => {
  it('shows the Nutrition section when nutritional_info is present', async () => {
    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() => expect(getByText('Nutrition (per serving)')).toBeTruthy())
  })

  it('renders each nutrition key and value', async () => {
    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() => {
      expect(getByText('Calories')).toBeTruthy()
      expect(getByText('450')).toBeTruthy()
    })
  })

  it('hides the Nutrition section when nutritional_info is null', async () => {
    mockGetRecipe.mockResolvedValue({ ...MOCK_RECIPE, nutritional_info: null })
    const { queryByText } = await render(<RecipeDetailScreen />)
    await waitFor(() =>
      expect(queryByText('Nutrition (per serving)')).toBeNull()
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Loaded state — AI disclaimer
// ─────────────────────────────────────────────────────────────────────────────

describe('RecipeDetailScreen AI disclaimer', () => {
  it('shows the AI disclaimer when is_ai_generated is true', async () => {
    const { getByText } = await render(<RecipeDetailScreen />)
    await waitFor(() =>
      expect(getByText('AI-generated recipe · results may vary')).toBeTruthy()
    )
  })

  it('hides the AI disclaimer when is_ai_generated is false', async () => {
    mockGetRecipe.mockResolvedValue({ ...MOCK_RECIPE, is_ai_generated: false })
    const { queryByText } = await render(<RecipeDetailScreen />)
    await waitFor(() =>
      expect(queryByText('AI-generated recipe · results may vary')).toBeNull()
    )
  })
})
