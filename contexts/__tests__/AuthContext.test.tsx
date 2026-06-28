/**
 * contexts/__tests__/AuthContext.test.tsx
 *
 * Tests for AuthProvider and the useAuth() hook.
 *
 * WHAT IS TESTED:
 *   - checkAuthStatus on mount: no session, regular session, anonymous session, error
 *   - signIn: success (sets user, saves to storage), failure (throws, keeps user null)
 *   - signUp: success (sets user with free status), failure (throws)
 *   - signInAsGuest: success (sets isGuest: true), failure (throws)
 *   - signOut: calls Supabase, clears user state, calls StorageService.clearAuth()
 *   - refreshSubscriptionStatus: updates subscriptionStatus + StorageService, no-op when no user
 *   - isPremium derived flag: true for 'premium' and 'trial', false for 'free'
 *   - isGuest derived flag: true for anonymous users, false for regular
 *   - useAuth() outside provider throws a descriptive error
 *
 * MOCKS:
 *   SupabaseService (default export from services/supabase)
 *   StorageService  (default export from services/storage)
 *   APIService      (default export from services/api — used by refreshSubscriptionStatus)
 *
 * NOTE ON THE GLOBAL MOCK:
 *   jest-setup.ts globally mocks { supabase } (the named supabase client export).
 *   AuthContext uses SupabaseService (the default export wrapper), which is a
 *   DIFFERENT export. The mock below overrides both to avoid confusion.
 */

import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { AuthProvider, useAuth } from '../AuthContext'

// ── Mock SupabaseService ────────────────────────────────────────────────────────

jest.mock('../../services/supabase', () => ({
  __esModule: true,
  // Default export — what AuthContext imports as SupabaseService
  default: {
    getSession: jest.fn(),
    getUserProfile: jest.fn(),
    signIn: jest.fn(),
    signUp: jest.fn(),
    signInAnonymously: jest.fn(),
    signOut: jest.fn(),
  },
  // Keep the named supabase export shape for api.ts interceptor compatibility
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: jest.fn().mockResolvedValue({}),
      refreshSession: jest.fn(),
    },
  },
}))

// ── Mock StorageService ─────────────────────────────────────────────────────────

jest.mock('../../services/storage', () => ({
  __esModule: true,
  default: {
    setUserId: jest.fn().mockResolvedValue(undefined),
    setUserEmail: jest.fn().mockResolvedValue(undefined),
    setPremiumUnlocked: jest.fn().mockResolvedValue(undefined),
    clearAuth: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  },
}))

// ── Mock APIService (default export) ───────────────────────────────────────────

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    getSubscriptionStatus: jest.fn(),
  },
  APIService: {
    getSubscriptionStatus: jest.fn(),
  },
}))

// ── Import mocked modules for configuration in tests ───────────────────────────

import SupabaseService from '../../services/supabase'
import StorageService from '../../services/storage'
import APIService from '../../services/api'

const mockGetSession = SupabaseService.getSession as jest.Mock
const mockGetUserProfile = SupabaseService.getUserProfile as jest.Mock
const mockSignIn = SupabaseService.signIn as jest.Mock
const mockSignUp = SupabaseService.signUp as jest.Mock
const mockSignInAnonymously = SupabaseService.signInAnonymously as jest.Mock
const mockSignOut = SupabaseService.signOut as jest.Mock
const mockSetPremiumUnlocked = StorageService.setPremiumUnlocked as jest.Mock
const mockClearAuth = StorageService.clearAuth as jest.Mock
const mockGetSubscriptionStatus = (APIService as any).getSubscriptionStatus as jest.Mock

// ── Fixtures ────────────────────────────────────────────────────────────────────

const SESSION_REGULAR = {
  user: {
    id: 'user-abc',
    email: 'test@example.com',
    is_anonymous: false,
  },
}

const SESSION_GUEST = {
  user: {
    id: 'anon-xyz',
    email: null,
    is_anonymous: true,
  },
}

const PROFILE_FREE = { subscription_status: 'free' }
const PROFILE_PREMIUM = { subscription_status: 'premium' }

// ── Provider wrapper ─────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

// ── Shared setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  // By default: no active session
  mockGetSession.mockResolvedValue(null)
  mockGetUserProfile.mockResolvedValue(PROFILE_FREE)
  mockSignIn.mockResolvedValue({ user: SESSION_REGULAR.user })
  mockSignUp.mockResolvedValue({ user: SESSION_REGULAR.user })
  mockSignInAnonymously.mockResolvedValue({ user: SESSION_GUEST.user })
  mockSignOut.mockResolvedValue(undefined)
  mockGetSubscriptionStatus.mockResolvedValue({ subscription_status: 'free' })
})

