/**
 * API Service (FastAPI Client)
 *
 * Product Manager Note:
 * - Connects to your FastAPI backend
 * - Handles all HTTP requests (pantry, recipes, receipts, etc.)
 * - Automatically includes auth token in requests
 * - Retry logic for failed requests
 */

import axios, { AxiosInstance, AxiosError } from 'axios'
import { env } from '../config/env'
import StorageService from './storage'
import { supabase } from './supabase'

/**
 * A single ingredient search result from GET /api/v1/ingredients/search.
 *
 * id may be null for freshly-returned OpenFoodFacts results that have not
 * yet been persisted to the cache (they are cached server-side, but the id
 * is absent in the combined response). Only call selectIngredient() when id
 * is non-null.
 */
export interface IngredientSearchResult {
  id: string | null
  ingredient_name: string
  normalized_name: string
  category: string | null
  popularity: number
  source: string
}

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: env.apiUrl,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - add auth token
//
// WHY supabase.auth.getSession() instead of StorageService.getAuthToken():
// The AuthContext never writes the access token to SecureStore — it only stores
// userId, email, and subscription flags. The Supabase JS client manages its own
// session in AsyncStorage and keeps it up to date after refresh. Reading from
// supabase.auth.getSession() is always correct; reading from StorageService would
// always return null and send requests with no Authorization header.
apiClient.interceptors.request.use(
  async (config) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor - handle token expiry
//
// When the backend returns 401, the access token has expired. We attempt a
// silent refresh using Supabase's stored refresh token. If the refresh works,
// we update SecureStore with the new access token and retry the original
// request transparently — the user never knows anything happened.
//
// If the refresh fails (refresh token also expired, or the user was signed out
// on another device), we sign the user out and they are returned to the login
// screen on the next render cycle.
//
// WHY _retry flag: prevents an infinite retry loop. If the retried request
// also comes back 401 (shouldn't happen, but defensive), we reject immediately.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const { data, error: refreshError } = await supabase.auth.refreshSession()

        if (refreshError || !data.session) {
          // Refresh failed — clear local state and let the app navigate to login
          await supabase.auth.signOut()
          await StorageService.clearAuth()
          return Promise.reject(error)
        }

        // Refresh succeeded — persist the new access token and retry
        await StorageService.setAuthToken(data.session.access_token)
        originalRequest.headers.Authorization = `Bearer ${data.session.access_token}`
        return apiClient(originalRequest)

      } catch {
        // Unexpected error during refresh — sign out to be safe
        await supabase.auth.signOut()
        await StorageService.clearAuth()
      }
    }

    return Promise.reject(error)
  }
)

/**
 * API Service
 * All backend API calls
 */
