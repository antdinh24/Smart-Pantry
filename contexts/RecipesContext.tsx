/**
 * RecipesContext.tsx
 *
 * PURPOSE:
 *   Manages recipe data for the entire app. Any screen that needs recipe
 *   suggestions or wants to generate a new recipe calls useRecipes() instead
 *   of making API calls directly. This keeps all recipe state in one place.
 *
 * WHAT CHANGED FROM THE OLD VERSION:
 *   The old version used hardcoded mock data (mockRecipes) and never called
 *   the backend. This version fetches real recipe suggestions from the FastAPI
 *   backend on mount and supports AI recipe generation.
 *
 * HOW DATA FLOWS:
 *   1. RecipesProvider mounts → calls GET /recipes/suggestions
 *   2. Suggestions are stored in React state (sorted by match_percentage)
 *   3. When user taps "Create Recipe":
 *        a. Their pantry ingredient names are passed to generateRecipe()
 *        b. POST /recipes/generate is called (backend checks cache first)
 *        c. The returned recipe is prepended to the suggestions list
 *
 * BACKEND ENDPOINTS USED:
 *   GET  /api/v1/recipes/suggestions  — recipes ranked by pantry match %
 *   POST /api/v1/recipes/generate     — AI-generated recipe (cached)
 *
 * EXPOSED VIA useRecipes():
 *   recipes          — current list of recipe suggestions
 *   loading          — true while initial fetch is in progress
 *   error            — error message if fetch failed, null otherwise
 *   generating       — true while a recipe is being generated
 *   generateRecipe   — calls POST /recipes/generate with pantry ingredients
 *   refreshRecipes   — re-fetches suggestions from the API
 *   getFilteredRecipes — sort the list by match %, time, or name
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import { Recipe, RecipeDetail } from '../types';
import { APIService } from '../services/api';

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT TYPE
// ─────────────────────────────────────────────────────────────────────────────

interface RecipesContextType {
  /** All recipe suggestions fetched from the backend. Empty while loading. */
  recipes: Recipe[];

  /** True while the initial GET /recipes/suggestions call is in progress */
  loading: boolean;

  /** Error message if the initial fetch failed, null otherwise */
  error: string | null;

  /**
   * True while POST /recipes/generate is in flight.
   * Use this to disable the "Create Recipe" button and show a spinner.
   */
  generating: boolean;

  /**
   * generateRecipe
   *
   * Sends the user's pantry ingredient names to the backend and requests
   * an AI-generated recipe. The backend will check its cache first — if a
   * similar recipe was generated before, it's returned instantly for free.
   *
   * On success, the new recipe is prepended to the recipes list so the user
   * sees it immediately without needing to scroll down.
   *
   * @param ingredients - Ingredient names from the user's pantry (e.g. ["milk", "eggs"])
   * @throws Error if the API call fails (caller should catch and show alert)
   */
  generateRecipe: (ingredients: string[]) => Promise<RecipeDetail>;

  /** Re-fetches recipe suggestions from the backend. Call on pull-to-refresh. */
  refreshRecipes: () => Promise<void>;

  /**
   * getFilteredRecipes
   *
   * Returns the current recipe list sorted by the given criterion.
   * Does not filter out any recipes — all suggestions are returned, just ordered.
   *
   * @param sortBy - "match" (default) | "time" | "name"
   */
  getFilteredRecipes: (sortBy?: 'match' | 'time' | 'name') => Recipe[];
}

const RecipesContext = createContext<RecipesContextType | undefined>(undefined);

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

