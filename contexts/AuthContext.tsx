/**
 * Authentication Context
 *
 * Product Manager Note:
 * - Manages user login/logout state
 * - Provides auth methods to entire app
 * - Persists session across app restarts
 * - Checks subscription status
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import SupabaseService from '../services/supabase'
import StorageService from '../services/storage'
import APIService from '../services/api'

interface User {
  id: string
  email: string
  subscriptionStatus: 'free' | 'premium' | 'trial'
  /** True for anonymous (guest) Supabase sessions — no email, no profile row */
  isGuest: boolean
}

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  /**
   * signInAsGuest
   *
   * Creates an anonymous Supabase session. The guest gets a real UUID and JWT
   * so backend calls work, but AI features (recipe generation, receipt scanning)
   * are blocked in the UI to prevent cost abuse. Data persists between sessions
   * via SecureStore until the user uninstalls the app or signs out.
   */
  signInAsGuest: () => Promise<void>
  isPremium: boolean
  /** True when the current session is an anonymous (guest) account */
  isGuest: boolean
  refreshSubscriptionStatus: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  /**
   * Initialize auth state
   * Check if user already logged in
   */
  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    try {
      const session = await SupabaseService.getSession()

      if (session?.user) {
        /**
         * Anonymous (guest) users have no row in the `users` profile table,
         * so we skip the getUserProfile call entirely and set a minimal user
         * object. The `is_anonymous` flag comes from Supabase's User type.
         */
        if (session.user.is_anonymous) {
          setUser({
            id: session.user.id,
            email: '',
            subscriptionStatus: 'free',
            isGuest: true,
          })
          return
        }

        // Regular user — fetch profile for subscription status
        const profile = await SupabaseService.getUserProfile(session.user.id)

        setUser({
          id: session.user.id,
          email: session.user.email || '',
          subscriptionStatus: profile?.subscription_status || 'free',
          isGuest: false,
        })

        // Save to SecureStore
        await StorageService.setUserId(session.user.id)
        await StorageService.setUserEmail(session.user.email || '')
        await StorageService.setPremiumUnlocked(profile?.subscription_status === 'premium')
      } else {
        setUser(null)
      }
    } catch (error) {
      console.error('Failed to check auth status:', error)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Sign in user
   */
  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true)
      const { user: authUser } = await SupabaseService.signIn(email, password)

      if (!authUser) throw new Error('Sign in failed')

      // Get subscription status
      const profile = await SupabaseService.getUserProfile(authUser.id)

      setUser({
        id: authUser.id,
        email: authUser.email || '',
        subscriptionStatus: profile?.subscription_status || 'free',
        isGuest: false,
      })

      // Save to SecureStore
      await StorageService.setPremiumUnlocked(profile?.subscription_status === 'premium')

      console.log('✅ Signed in successfully')
    } catch (error: any) {
      console.error('Sign in error:', error)
      throw new Error(error.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Sign up new user
   */
  const signUp = async (email: string, password: string) => {
    try {
      setLoading(true)
      const { user: authUser } = await SupabaseService.signUp(email, password)

      if (!authUser) throw new Error('Sign up failed')

      // Create user profile in database
      // (This would be handled by a database trigger or backend)

      setUser({
        id: authUser.id,
        email: authUser.email || '',
        subscriptionStatus: 'free',
        isGuest: false,
      })

      console.log('✅ Signed up successfully')
    } catch (error: any) {
      console.error('Sign up error:', error)
      throw new Error(error.message || 'Failed to sign up')
    } finally {
      setLoading(false)
    }
  }

  /**
   * signInAsGuest
   *
   * Creates an anonymous Supabase session. Guest users get a real UUID + JWT
   * so pantry management and barcode lookup work immediately. Recipe generation
   * and receipt scanning are blocked at the screen level to prevent API cost abuse.
   *
   * The session is persisted in SecureStore so data survives app close/reopen.
   * Data is lost on uninstall or explicit sign-out without upgrading to a full account.
   */
  const signInAsGuest = async () => {
    try {
      setLoading(true)
      const { user: anonUser } = await SupabaseService.signInAnonymously()
      if (!anonUser) throw new Error('Guest sign in failed')

      setUser({
        id: anonUser.id,
        email: '',
        subscriptionStatus: 'free',
        isGuest: true,
      })

      console.log('✅ Signed in as guest')
    } catch (error: any) {
      console.error('Guest sign in error:', error)
      throw new Error(error.message || 'Failed to sign in as guest')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Sign out user
   */
  const signOut = async () => {
    try {
      await SupabaseService.signOut()
      setUser(null)

      // Clear local data
      await StorageService.clearAuth()

      console.log('✅ Signed out successfully')
    } catch (error: any) {
      console.error('Sign out error:', error)
      throw new Error(error.message || 'Failed to sign out')
    }
  }

  /**
   * Refresh subscription status
   * Call this after user purchases subscription
   */
  const refreshSubscriptionStatus = async () => {
    if (!user) return

    try {
      const status = await APIService.getSubscriptionStatus()
      const isPremium = status.subscription_status === 'premium'

      setUser((prev) =>
        prev ? { ...prev, subscriptionStatus: status.subscription_status } : null
      )

      await StorageService.setPremiumUnlocked(isPremium)
    } catch (error) {
      console.error('Failed to refresh subscription:', error)
    }
  }

  const isPremium = user?.subscriptionStatus === 'premium' || user?.subscriptionStatus === 'trial'
  const isGuest = user?.isGuest ?? false

  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    signInAsGuest,
    isPremium,
    isGuest,
    refreshSubscriptionStatus,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Hook to use auth context
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export default AuthContext