export const APIService = {
  // ============================================================
  // PANTRY ENDPOINTS
  // ============================================================

  /**
   * Sync pantry items to cloud
   */
  syncPantryItems: async (items: any[]) => {
    const { data } = await apiClient.post('/pantry/sync', { items })
    return data
  },

  /**
   * Get pantry items from cloud
   */
  getPantryItems: async () => {
    const { data } = await apiClient.get('/pantry')
    return data
  },

  /**
   * Add pantry item
   */
  addPantryItem: async (item: any) => {
    const { data } = await apiClient.post('/pantry', item)
    return data
  },

  /**
   * Update pantry item
   */
  updatePantryItem: async (itemId: string, updates: any) => {
    const { data } = await apiClient.put(`/pantry/${itemId}`, updates)
    return data
  },

  /**
   * Delete pantry item
   */
  deletePantryItem: async (itemId: string) => {
    const { data } = await apiClient.delete(`/pantry/${itemId}`)
    return data
  },

  /**
   * Lookup product by barcode (uses OpenFoodFacts)
   */
  lookupBarcode: async (barcode: string) => {
    const { data } = await apiClient.get(`/pantry/barcode/${barcode}`)
    return data
  },

  // ============================================================
  // RECIPE ENDPOINTS
  // ============================================================

  /**
   * generateRecipe
   *
   * Asks the backend to generate (or return a cached) recipe based on a list
   * of ingredient names. The backend requires at least one ingredient.
   *
   * The response includes the full recipe AND cache metadata (from_cache,
   * api_call_saved) so the caller knows whether an OpenAI call was made.
   *
   * @param ingredients - Array of ingredient name strings from the user's pantry
   * @param preferences - Optional hints like { cuisine: "Italian", difficulty: "easy" }
   */
  generateRecipe: async (ingredients: string[], preferences?: Record<string, any>) => {
    const { data } = await apiClient.post('/recipes/generate', {
      ingredients,
      preferences,
    })
    return data
  },

  /**
   * Get recipe suggestions based on pantry
   */
  getRecipeSuggestions: async () => {
    const { data } = await apiClient.get('/recipes/suggestions')
    return data
  },

  /**
   * Get recipe by ID
   */
  getRecipe: async (recipeId: string) => {
    const { data } = await apiClient.get(`/recipes/${recipeId}`)
    return data
  },

  /**
   * Save user recipe
   */
  saveRecipe: async (recipe: any) => {
    const { data } = await apiClient.post('/recipes', recipe)
    return data
  },

  /**
   * Calculate pantry match percentage
   */
  calculateRecipeMatch: async (recipeId: string) => {
    const { data } = await apiClient.get(`/recipes/${recipeId}/match`)
    return data
  },

  // ============================================================
  // RECEIPT ENDPOINTS
  // ============================================================

  /**
   * scanReceipt
   *
   * Sends a base64-encoded receipt image to the backend, which uses GPT-4o
   * vision to extract the text and parse it into structured line items.
   *
   * The response has the same shape as processReceipt — both return a
   * receipt_id, merchant_name, line_items, total_amount, and confidence score.
   * ReceiptConfirmScreen uses this data to show the confirmation checklist.
   *
   * Usage limit: 8 scans/month on the free tier. The backend returns HTTP 429
   * with a user-friendly message when the limit is hit. The caller should
   * catch this and show the upgrade prompt instead of an error alert.
   *
   * @param imageBase64 - Base64 string of the receipt photo (no data URL prefix)
   */
  scanReceipt: async (imageBase64: string) => {
    const { data } = await apiClient.post('/receipts/scan', {
      image_base64: imageBase64,
    })
    return data
  },

  /**
   * confirmReceipt
   *
   * Confirms a pending receipt and adds the selected items to the pantry.
   * Called when the user taps "Add X Items to Pantry" on ReceiptConfirmScreen.
   *
   * The backend marks the receipt as processed and adds each line item
   * to the user's pantry, then updates monthly analytics.
   *
   * @param receiptId - UUID of the pending receipt record (from scanReceipt response)
   * @param lineItems - The user-confirmed (and potentially edited) list of items.
   *                    Only selected items should be included in this array.
   */
  confirmReceipt: async (receiptId: string, lineItems: any[]) => {
    const { data } = await apiClient.post('/receipts/confirm', {
      receipt_id: receiptId,
      line_items: lineItems,
    })
    return data
  },

  /**
   * Process receipt OCR text
   */
  processReceipt: async (ocrText: string, imageUrl?: string) => {
    const { data } = await apiClient.post('/receipts/process', {
      ocr_text: ocrText,
      image_url: imageUrl,
    })
    return data
  },

  /**
   * Get receipt history
   */
  getReceipts: async (startDate?: string, endDate?: string) => {
    const { data } = await apiClient.get('/receipts', {
      params: { start_date: startDate, end_date: endDate },
    })
    return data
  },

  // ============================================================
  // BUDGET ENDPOINTS
  // ============================================================

  /**
   * Get monthly budget summary
   */
  getBudgetSummary: async (month: string) => {
    const { data } = await apiClient.get(`/budget/summary/${month}`)
    return data
  },

  /**
   * Check if budget exceeded
   */
  checkBudgetAlert: async () => {
    const { data } = await apiClient.get('/budget/alert')
    return data
  },

  // ============================================================
  // SUBSCRIPTION ENDPOINTS
  // ============================================================

  /**
   * Get subscription status
   */
  getSubscriptionStatus: async () => {
    const { data } = await apiClient.get('/subscription/status')
    return data
  },

  /**
   * Create Stripe checkout session
   */
  createCheckoutSession: async () => {
    const { data } = await apiClient.post('/subscription/checkout')
    return data
  },

  // ============================================================
  // INGREDIENT SEARCH ENDPOINTS
  // ============================================================

  /**
   * searchIngredients
   *
   * Returns matching ingredients from the backend's cache-first search.
   * Searches the local ingredient_cache first; falls back to OpenFoodFacts
   * API if the cache has fewer than 10 results. Used by IngredientAutocomplete
   * to show suggestions as the user types.
   *
   * Never throws — returns an empty array on network error so the form remains
   * usable when offline or when the backend is unreachable.
   *
   * @param query - Partial name to search for (e.g. "tom", "chick"). Min 2 chars.
   * @param limit - Maximum results to return (default 10).
   * @returns Array of IngredientSearchResult, sorted by popularity descending.
   */
  searchIngredients: async (query: string, limit = 10): Promise<IngredientSearchResult[]> => {
    try {
      const { data } = await apiClient.get('/ingredients/search', {
        params: { q: query, limit },
      })
      return data.results as IngredientSearchResult[]
    } catch {
      return []
    }
  },

  /**
   * selectIngredient
   *
   * Increments the popularity counter for an ingredient in the cache.
   * Called fire-and-forget after the user taps a suggestion — this trains
   * the ranking so frequently-chosen ingredients surface first in future searches.
   *
   * Errors are silently swallowed; popularity tracking is non-critical.
   *
   * @param ingredientId - UUID of the ingredient_cache row.
   */
  selectIngredient: async (ingredientId: string): Promise<void> => {
    try {
      await apiClient.post(`/ingredients/${ingredientId}/select`)
    } catch {
      // Non-critical — popularity tracking failure must not surface to the user
    }
  },

  // ============================================================
  // UTILITY
  // ============================================================

  /**
   * Health check
   */
  healthCheck: async () => {
    const { data } = await apiClient.get('/health')
    return data
  },
}

export default APIService
