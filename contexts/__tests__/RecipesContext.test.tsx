/**
 * contexts/__tests__/RecipesContext.test.tsx
 *
 * Tests for RecipesProvider and the useRecipes() hook.
 *
 * STRATEGY:
 *   Render the hook inside its provider using renderHook(callback, { wrapper }).
 *   Mock APIService to control what the backend returns for each test.
 *   Wait for the initial useEffect fetch to complete with waitFor() before asserting.
 *   Wrap mutations (generateRecipe, refreshRecipes) in act() so React flushes
 *   all state updates before we assert.
 *
 * WHAT IS TESTED:
 *   - Initial fetch lifecycle: loading/error/success states on mount
 *   - generateRecipe: prepends new recipe to the list, returns RecipeDetail,
 *     sets generating=true while in flight and clears it in finally
 *   - refreshRecipes: re-fetches and replaces the recipes list
 *   - getFilteredRecipes: three sort modes (match, time, name) and edge cases
 *   - useRecipes() called outside RecipesProvider throws a descriptive error
 */

import React, { ReactNode } from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { RecipesProvider, useRecipes } from '../RecipesContext'
import { APIService } from '../../services/api'
import { Recipe, RecipeDetail } from '../../types'

// ── Mock APIService ──────────────────────────────────────────────────────────
//
// RecipesContext imports { APIService } (named export) from services/api.
// Only mock the two methods the context actually calls.

jest.mock('../../services/api', () => ({
  APIService: {
    getRecipeSuggestions: jest.fn(),
    generateRecipe: jest.fn(),
  },
}))

const mockGetRecipeSuggestions = APIService.getRecipeSuggestions as jest.Mock
const mockGenerateRecipe = APIService.generateRecipe as jest.Mock

// ── Fixtures ─────────────────────────────────────────────────────────────────
//
// Three recipes chosen to exercise all three sort modes without ambiguity:
//   A: match=90, prep=30+cook=60 → total time=90, title='Apple Pie'
//   B: match=70, prep=null+cook=50 → total time=50, title='Banana Bread'
//   C: match=80, prep=20+cook=null → total time=20, title='Caesar Salad'
//
// Sort expectations:
//   match:  A(90) > C(80) > B(70)
//   time:   C(20) < B(50) < A(90)
//   name:   Apple Pie < Banana Bread < Caesar Salad

const recipeA: Recipe = {
  id: 'uuid-a',
  title: 'Apple Pie',
  description: 'Classic apple pie',
  match_percentage: 90,
  difficulty: 'easy',
  cuisine_type: 'American',
  prep_time_minutes: 30,
  cook_time_minutes: 60,
}

const recipeB: Recipe = {
  id: 'uuid-b',
  title: 'Banana Bread',
  description: 'Moist banana bread',
  match_percentage: 70,
  difficulty: 'easy',
  cuisine_type: null,
  prep_time_minutes: null,  // null → treated as 0 in sort
  cook_time_minutes: 50,
}

const recipeC: Recipe = {
  id: 'uuid-c',
  title: 'Caesar Salad',
  description: null,
  match_percentage: 80,
  difficulty: null,
  cuisine_type: null,
  prep_time_minutes: 20,
  cook_time_minutes: null,  // null → treated as 0 in sort
}

/** Full RecipeDetail for generateRecipe response — extends recipeA */
const recipeDetailA: RecipeDetail = {
  ...recipeA,
  user_id: 'user-1',
  ingredient_list: [{ name: 'apples', quantity: '4', unit: 'pieces' }],
  instructions: [{ step: 1, text: 'Peel and slice apples.' }],
  servings: 8,
  meal_type: 'dessert',
  is_ai_generated: true,
  nutritional_info: null,
  is_public: false,
  usage_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

// ── Provider wrapper ──────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: ReactNode }) => (
  <RecipesProvider>{children}</RecipesProvider>
)

// ── Helper: render hook and wait for initial fetch to settle ─────────────────

async function renderRecipes() {
  const { result } = await renderHook(() => useRecipes(), { wrapper })
  await waitFor(() => expect(result.current.loading).toBe(false))
  return result
}

// ── Shared setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  // Default: return empty suggestions; override per test as needed
  mockGetRecipeSuggestions.mockResolvedValue([])
  mockGenerateRecipe.mockResolvedValue({ recipe: recipeDetailA, from_cache: false })
})

// =============================================================================
// Initial fetch
// =============================================================================