// =============================================================================
// checkAuthStatus — called on mount
// =============================================================================

describe('AuthContext — initial auth check (no session)', () => {
  it('sets user to null when there is no active session', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })

  it('sets loading to false after the check completes', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
  })
})

describe('AuthContext — initial auth check (regular session)', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(SESSION_REGULAR)
  })

  it('sets user with id, email, and subscription status from profile', async () => {
    mockGetUserProfile.mockResolvedValue(PROFILE_FREE)
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.user).toMatchObject({
      id: 'user-abc',
      email: 'test@example.com',
      subscriptionStatus: 'free',
      isGuest: false,
    })
  })

  it('calls getUserProfile to fetch subscription status', async () => {
    await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(mockGetUserProfile).toHaveBeenCalledWith('user-abc'))
  })

  it('sets subscriptionStatus to premium when profile returns premium', async () => {
    mockGetUserProfile.mockResolvedValue(PROFILE_PREMIUM)
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user?.subscriptionStatus).toBe('premium')
  })

  it('falls back to "free" when getUserProfile returns null', async () => {
    mockGetUserProfile.mockResolvedValue(null)
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user?.subscriptionStatus).toBe('free')
  })
})

describe('AuthContext — initial auth check (anonymous session)', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(SESSION_GUEST)
  })

  it('sets isGuest: true and skips the profile fetch', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.user?.isGuest).toBe(true)
    expect(mockGetUserProfile).not.toHaveBeenCalled()
  })

  it('sets an empty email for anonymous users', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user?.email).toBe('')
  })
})

describe('AuthContext — initial auth check (error)', () => {
  it('sets user to null and loading to false when getSession throws', async () => {
    mockGetSession.mockRejectedValue(new Error('Network failure'))
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })
})

// =============================================================================
// signIn
// =============================================================================

describe('AuthContext — signIn', () => {
  it('calls SupabaseService.signIn with the provided email and password', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.signIn('user@test.com', 'password123')
    })

    expect(mockSignIn).toHaveBeenCalledWith('user@test.com', 'password123')
  })

  it('sets user state after successful sign in', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.signIn('user@test.com', 'password123')
    })

    expect(result.current.user).toMatchObject({
      id: 'user-abc',
      email: 'test@example.com',
      isGuest: false,
    })
  })

  it('calls StorageService.setPremiumUnlocked after signing in', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.signIn('user@test.com', 'password123')
    })

    expect(mockSetPremiumUnlocked).toHaveBeenCalled()
  })

  it('throws an error and leaves user null when signIn fails', async () => {
    mockSignIn.mockRejectedValue(new Error('Invalid credentials'))
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let caughtError: Error | undefined
    await act(async () => {
      try {
        await result.current.signIn('bad@test.com', 'wrong')
      } catch (e: any) {
        caughtError = e
      }
    })

    expect(caughtError?.message).toContain('Invalid credentials')
    expect(result.current.user).toBeNull()
  })
})

// =============================================================================
// signUp
// =============================================================================

describe('AuthContext — signUp', () => {
  it('calls SupabaseService.signUp with the provided email and password', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.signUp('new@test.com', 'newpass123')
    })

    expect(mockSignUp).toHaveBeenCalledWith('new@test.com', 'newpass123')
  })

  it('sets user state with subscriptionStatus "free" after sign up', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.signUp('new@test.com', 'newpass123')
    })

    expect(result.current.user?.subscriptionStatus).toBe('free')
    expect(result.current.user?.isGuest).toBe(false)
  })

  it('throws when signUp fails', async () => {
    mockSignUp.mockRejectedValue(new Error('Email already registered'))
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let caughtError: Error | undefined
    await act(async () => {
      try {
        await result.current.signUp('existing@test.com', 'pass')
      } catch (e: any) {
        caughtError = e
      }
    })

    expect(caughtError?.message).toContain('Email already registered')
  })
})

// =============================================================================
// signInAsGuest
// =============================================================================

describe('AuthContext — signInAsGuest', () => {
  it('calls SupabaseService.signInAnonymously', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.signInAsGuest()
    })

    expect(mockSignInAnonymously).toHaveBeenCalledTimes(1)
  })

  it('sets user with isGuest: true and subscriptionStatus "free"', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.signInAsGuest()
    })

    expect(result.current.user?.isGuest).toBe(true)
    expect(result.current.user?.subscriptionStatus).toBe('free')
  })

  it('throws when signInAnonymously fails', async () => {
    mockSignInAnonymously.mockRejectedValue(new Error('Anonymous auth disabled'))
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let caughtError: Error | undefined
    await act(async () => {
      try {
        await result.current.signInAsGuest()
      } catch (e: any) {
        caughtError = e
      }
    })

    expect(caughtError?.message).toContain('Anonymous auth disabled')
  })
})

