/**
 * Supabase Client
 *
 * Product Manager Note:
 * - Connects to Supabase for authentication and cloud storage
 * - Handles user login/signup
 * - Syncs data to PostgreSQL database
 * - Manages file uploads (receipt images)
 */

import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env'
import StorageService from './storage'

// Create Supabase client
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    // Persist session using MMKV
    storage: {
      getItem: (key: string) => {
        return StorageService.get(key) as string | null
      },
      setItem: (key: string, value: string) => {
        StorageService.set(key, value)
      },
      removeItem: (key: string) => {
        StorageService.delete(key)
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

    // Save user info to MMKV
    if (data.user) {
      StorageService.setUserId(data.user.id)
      StorageService.setUserEmail(data.user.email || '')
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
    StorageService.clearAuth()
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
