/**
 * Storage Service (Expo SecureStore Wrapper)
 *
 * Product Manager Note:
 * - Secure encrypted storage for settings and tokens
 * - Async API (requires await)
 * - Used for: auth tokens, preferences, feature flags
 *
 * NOT used for: pantry items, recipes (use SQLite for that)
 */

import * as SecureStore from 'expo-secure-store'

/**
 * Storage Service
 * Provides type-safe access to SecureStore
 * All methods are async and must be awaited
 */
export const StorageService = {
  // ============================================================
  // AUTH TOKENS
  // ============================================================
  setAuthToken: async (token: string): Promise<void> => {
    await SecureStore.setItemAsync('auth.token', token)
  },

  getAuthToken: async (): Promise<string | null> => {
    return await SecureStore.getItemAsync('auth.token')
  },

  setRefreshToken: async (token: string): Promise<void> => {
    await SecureStore.setItemAsync('auth.refresh_token', token)
  },

  getRefreshToken: async (): Promise<string | null> => {
    return await SecureStore.getItemAsync('auth.refresh_token')
  },

  setUserId: async (userId: string): Promise<void> => {
    await SecureStore.setItemAsync('auth.user_id', userId)
  },

  getUserId: async (): Promise<string | null> => {
    return await SecureStore.getItemAsync('auth.user_id')
  },

  setUserEmail: async (email: string): Promise<void> => {
    await SecureStore.setItemAsync('auth.email', email)
  },

  getUserEmail: async (): Promise<string | null> => {
    return await SecureStore.getItemAsync('auth.email')
  },

  clearAuth: async (): Promise<void> => {
    await SecureStore.deleteItemAsync('auth.token')
    await SecureStore.deleteItemAsync('auth.refresh_token')
    await SecureStore.deleteItemAsync('auth.user_id')
    await SecureStore.deleteItemAsync('auth.email')
  },

  // ============================================================
  // USER PREFERENCES
  // ============================================================
  setTheme: async (theme: 'light' | 'dark'): Promise<void> => {
    await SecureStore.setItemAsync('prefs.theme', theme)
  },

  getTheme: async (): Promise<'light' | 'dark'> => {
    const theme = await SecureStore.getItemAsync('prefs.theme')
    return (theme as 'light' | 'dark') || 'dark'
  },

  setMeasurementSystem: async (system: 'metric' | 'imperial'): Promise<void> => {
    await SecureStore.setItemAsync('prefs.measurement_system', system)
  },

  getMeasurementSystem: async (): Promise<'metric' | 'imperial'> => {
    const system = await SecureStore.getItemAsync('prefs.measurement_system')
    return (system as 'metric' | 'imperial') || 'metric'
  },

  setDefaultServings: async (servings: number): Promise<void> => {
    await SecureStore.setItemAsync('prefs.default_servings', servings.toString())
  },

  getDefaultServings: async (): Promise<number> => {
    const servings = await SecureStore.getItemAsync('prefs.default_servings')
    return servings ? parseInt(servings, 10) : 4
  },

  setNotificationsEnabled: async (enabled: boolean): Promise<void> => {
    await SecureStore.setItemAsync('prefs.notifications_enabled', enabled.toString())
  },

  getNotificationsEnabled: async (): Promise<boolean> => {
    const enabled = await SecureStore.getItemAsync('prefs.notifications_enabled')
    return enabled !== null ? enabled === 'true' : true
  },

  // ============================================================
  // FEATURE FLAGS
  // ============================================================
  setPremiumUnlocked: async (unlocked: boolean): Promise<void> => {
    await SecureStore.setItemAsync('feature.premium_unlocked', unlocked.toString())
  },

  isPremiumUnlocked: async (): Promise<boolean> => {
    const unlocked = await SecureStore.getItemAsync('feature.premium_unlocked')
    return unlocked === 'true'
  },

  setTrialEndDate: async (timestamp: number): Promise<void> => {
    await SecureStore.setItemAsync('feature.trial_end_date', timestamp.toString())
  },

  getTrialEndDate: async (): Promise<number | null> => {
    const timestamp = await SecureStore.getItemAsync('feature.trial_end_date')
    return timestamp ? parseInt(timestamp, 10) : null
  },

  setAIRecipesRemaining: async (count: number): Promise<void> => {
    await SecureStore.setItemAsync('feature.ai_recipes_remaining', count.toString())
  },

  getAIRecipesRemaining: async (): Promise<number> => {
    const count = await SecureStore.getItemAsync('feature.ai_recipes_remaining')
    return count ? parseInt(count, 10) : 5
  },

  setOnboardingCompleted: async (completed: boolean): Promise<void> => {
    await SecureStore.setItemAsync('feature.onboarding_completed', completed.toString())
  },

  isOnboardingCompleted: async (): Promise<boolean> => {
    const completed = await SecureStore.getItemAsync('feature.onboarding_completed')
    return completed === 'true'
  },

  // ============================================================
  // APP STATE
  // ============================================================
  setLastSyncTime: async (timestamp: number): Promise<void> => {
    await SecureStore.setItemAsync('app.last_sync', timestamp.toString())
  },

  getLastSyncTime: async (): Promise<number | null> => {
    const timestamp = await SecureStore.getItemAsync('app.last_sync')
    return timestamp ? parseInt(timestamp, 10) : null
  },

  setDbSchemaVersion: async (version: number): Promise<void> => {
    await SecureStore.setItemAsync('app.db_schema_version', version.toString())
  },

  getDbSchemaVersion: async (): Promise<number> => {
    const version = await SecureStore.getItemAsync('app.db_schema_version')
    return version ? parseInt(version, 10) : 1
  },

  incrementLaunchCount: async (): Promise<number> => {
    const current = await SecureStore.getItemAsync('app.launch_count')
    const count = current ? parseInt(current, 10) : 0
    const newCount = count + 1
    await SecureStore.setItemAsync('app.launch_count', newCount.toString())
    return newCount
  },

  getLaunchCount: async (): Promise<number> => {
    const count = await SecureStore.getItemAsync('app.launch_count')
    return count ? parseInt(count, 10) : 0
  },

  // ============================================================
  // BUDGETING
  // ============================================================
  setMonthlyBudget: async (amount: number): Promise<void> => {
    await SecureStore.setItemAsync('budget.monthly_limit', amount.toString())
  },

  getMonthlyBudget: async (): Promise<number | null> => {
    const amount = await SecureStore.getItemAsync('budget.monthly_limit')
    return amount ? parseFloat(amount) : null
  },

  setCurrency: async (currency: string): Promise<void> => {
    await SecureStore.setItemAsync('budget.currency', currency)
  },

  getCurrency: async (): Promise<string> => {
    const currency = await SecureStore.getItemAsync('budget.currency')
    return currency || 'USD'
  },

  // ============================================================
  // UTILITIES
  // ============================================================
  clearAll: async (): Promise<void> => {
    // Note: SecureStore doesn't have a clearAll method
    // You'll need to manually delete all known keys
    const keys = [
      'auth.token', 'auth.refresh_token', 'auth.user_id', 'auth.email',
      'prefs.theme', 'prefs.measurement_system', 'prefs.default_servings', 'prefs.notifications_enabled',
      'feature.premium_unlocked', 'feature.trial_end_date', 'feature.ai_recipes_remaining', 'feature.onboarding_completed',
      'app.last_sync', 'app.db_schema_version', 'app.launch_count',
      'budget.monthly_limit', 'budget.currency'
    ]

    for (const key of keys) {
      await SecureStore.deleteItemAsync(key)
    }
  },

  // Generic get/set for custom keys
  set: async (key: string, value: string | number | boolean): Promise<void> => {
    await SecureStore.setItemAsync(key, value.toString())
  },

  get: async (key: string): Promise<string | null> => {
    return await SecureStore.getItemAsync(key)
  },

  delete: async (key: string): Promise<void> => {
    await SecureStore.deleteItemAsync(key)
  },
}

export default StorageService