// =============================================================================
// signOut
// =============================================================================

describe('AuthContext — signOut', () => {
  beforeEach(() => {
    // Start with a logged-in user so signOut has something to clear
    mockGetSession.mockResolvedValue(SESSION_REGULAR)
  })

  it('calls SupabaseService.signOut', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).not.toBeNull())

    await act(async () => {
      await result.current.signOut()
    })

    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it('sets user to null after signing out', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).not.toBeNull())

    await act(async () => {
      await result.current.signOut()
    })

    expect(result.current.user).toBeNull()
  })

  it('calls StorageService.clearAuth to wipe local credentials', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).not.toBeNull())

    await act(async () => {
      await result.current.signOut()
    })

    expect(mockClearAuth).toHaveBeenCalledTimes(1)
  })

  it('throws when SupabaseService.signOut fails', async () => {
    mockSignOut.mockRejectedValue(new Error('Sign out failed'))
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).not.toBeNull())

    let caughtError: Error | undefined
    await act(async () => {
      try {
        await result.current.signOut()
      } catch (e: any) {
        caughtError = e
      }
    })

    expect(caughtError?.message).toContain('Sign out failed')
  })
})

// =============================================================================
// refreshSubscriptionStatus
// =============================================================================

describe('AuthContext — refreshSubscriptionStatus', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(SESSION_REGULAR)
  })

  it('updates user subscriptionStatus from the API', async () => {
    mockGetSubscriptionStatus.mockResolvedValue({ subscription_status: 'premium' })

    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).not.toBeNull())

    await act(async () => {
      await result.current.refreshSubscriptionStatus()
    })

    expect(result.current.user?.subscriptionStatus).toBe('premium')
  })

  it('calls StorageService.setPremiumUnlocked after refreshing', async () => {
    mockGetSubscriptionStatus.mockResolvedValue({ subscription_status: 'premium' })

    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).not.toBeNull())

    await act(async () => {
      await result.current.refreshSubscriptionStatus()
    })

    expect(mockSetPremiumUnlocked).toHaveBeenCalledWith(true)
  })

  it('is a no-op when user is null', async () => {
    mockGetSession.mockResolvedValue(null)
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.refreshSubscriptionStatus()
    })

    expect(mockGetSubscriptionStatus).not.toHaveBeenCalled()
  })
})

// =============================================================================
// Derived flags: isPremium and isGuest
// =============================================================================

describe('AuthContext — isPremium flag', () => {
  it('is true when subscriptionStatus is "premium"', async () => {
    mockGetSession.mockResolvedValue(SESSION_REGULAR)
    mockGetUserProfile.mockResolvedValue({ subscription_status: 'premium' })

    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isPremium).toBe(true)
  })

  it('is true when subscriptionStatus is "trial"', async () => {
    mockGetSession.mockResolvedValue(SESSION_REGULAR)
    mockGetUserProfile.mockResolvedValue({ subscription_status: 'trial' })

    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isPremium).toBe(true)
  })

  it('is false when subscriptionStatus is "free"', async () => {
    mockGetSession.mockResolvedValue(SESSION_REGULAR)
    mockGetUserProfile.mockResolvedValue({ subscription_status: 'free' })

    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isPremium).toBe(false)
  })

  it('is false when there is no user', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isPremium).toBe(false)
  })
})

describe('AuthContext — isGuest flag', () => {
  it('is true for anonymous (guest) sessions', async () => {
    mockGetSession.mockResolvedValue(SESSION_GUEST)
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isGuest).toBe(true)
  })

  it('is false for regular authenticated users', async () => {
    mockGetSession.mockResolvedValue(SESSION_REGULAR)
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isGuest).toBe(false)
  })

  it('is false when there is no user', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isGuest).toBe(false)
  })
})

// =============================================================================
// useAuth guard
// =============================================================================

describe('useAuth guard', () => {
  it('throws a descriptive error when called outside AuthProvider', async () => {
    // renderHook rejects its promise when the hook throws during render.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await expect(renderHook(() => useAuth())).rejects.toThrow(
      'useAuth must be used within AuthProvider'
    )

    spy.mockRestore()
  })
})
