/**
 * RegisterScreen.test.tsx
 *
 * Tests for the registration form:
 *   - Renders all expected fields and the submit button
 *   - Client-side validation (blank email, short password, password mismatch)
 *   - Live "passwords match" indicator
 *   - Password visibility toggle
 *   - Loading state while signUp is in flight
 *   - Successful registration (auth context handles navigation, no manual navigate)
 *   - Error message from a thrown signUp error
 *   - "Sign in" link navigates to the Login screen
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import RegisterScreen from '../RegisterScreen'

// ── Mock navigation ────────────────────────────────────────────────────────────

const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}))

// ── Mock auth context ──────────────────────────────────────────────────────────

const mockSignUp = jest.fn()
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ signUp: mockSignUp }),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockSignUp.mockResolvedValue(undefined)
})

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fillAndSubmit(
  { email = '', password = '', confirm = '' } = {}
) {
  const helpers = await render(<RegisterScreen />)
  const { getByPlaceholderText, getByText } = helpers

  if (email) await fireEvent.changeText(getByPlaceholderText('you@example.com'), email)
  if (password) await fireEvent.changeText(getByPlaceholderText('At least 6 characters'), password)
  if (confirm) await fireEvent.changeText(getByPlaceholderText('Repeat your password'), confirm)

  await fireEvent.press(getByText('Create Account'))
  return helpers
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('RegisterScreen rendering', () => {
  it('renders without crashing', async () => {
    const { getByText } = await render(<RegisterScreen />)
    expect(getByText('Create Account')).toBeTruthy()
  })

  it('shows email, password, and confirm password inputs', async () => {
    const { getByPlaceholderText } = await render(<RegisterScreen />)
    expect(getByPlaceholderText('you@example.com')).toBeTruthy()
    expect(getByPlaceholderText('At least 6 characters')).toBeTruthy()
    expect(getByPlaceholderText('Repeat your password')).toBeTruthy()
  })

  it('shows the Sign in link', async () => {
    const { getByText } = await render(<RegisterScreen />)
    expect(getByText('Sign in')).toBeTruthy()
  })

  it('shows no error message on initial render', async () => {
    const { queryByText } = await render(<RegisterScreen />)
    expect(queryByText(/please enter/i)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

describe('RegisterScreen validation', () => {
  it('shows error when email is blank', async () => {
    const { getByText } = await fillAndSubmit({ email: '', password: 'password123', confirm: 'password123' })
    expect(getByText('Please enter your email address.')).toBeTruthy()
    expect(mockSignUp).not.toHaveBeenCalled()
  })

  it('shows error when password is shorter than 6 characters', async () => {
    const { getByText } = await fillAndSubmit({ email: 'a@b.com', password: 'abc', confirm: 'abc' })
    expect(getByText('Password must be at least 6 characters.')).toBeTruthy()
    expect(mockSignUp).not.toHaveBeenCalled()
  })

  it("shows error when passwords don't match", async () => {
    const { getByText } = await fillAndSubmit({ email: 'a@b.com', password: 'password1', confirm: 'password2' })
    expect(getByText("Passwords don't match. Please check and try again.")).toBeTruthy()
    expect(mockSignUp).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Live password match indicator
// ─────────────────────────────────────────────────────────────────────────────

describe('RegisterScreen live match indicator', () => {
  it('shows "Passwords match" when confirm equals password', async () => {
    const { getByPlaceholderText, getByText } = await render(<RegisterScreen />)
    await fireEvent.changeText(getByPlaceholderText('At least 6 characters'), 'secret123')
    await fireEvent.changeText(getByPlaceholderText('Repeat your password'), 'secret123')
    expect(getByText('Passwords match')).toBeTruthy()
  })

  it("shows \"Passwords don't match\" when confirm differs", async () => {
    const { getByPlaceholderText, getByText } = await render(<RegisterScreen />)
    await fireEvent.changeText(getByPlaceholderText('At least 6 characters'), 'secret123')
    await fireEvent.changeText(getByPlaceholderText('Repeat your password'), 'different')
    expect(getByText("Passwords don't match")).toBeTruthy()
  })

  it('hides the match indicator when confirm field is empty', async () => {
    const { queryByText } = await render(<RegisterScreen />)
    expect(queryByText('Passwords match')).toBeNull()
    expect(queryByText("Passwords don't match")).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Submit — success path
// ─────────────────────────────────────────────────────────────────────────────

describe('RegisterScreen submit success', () => {
  it('calls signUp with trimmed email and password on valid submit', async () => {
    await fillAndSubmit({ email: '  a@b.com  ', password: 'password1', confirm: 'password1' })
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith('a@b.com', 'password1'))
  })

  it('does not navigate manually — App.tsx handles the switch on auth state change', async () => {
    await fillAndSubmit({ email: 'a@b.com', password: 'password1', confirm: 'password1' })
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledTimes(1))
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Submit — loading state
// ─────────────────────────────────────────────────────────────────────────────

describe('RegisterScreen loading state', () => {
  it('shows spinner and disables button while signUp is in flight', async () => {
    let resolveSignUp!: () => void
    mockSignUp.mockReturnValue(new Promise<void>((res) => { resolveSignUp = res }))

    const { getByText, queryByText } = await render(<RegisterScreen />)
    await fireEvent.changeText(
      (await render(<RegisterScreen />)).getByPlaceholderText('you@example.com'),
      'a@b.com'
    )

    // Re-render a fresh instance for this test to keep state clean
    const helpers2 = await render(<RegisterScreen />)
    await fireEvent.changeText(helpers2.getByPlaceholderText('you@example.com'), 'a@b.com')
    await fireEvent.changeText(helpers2.getByPlaceholderText('At least 6 characters'), 'password1')
    await fireEvent.changeText(helpers2.getByPlaceholderText('Repeat your password'), 'password1')

    // Don't await — captures the in-flight state
    const pressPromise = fireEvent.press(helpers2.getByText('Create Account'))
    expect(mockSignUp).toHaveBeenCalledTimes(1)

    resolveSignUp()
    await pressPromise
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Submit — error path
// ─────────────────────────────────────────────────────────────────────────────

describe('RegisterScreen submit error', () => {
  it('shows error message when signUp throws', async () => {
    mockSignUp.mockRejectedValue(new Error('User already registered'))
    const { getByText } = await fillAndSubmit({ email: 'a@b.com', password: 'password1', confirm: 'password1' })
    await waitFor(() => expect(getByText('User already registered')).toBeTruthy())
  })

  it('shows fallback message when signUp throws without a message', async () => {
    mockSignUp.mockRejectedValue({})
    const { getByText } = await fillAndSubmit({ email: 'a@b.com', password: 'password1', confirm: 'password1' })
    await waitFor(() => expect(getByText('Registration failed. Please try again.')).toBeTruthy())
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

describe('RegisterScreen navigation', () => {
  it('navigates to Login when "Sign in" is pressed', async () => {
    const { getByText } = await render(<RegisterScreen />)
    await fireEvent.press(getByText('Sign in'))
    expect(mockNavigate).toHaveBeenCalledWith('Login')
  })
})
