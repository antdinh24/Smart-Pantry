/**
 * Supabase Client
 *
 * Product Manager Note:
 * - Connects to Supabase for authentication and cloud storage
 * - Handles user login/signup
 * - Syncs data to PostgreSQL database
 * - Manages file uploads (receipt images)
 */

// #region agent log
fetch('http://127.0.0.1:7242/ingest/ffe8eaa6-9082-45b1-bd8b-1379e0e455b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services/supabase.ts:11',message:'Attempting to import @supabase/supabase-js',data:{hypothesisId:'B'},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix'})}).catch(()=>{});
// #endregion
import { createClient } from '@supabase/supabase-js'
// #region agent log
fetch('http://127.0.0.1:7242/ingest/ffe8eaa6-9082-45b1-bd8b-1379e0e455b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services/supabase.ts:13',message:'@supabase/supabase-js import successful',data:{createClientType:typeof createClient,hypothesisId:'B'},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix'})}).catch(()=>{});
// #endregion
import { env } from '../config/env'
import StorageService from './storage'

// Create Supabase client
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    // Persist session using SecureStore
    storage: {
      getItem: async (key: string) => {
        return await StorageService.get(key)
      },
      setItem: async (key: string, value: string) => {
        await StorageService.set(key, value)
      },
      removeItem: async (key: string) => {
        await StorageService.delete(key)
      },
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

/**
 * Supabase Service
 * Wrapper functions for common operations
 */
export const SupabaseService = {
  // ============================================================
  // AUTHENTICATION
  // ============================================================

  /**
   * Sign up new user
   */
  signUp: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) throw error
    return data
  },

  /**
   * Sign in existing user
   */
  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error

    // Save user info to SecureStore
    if (data.user) {
      await StorageService.setUserId(data.user.id)
      await StorageService.setUserEmail(data.user.email || '')
    }

    return data
  },

  /**
   * Sign out current user
   */
  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error

    // Clear local auth data
    await StorageService.clearAuth()
  },

  /**
   * Get current session
   */
  getSession: async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return data.session
  },

  /**
   * Get current user
   */
  getUser: async () => {
    const { data, error } = await supabase.auth.getUser()
    if (error) throw error
    return data.user
  },

  // ============================================================
  // USER PROFILE
  // ============================================================

  /**
   * Get user profile from database
   */
  getUserProfile: async (userId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) throw error
    return data
  },

  /**
   * Update user profile
   */
  updateUserProfile: async (userId: string, updates: any) => {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // ============================================================
  // STORAGE (Receipt Images)
  // ============================================================

  /**
   * Upload receipt image
   */
  uploadReceiptImage: async (userId: string, imageUri: string, fileName: string) => {
    // Read file from local path
    const response = await fetch(imageUri)
    const blob = await response.blob()

    // Upload to Supabase Storage
    const filePath = `${userId}/${fileName}`
    const { data, error } = await supabase.storage
      .from('receipt-images')
      .upload(filePath, blob)

    if (error) throw error
    return data
  },

  /**
   * Get public URL for uploaded image
   */
  getReceiptImageUrl: async (filePath: string) => {
    const { data } = supabase.storage
      .from('receipt-images')
      .getPublicUrl(filePath)

    return data.publicUrl
  },

  /**
   * Delete receipt image
   */
  deleteReceiptImage: async (filePath: string) => {
    const { error } = await supabase.storage
      .from('receipt-images')
      .remove([filePath])

    if (error) throw error
  },
}

export default SupabaseService