export function RecipesProvider({ children }: { children: ReactNode }) {
  /**
   * recipes — the suggestion list fetched from the backend.
   * Starts empty; filled by fetchSuggestions() on mount.
   * New AI-generated recipes are prepended to this list.
   */
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  /** True while the initial GET /recipes/suggestions is in progress */
  const [loading, setLoading] = useState(true);

  /** Error message from the initial fetch, or null on success */
  const [error, setError] = useState<string | null>(null);

  /** True while a POST /recipes/generate call is in flight */
  const [generating, setGenerating] = useState(false);

  // ── Initial data load ─────────────────────────────────────────────────────

  useEffect(() => {
    fetchSuggestions();
  }, []);

  /**
   * fetchSuggestions
   *
   * Loads recipe suggestions from the backend, ranked by how well they match
   * the user's current pantry. This is a cheap call — no AI involved, just
   * a database query.
   *
   * Extracted as a named function so it can also be exposed as refreshRecipes()
   * without duplicating the try/catch/finally logic.
   */
  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data: Recipe[] = await APIService.getRecipeSuggestions();
      setRecipes(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load recipe suggestions.');
      console.error('RecipesContext: fetchSuggestions failed', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Recipe generation ─────────────────────────────────────────────────────

  /**
   * generateRecipe
   *
   * Calls POST /recipes/generate with the user's pantry ingredient names.
   * The backend checks its recipe cache first:
   *   - Cache hit (≥80% similar): returns cached recipe instantly (free)
   *   - Cache miss: generates with OpenAI (~$0.002–$0.01), then caches it
   *
   * On success, the new recipe is prepended to the local suggestions list.
   * We return the full RecipeDetail so the caller can navigate to a detail view.
   *
   * WHY prepend instead of append?
   *   The user just generated this recipe — they should see it at the top of
   *   the list immediately, not buried below existing suggestions.
   *
   * @param ingredients - Array of ingredient name strings from the user's pantry
   * @returns The full generated recipe (including ingredient_list and instructions)
   * @throws Error if the backend call fails
   */
  const generateRecipe = useCallback(async (ingredients: string[]): Promise<RecipeDetail> => {
    setGenerating(true);
    try {
      // The backend returns { recipe, from_cache, cache_similarity, api_call_saved, message }
      const result = await APIService.generateRecipe(ingredients);
      const newRecipe: RecipeDetail = result.recipe;

      // Prepend the generated recipe to the suggestions list.
      // We cast to Recipe because RecipeDetail extends Recipe — all the list-view
      // fields are present.
      setRecipes(prev => [newRecipe as unknown as Recipe, ...prev]);

      return newRecipe;
    } finally {
      // Always clear the generating flag, even if the call threw an error.
      // This ensures the UI button is re-enabled regardless of outcome.
      setGenerating(false);
    }
  }, []);

  // ── Sorting helper ────────────────────────────────────────────────────────

  /**
   * getFilteredRecipes
   *
   * Returns a sorted copy of the current recipe list. Does not mutate state.
   *
   * Sort modes:
   *   "match" — highest match_percentage first (default; most useful to user)
   *   "time"  — shortest total cook+prep time first
   *   "name"  — alphabetical by title
   *
   * @param sortBy - Which field to sort by (defaults to "match")
   */
  const getFilteredRecipes = useCallback(
    (sortBy: 'match' | 'time' | 'name' = 'match'): Recipe[] => {
      const sorted = [...recipes];

      switch (sortBy) {
        case 'match':
          sorted.sort((a, b) => b.match_percentage - a.match_percentage);
          break;

        case 'time':
          // Total time = prep + cook. If either is null, treat it as 0.
          sorted.sort((a, b) => {
            const timeA = (a.prep_time_minutes ?? 0) + (a.cook_time_minutes ?? 0);
            const timeB = (b.prep_time_minutes ?? 0) + (b.cook_time_minutes ?? 0);
            return timeA - timeB;
          });
          break;

        case 'name':
          sorted.sort((a, b) => a.title.localeCompare(b.title));
          break;
      }

      return sorted;
    },
    [recipes]
  );

  // ── Context value ─────────────────────────────────────────────────────────

  const value: RecipesContextType = {
    recipes,
    loading,
    error,
    generating,
    generateRecipe,
    refreshRecipes: fetchSuggestions,
    getFilteredRecipes,
  };

  return <RecipesContext.Provider value={value}>{children}</RecipesContext.Provider>;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * useRecipes
 *
 * Custom hook to access recipe data and actions from any component.
 * Must be called inside a component that is a descendant of RecipesProvider.
 *
 * Usage:
 *   const { recipes, loading, generateRecipe } = useRecipes()
 *
 * Throws if called outside RecipesProvider so developers get a clear error
 * message instead of a confusing "Cannot read property of undefined" crash.
 */
export function useRecipes(): RecipesContextType {
  const context = useContext(RecipesContext);
  if (context === undefined) {
    throw new Error('useRecipes must be used within a RecipesProvider');
  }
  return context;
}
