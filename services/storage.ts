/**
 * Storage Service (MMKV Wrapper)
 *
 * Product Manager Note:
 * - Fast key-value storage for settings and tokens
 * - Encrypted by default (secure)
 * - Synchronous (no async/await needed)
 * - Used for: auth tokens, preferences, feature flags
 *
 * NOT used for: pantry items, recipes (use SQLite for that)
 */

import { MMKV } from 'react-native-mmkv'

// Initialize MMKV instance
const storage = new MMKV()

/**
 * Storage Service
 * Provides type-safe access to MMKV storage
 */
export const StorageService = {
  // ============================================================
  // AUTH TOKENS
  // ============================================================
  setAuthToken: (token: string) => {
    storage.set('auth.token', token)
  },

  getAuthToken: (): string | undefined => {
    return storage.getString('auth.token')
  },

  setRefreshToken: (token: string) => {
    storage.set('auth.refresh_token', token)
  },

  getRefreshToken: (): string | undefined => {
    return storage.getString('auth.refresh_token')
  },

  setUserId: (userId: string) => {
    storage.set('auth.user_id', userId)
  },

  getUserId: (): string | undefined => {
    return storage.getString('auth.user_id')
  },

  setUserEmail: (email: string) => {
    storage.set('auth.email', email)
  },

  getUserEmail: (): string | undefined => {
    return storage.getString('auth.email')
  },

  clearAuth: () => {
    storage.delete('auth.token')
    storage.delete('auth.refresh_token')
    storage.delete('auth.user_id')
    storage.delete('auth.email')
  },

  // ============================================================
  // USER PREFERENCES
  // ============================================================
  setTheme: (theme: 'light' | 'dark') => {
    storage.set('prefs.theme', theme)
  },

  getTheme: (): 'light' | 'dark' => {
    return (storage.getString('prefs.theme') as 'light' | 'dark') || 'dark'
  },

  setMeasurementSystem: (system: 'metric' | 'imperial') => {
    storage.set('prefs.measurement_system', system)
  },

  getMeasurementSystem: (): 'metric' | 'imperial' => {
    return (storage.getString('prefs.measurement_system') as 'metric' | 'imperial') || 'metric'
  },

  setDefaultServings: (servings: number) => {
    storage.set('prefs.default_servings', servings)
  },

  getDefaultServings: (): number => {
    return storage.getNumber('prefs.default_servings') || 4
  },

  setNotificationsEnabled: (enabled: boolean) => {
    storage.set('prefs.notifications_enabled', enabled)
  },

  getNotificationsEnabled: (): boolean => {
    return storage.getBoolean('prefs.notifications_enabled') ?? true
  },

  // ============================================================
  // FEATURE FLAGS
  // ============================================================
  setPremiumUnlocked: (unlocked: boolean) => {
    storage.set('feature.premium_unlocked', unlocked)
  },

  isPremiumUnlocked: (): boolean => {
    return storage.getBoolean('feature.premium_unlocked') ?? false
  },

  setTrialEndDate: (timestamp: number) => {
    storage.set('feature.trial_end_date', timestamp)
  },

  getTrialEndDate: (): number | undefined => {
    return storage.getNumber('feature.trial_end_date')
  },

  setAIRecipesRemaining: (count: number) => {
    storage.set('feature.ai_recipes_remaining', count)
  },

  getAIRecipesRemaining: (): number => {
    return storage.getNumber('feature.ai_recipes_remaining') ?? 5
  },

  setOnboardingCompleted: (completed: boolean) => {
    storage.set('feature.onboarding_completed', completed)
  },

  isOnboardingCompleted: (): boolean => {
    return storage.getBoolean('feature.onboarding_completed') ?? false
  },

  // ============================================================
  // APP STATE
  // ============================================================
  setLastSyncTime: (timestamp: number) => {
    storage.set('app.last_sync', timestamp)
  },

  getLastSyncTime: (): number | undefined => {
    return storage.getNumber('app.last_sync')
  },

  setDbSchemaVersion: (version: number) => {
    storage.set('app.db_schema_version', version)
  },

  getDbSchemaVersion: (): number => {
    return storage.getNumber('app.db_schema_version') || 1
  },

  incrementLaunchCount: () => {
    const current = storage.getNumber('app.launch_count') || 0
    storage.set('app.launch_count', current + 1)
    return current + 1
  },

  getLaunchCount: (): number => {
    return storage.getNumber('app.launch_count') || 0
  },

  // ============================================================
  // BUDGETING
  // ============================================================
  setMonthlyBudget: (amount: number) => {
    storage.set('budget.monthly_limit', amount)
  },

  getMonthlyBudget: (): number | undefined => {
    return storage.getNumber('budget.monthly_limit')
  },

  setCurrency: (currency: string) => {
    storage.set('budget.currency', currency)
  },

  getCurrency: (): string => {
    return storage.getString('budget.currency') || 'USD'
  },

  // ============================================================
  // UTILITIES
  // ============================================================
  clearAll: () => {
    storage.clearAll()
  },

  getAllKeys: (): string[] => {
    return storage.getAllKeys()
  },

  // Generic get/set for custom keys
  set: (key: string, value: string | number | boolean) => {
    storage.set(key, value)
  },

  get: (key: string): string | number | boolean | undefined => {
    return storage.getString(key) || storage.getNumber(key) || storage.getBoolean(key)
  },

  delete: (key: string) => {
    storage.delete(key)
  },
}

export default StorageService
