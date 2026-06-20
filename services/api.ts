/**
 * API Service (FastAPI Client)
 *
 * Product Manager Note:
 * - Connects to your FastAPI backend
 * - Handles all HTTP requests (pantry, recipes, receipts, etc.)
 * - Automatically includes auth token in requests
 * - Retry logic for failed requests
 */

// #region agent log
fetch('http://127.0.0.1:7242/ingest/ffe8eaa6-9082-45b1-bd8b-1379e0e455b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services/api.ts:11',message:'Attempting to import axios',data:{hypothesisId:'A'},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix'})}).catch(()=>{});
// #endregion
import axios, { AxiosInstance, AxiosError } from 'axios'
// #region agent log
fetch('http://127.0.0.1:7242/ingest/ffe8eaa6-9082-45b1-bd8b-1379e0e455b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services/api.ts:13',message:'axios import successful',data:{axiosType:typeof axios,hypothesisId:'A'},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix'})}).catch(()=>{});
// #endregion
import { env } from '../config/env'
import StorageService from './storage'

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: env.apiUrl,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  async (config) => {
    const token = await StorageService.getAuthToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor - handle errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token expired - handle refresh or logout
      console.log('🔒 Unauthorized - token may be expired')
      // TODO: Implement token refresh logic
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