describe('RecipesContext — initial fetch', () => {
  it('calls getRecipeSuggestions once on mount', async () => {
    await renderRecipes()
    expect(mockGetRecipeSuggestions).toHaveBeenCalledTimes(1)
  })

  it('starts with loading=true and ends with loading=false', async () => {
    // Deferred promise lets us observe loading=true before the API call resolves
    let resolveItems!: (items: Recipe[]) => void
    mockGetRecipeSuggestions.mockReturnValue(
      new Promise<Recipe[]>(res => { resolveItems = res })
    )

    const { result } = await renderHook(() => useRecipes(), { wrapper })
    // The effect has fired but the deferred promise hasn't resolved → still loading
    expect(result.current.loading).toBe(true)

    await act(async () => { resolveItems([]) })
    expect(result.current.loading).toBe(false)
  })

  it('populates recipes from the API response', async () => {
    mockGetRecipeSuggestions.mockResolvedValue([recipeA, recipeB])
    const result = await renderRecipes()

    expect(result.current.recipes).toHaveLength(2)
    expect(result.current.recipes[0].id).toBe('uuid-a')
    expect(result.current.recipes[1].id).toBe('uuid-b')
  })

  it('sets error and leaves recipes empty when API rejects', async () => {
    mockGetRecipeSuggestions.mockRejectedValue(new Error('Network error'))
    const result = await renderRecipes()

    expect(result.current.error).toBe('Network error')
    expect(result.current.recipes).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('falls back to a default error string when thrown value has no message', async () => {
    // Throwing a plain string instead of an Error object — err.message is undefined
    mockGetRecipeSuggestions.mockRejectedValue('unexpected error format')
    const result = await renderRecipes()

    expect(result.current.error).toBe('Failed to load recipe suggestions.')
  })

  it('has error=null and generating=false on a successful fetch', async () => {
    mockGetRecipeSuggestions.mockResolvedValue([recipeA])
    const result = await renderRecipes()

    expect(result.current.error).toBeNull()
    expect(result.current.generating).toBe(false)
  })
})

// =============================================================================
// generateRecipe
// =============================================================================

describe('RecipesContext — generateRecipe', () => {
  it('returns the generated RecipeDetail to the caller', async () => {
    const result = await renderRecipes()

    let returnedRecipe!: RecipeDetail
    await act(async () => {
      returnedRecipe = await result.current.generateRecipe(['eggs', 'milk'])
    })

    expect(returnedRecipe).toEqual(recipeDetailA)
  })

  it('passes the ingredients array directly to the API', async () => {
    const result = await renderRecipes()

    await act(async () => {
      await result.current.generateRecipe(['eggs', 'flour', 'sugar'])
    })

    expect(mockGenerateRecipe).toHaveBeenCalledWith(['eggs', 'flour', 'sugar'])
  })

  it('prepends the generated recipe to the beginning of the recipes list', async () => {
    mockGetRecipeSuggestions.mockResolvedValue([recipeB, recipeC])
    mockGenerateRecipe.mockResolvedValue({ recipe: recipeDetailA, from_cache: false })

    const result = await renderRecipes()
    expect(result.current.recipes).toHaveLength(2)

    await act(async () => {
      await result.current.generateRecipe(['apples'])
    })

    // New recipe is at index 0 (prepended), original two are still there
    expect(result.current.recipes).toHaveLength(3)
    expect(result.current.recipes[0].id).toBe('uuid-a')
    expect(result.current.recipes[1].id).toBe('uuid-b')
    expect(result.current.recipes[2].id).toBe('uuid-c')
  })

  it('sets generating=true while the API call is in flight and clears it after', async () => {
    let resolveGenerate!: (v: any) => void
    mockGenerateRecipe.mockReturnValue(
      new Promise(res => { resolveGenerate = res })
    )

    const result = await renderRecipes()
    expect(result.current.generating).toBe(false)

    // Start the call outside act so we can observe mid-flight state
    const generatePromise = result.current.generateRecipe(['eggs'])
    await waitFor(() => expect(result.current.generating).toBe(true))

    // Resolve and confirm the flag clears
    await act(async () => {
      resolveGenerate({ recipe: recipeDetailA })
      await generatePromise
    })
    expect(result.current.generating).toBe(false)
  })

  it('clears generating=false in finally even when the API throws', async () => {
    mockGenerateRecipe.mockRejectedValue(new Error('AI quota exceeded'))

    const result = await renderRecipes()

    await act(async () => {
      try { await result.current.generateRecipe(['eggs']) } catch (_) {}
    })

    expect(result.current.generating).toBe(false)
  })

  it('propagates the error to the caller when the API rejects', async () => {
    mockGenerateRecipe.mockRejectedValue(new Error('Rate limited'))

    const result = await renderRecipes()

    let caughtError: Error | null = null
    await act(async () => {
      try {
        await result.current.generateRecipe(['eggs'])
      } catch (e: any) {
        caughtError = e
      }
    })

    expect(caughtError?.message).toBe('Rate limited')
  })

  it('does not mutate the recipes list when generation fails', async () => {
    mockGetRecipeSuggestions.mockResolvedValue([recipeB])
    mockGenerateRecipe.mockRejectedValue(new Error('fail'))

    const result = await renderRecipes()

    await act(async () => {
      try { await result.current.generateRecipe(['eggs']) } catch (_) {}
    })

    // List is unchanged — no partial prepend
    expect(result.current.recipes).toHaveLength(1)
    expect(result.current.recipes[0].id).toBe('uuid-b')
  })
})

// =============================================================================
// refreshRecipes
// =============================================================================

describe('RecipesContext — refreshRecipes', () => {
  it('re-fetches suggestions and replaces the recipes list', async () => {
    mockGetRecipeSuggestions
      .mockResolvedValueOnce([recipeA])
      .mockResolvedValueOnce([recipeB, recipeC])

    const result = await renderRecipes()
    expect(result.current.recipes).toEqual([recipeA])

    await act(async () => { await result.current.refreshRecipes() })

    expect(result.current.recipes).toEqual([recipeB, recipeC])
    expect(mockGetRecipeSuggestions).toHaveBeenCalledTimes(2)
  })

  it('sets loading=true while the refresh is in flight', async () => {
    mockGetRecipeSuggestions.mockResolvedValueOnce([recipeA])

    let resolveRefresh!: (v: Recipe[]) => void
    mockGetRecipeSuggestions.mockReturnValueOnce(
      new Promise<Recipe[]>(res => { resolveRefresh = res })
    )

    const result = await renderRecipes()

    const refreshPromise = result.current.refreshRecipes()
    await waitFor(() => expect(result.current.loading).toBe(true))

    await act(async () => {
      resolveRefresh([recipeB])
      await refreshPromise
    })
    expect(result.current.loading).toBe(false)
  })

  it('sets error when the refresh API call fails', async () => {
    mockGetRecipeSuggestions
      .mockResolvedValueOnce([recipeA])
      .mockRejectedValueOnce(new Error('Refresh failed'))

    const result = await renderRecipes()
    expect(result.current.error).toBeNull()

    await act(async () => { await result.current.refreshRecipes() })

    expect(result.current.error).toBe('Refresh failed')
  })
})

// =============================================================================
// getFilteredRecipes
// =============================================================================

describe('RecipesContext — getFilteredRecipes', () => {
  async function renderWithRecipes(recipes: Recipe[]) {
    mockGetRecipeSuggestions.mockResolvedValue(recipes)
    return renderRecipes()
  }

  it('sorts by match_percentage descending when sortBy="match"', async () => {
    const result = await renderWithRecipes([recipeB, recipeC, recipeA])

    const sorted = result.current.getFilteredRecipes('match')
    // A=90, C=80, B=70
    expect(sorted.map(r => r.id)).toEqual(['uuid-a', 'uuid-c', 'uuid-b'])
  })

  it('defaults to match sort when sortBy is omitted', async () => {
    const result = await renderWithRecipes([recipeB, recipeA, recipeC])

    const sorted = result.current.getFilteredRecipes()
    expect(sorted.map(r => r.id)).toEqual(['uuid-a', 'uuid-c', 'uuid-b'])
  })

  it('sorts by total prep+cook time ascending when sortBy="time"', async () => {
    const result = await renderWithRecipes([recipeA, recipeB, recipeC])

    const sorted = result.current.getFilteredRecipes('time')
    // C=20, B=50, A=90
    expect(sorted.map(r => r.id)).toEqual(['uuid-c', 'uuid-b', 'uuid-a'])
  })

  it('treats null prep_time_minutes and cook_time_minutes as 0 for time sort', async () => {
    // B: null+50=50, C: 20+null=20
    const result = await renderWithRecipes([recipeB, recipeC])

    const sorted = result.current.getFilteredRecipes('time')
    expect(sorted[0].id).toBe('uuid-c')  // 20 < 50
    expect(sorted[1].id).toBe('uuid-b')
  })

  it('sorts alphabetically by title when sortBy="name"', async () => {
    const result = await renderWithRecipes([recipeC, recipeA, recipeB])

    const sorted = result.current.getFilteredRecipes('name')
    // Apple Pie < Banana Bread < Caesar Salad
    expect(sorted.map(r => r.id)).toEqual(['uuid-a', 'uuid-b', 'uuid-c'])
  })

  it('does not mutate the original recipes state', async () => {
    const result = await renderWithRecipes([recipeB, recipeA])
    const originalOrder = result.current.recipes.map(r => r.id)

    result.current.getFilteredRecipes('match')

    // Context state order is unchanged
    expect(result.current.recipes.map(r => r.id)).toEqual(originalOrder)
  })

  it('returns an empty array when no recipes have been fetched', async () => {
    const result = await renderWithRecipes([])
    expect(result.current.getFilteredRecipes('match')).toEqual([])
  })
})

// =============================================================================
// Provider guard
// =============================================================================

describe('RecipesContext — provider guard', () => {
  it('throws a descriptive error when useRecipes is called outside RecipesProvider', async () => {
    await expect(renderHook(() => useRecipes())).rejects.toThrow(
      'useRecipes must be used within a RecipesProvider'
    )
  })
})
