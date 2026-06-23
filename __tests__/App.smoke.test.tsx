/**
 * __tests__/App.smoke.test.tsx
 *
 * PURPOSE:
 *   Boot-level smoke test for the root App component.
 *   Verifies that the app can start without crashing and routes unauthenticated
 *   users to the login screen.
 *
 * WHAT THIS COVERS:
 *   - All imports in App.tsx resolve without error in a Jest environment
 *   - DatabaseService.initialize() completes without crashing
 *   - AuthContext finds no existing session (Supabase mock returns session: null)
 *   - The auth gate routes to LoginScreen when user is null
 *
 * WHAT THIS DOES NOT COVER:
 *   Individual screen interactions — those live in screens/__tests__/.
 *
 * MOCKING STRATEGY:
 *   - expo-sqlite               → openDatabaseAsync resolves to a stub db object
 *   - @react-navigation/native  → NavigationContainer is a passthrough wrapper
 *   - @react-navigation/native-stack → Navigator renders only its first Screen's
 *                                      component (the initial route), Screen=null descriptor
 *   - ../screens/LoginScreen    → lightweight stub with testID="login-screen"
 *   - ../services/api           → all provider-called methods resolve to empty data
 *   - expo-secure-store, expo-camera, Supabase → mocked globally in jest-setup.ts
 *
 * RNTL v14 quirk:
 *   render() is async — must be awaited.
 */

import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import App from '../App'

// ── expo-sqlite ─────────────────────────────────────────────────────────────
// DatabaseService.initialize() calls openDatabaseAsync on startup.
// The mock returns a stub db object so the schema-check and migration logic
// can run without requiring a real SQLite file on disk.
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn().mockResolvedValue({
    execAsync:     jest.fn().mockResolvedValue(undefined),
    runAsync:      jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync:    jest.fn().mockResolvedValue([]),
    closeAsync:    jest.fn().mockResolvedValue(undefined),
  }),
}))

// ── @react-navigation/native ──────────────────────────────────────────────────
// NavigationContainer requires a native bridge unavailable in Jest.
// Replaced with a simple passthrough so the provider tree renders without errors.
jest.mock('@react-navigation/native', () => {
  const React = require('react')
  return {
    NavigationContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
    useRoute:      () => ({ params: {} }),
  }
})

// ── @react-navigation/native-stack ────────────────────────────────────────────
// Mock the stack navigator so that:
//   - Navigator reads the first Screen's `component` prop and renders it.
//     This simulates the "initial route" behaviour so we can check which screen
//     appears (Login for guests, Home for authenticated users).
//   - Screen itself renders null — it is a pure descriptor; Navigator inspects
//     its props directly rather than its rendered output.
//
// WHY not use React.Children.forEach inside Screen?
//   Navigator receives the Screen JSX elements as children. Their props
//   (name, component) are accessible on the React element object regardless
//   of what Screen returns when rendered.
jest.mock('@react-navigation/native-stack', () => {
  const React = require('react')
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ children }: { children: any }) => {
        const kids = React.Children.toArray(children) as React.ReactElement<any>[]
        const Comp = kids[0]?.props?.component
        return Comp ? React.createElement(Comp) : null
      },
      Screen: () => null,
    }),
  }
})

// ── LoginScreen stub ──────────────────────────────────────────────────────────
// Replace the real LoginScreen with a lightweight sentinel component.
// This lets us confirm the auth gate reached the login screen without importing
// all of LoginScreen's native dependencies (camera, vector icons, etc.).
jest.mock('../screens/LoginScreen', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return () => React.createElement(Text, { testID: 'login-screen' }, 'Sign In')
})

// ── services/api ──────────────────────────────────────────────────────────────
// PantryContext and RecipesContext call the API on mount via useEffect.
// Stub their fetch methods so no real HTTP requests are made and the
// providers settle into an empty initial state without crashing.
jest.mock('../services/api', () => ({
  APIService: {
    getPantryItems:        jest.fn().mockResolvedValue([]),
    getRecipeSuggestions:  jest.fn().mockResolvedValue([]),
    getSubscriptionStatus: jest.fn().mockResolvedValue({ status: 'free' }),
  },
  default: {
    getPantryItems:        jest.fn().mockResolvedValue([]),
    getRecipeSuggestions:  jest.fn().mockResolvedValue([]),
    getSubscriptionStatus: jest.fn().mockResolvedValue({ status: 'free' }),
  },
}))

// ─────────────────────────────────────────────────────────────────────────────

describe('App smoke test', () => {
  /**
   * Renders without crashing
   *
   * The most basic boot check: all modules resolve, providers initialise,
   * and the component tree renders at least one node.
   */
  it('renders without crashing', async () => {
    const { toJSON } = await render(<App />)
    expect(toJSON()).not.toBeNull()
  })

  /**
   * Auth gate routes unauthenticated users to the login screen
   *
   * Supabase mock (jest-setup.ts) returns { data: { session: null } }, so
   * AuthContext resolves with user=null. RootNavigator then renders
   * AuthNavigator, whose first (initial) route is LoginScreen — our stub
   * renders testID="login-screen" confirming the routing is correct.
   */
  it('shows the login screen for unauthenticated users', async () => {
    const { getByTestId } = await render(<App />)
    await waitFor(() => expect(getByTestId('login-screen')).toBeTruthy())
  })
})
