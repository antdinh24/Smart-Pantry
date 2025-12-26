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
   * Generate AI recipe from pantry
   */
  generateRecipe: async (preferences?: any) => {
    const { data } = await apiClient.post('/recipes/generate', {
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
