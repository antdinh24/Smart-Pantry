/**
 * LoginScreen.test.tsx
 *
 * Tests for the login form: input validation, auth calls, loading/error states,
 * navigation to Register, and the guest sign-in path.
 *
 * RNTL v14 quirks:
 *   - render() is async → must be awaited
 *   - fireEvent.press / fireEvent.changeText are async → must be awaited
 *   Both wrap state updates in `await act()`, so not awaiting them means the
 *   next line runs before the state update is committed.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '../LoginScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockSignIn = jest.fn();
const mockSignInAsGuest = jest.fn();

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    signInAsGuest: mockSignInAsGuest,
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.mockResolvedValue(undefined);
  mockSignInAsGuest.mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginScreen rendering', () => {
  it('renders without crashing', async () => {
    const { getByText } = await render(<LoginScreen />);
    expect(getByText('Sign In')).toBeTruthy();
  });

  it('shows the Sign In button, Register link, and Guest button', async () => {
    const { getByText } = await render(<LoginScreen />);
    expect(getByText('Sign In')).toBeTruthy();
    expect(getByText('Create one')).toBeTruthy();
    expect(getByText('Continue as Guest')).toBeTruthy();
  });

  it('does not show an error message on initial render', async () => {
    const { queryByText } = await render(<LoginScreen />);
    expect(queryByText(/please enter/i)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Form validation
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginScreen form validation', () => {
  it('shows an error and does not call signIn when email is empty', async () => {
    const { getByText } = await render(<LoginScreen />);
    await fireEvent.press(getByText('Sign In'));
    await waitFor(() =>
      expect(getByText('Please enter your email address.')).toBeTruthy()
    );
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('shows an error and does not call signIn when password is empty', async () => {
    const { getByText, getByPlaceholderText } = await render(<LoginScreen />);
    await fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    await fireEvent.press(getByText('Sign In'));
    await waitFor(() =>
      expect(getByText('Please enter your password.')).toBeTruthy()
    );
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Successful sign-in
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginScreen successful sign-in', () => {
  it('calls signIn with trimmed email and password', async () => {
    const { getByText, getByPlaceholderText } = await render(<LoginScreen />);
    await fireEvent.changeText(getByPlaceholderText('you@example.com'), '  test@example.com  ');
    await fireEvent.changeText(getByPlaceholderText('Your password'), 'password123');
    await fireEvent.press(getByText('Sign In'));
    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123')
    );
  });

  it('calls signIn exactly once per tap', async () => {
    const { getByText, getByPlaceholderText } = await render(<LoginScreen />);
    await fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    await fireEvent.changeText(getByPlaceholderText('Your password'), 'password123');
    await fireEvent.press(getByText('Sign In'));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Loading state
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginScreen loading state', () => {
  it('disables the Sign In button while loading', async () => {
    // Use a deferred promise so we can assert BEFORE it resolves.
    // Never use `new Promise(() => {})` here — React 19's act() waits for all
    // pending promises, so an un-resolvable one causes a 5-second timeout.
    let resolveSignIn!: () => void;
    mockSignIn.mockReturnValue(new Promise<void>((res) => { resolveSignIn = res; }));
    const { getByText, getByPlaceholderText } = await render(<LoginScreen />);
    await fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    await fireEvent.changeText(getByPlaceholderText('Your password'), 'password123');

    // Do NOT await: act() fires the handler synchronously (signIn is called,
    // loading is scheduled), then suspends on the pending promise. Awaiting hangs.
    // We assert on mockSignIn (called synchronously) rather than UI state (committed
    // asynchronously inside act()'s promise resolution).
    const pressPromise = fireEvent.press(getByText('Sign In'));

    // signIn was called exactly once in the synchronous act() phase
    expect(mockSignIn).toHaveBeenCalledTimes(1);

    resolveSignIn();   // unblock the promise so act() can finish
    await pressPromise;
  });

  it('disables the Guest button while loading', async () => {
    let resolveGuest!: () => void;
    mockSignInAsGuest.mockReturnValue(new Promise<void>((res) => { resolveGuest = res; }));
    const { getByText } = await render(<LoginScreen />);

    // Not awaited: act() calls signInAsGuest synchronously, commits loading=true,
    // then suspends on the promise.
    const pressPromise = fireEvent.press(getByText('Continue as Guest'));

    // signInAsGuest was called exactly once during the synchronous act() phase.
    expect(mockSignInAsGuest).toHaveBeenCalledTimes(1);

    resolveGuest();
    await pressPromise;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error state
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginScreen error state', () => {
  it('shows the error message returned by signIn on failure', async () => {
    mockSignIn.mockRejectedValue(new Error('Invalid login credentials'));
    const { getByText, getByPlaceholderText } = await render(<LoginScreen />);
    await fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    await fireEvent.changeText(getByPlaceholderText('Your password'), 'wrongpassword');
    await fireEvent.press(getByText('Sign In'));
    await waitFor(() =>
      expect(getByText('Invalid login credentials')).toBeTruthy()
    );
  });

  it('clears the previous error when the user tries again', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('Bad credentials'));
    const { getByText, getByPlaceholderText, queryByText } = await render(<LoginScreen />);
    await fireEvent.changeText(getByPlaceholderText('you@example.com'), 'a@b.com');
    await fireEvent.changeText(getByPlaceholderText('Your password'), 'pass');
    await fireEvent.press(getByText('Sign In'));
    await waitFor(() => expect(getByText('Bad credentials')).toBeTruthy());

    mockSignIn.mockResolvedValue(undefined);
    await fireEvent.press(getByText('Sign In'));
    await waitFor(() => expect(queryByText('Bad credentials')).toBeNull());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginScreen navigation', () => {
  it('navigates to Register when "Create one" is tapped', async () => {
    const { getByText } = await render(<LoginScreen />);
    await fireEvent.press(getByText('Create one'));
    expect(mockNavigate).toHaveBeenCalledWith('Register');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Guest sign-in
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginScreen guest sign-in', () => {
  it('calls signInAsGuest when "Continue as Guest" is pressed', async () => {
    const { getByText } = await render(<LoginScreen />);
    await fireEvent.press(getByText('Continue as Guest'));
    await waitFor(() => expect(mockSignInAsGuest).toHaveBeenCalledTimes(1));
  });

  it('shows an error when guest sign-in fails', async () => {
    mockSignInAsGuest.mockRejectedValue(new Error('Guest sign in failed. Please try again.'));
    const { getByText } = await render(<LoginScreen />);
    await fireEvent.press(getByText('Continue as Guest'));
    await waitFor(() =>
      expect(getByText('Guest sign in failed. Please try again.')).toBeTruthy()
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Password visibility toggle
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginScreen password visibility toggle', () => {
  it('password field starts hidden (secureTextEntry = true)', async () => {
    const { getByPlaceholderText } = await render(<LoginScreen />);
    const input = getByPlaceholderText('Your password');
    expect(input.props.secureTextEntry).toBe(true);
  });

  it('toggles password visibility when the eye icon is pressed', async () => {
    const { getByPlaceholderText, getByTestId } = await render(<LoginScreen />);
    await fireEvent.press(getByTestId('icon-eye'));
    const input = getByPlaceholderText('Your password');
    expect(input.props.secureTextEntry).toBe(false);
  });
});
