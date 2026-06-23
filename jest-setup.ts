/**
 * jest-setup.ts
 *
 * Global Jest setup file. Runs once before every test suite.
 * Mocks native modules that cannot run in a Node.js environment
 * (the Jest test runner has no real device, camera, or secure storage).
 *
 * WHY mock native modules here instead of per-test?
 *   These mocks apply to every test file so we don't repeat them.
 *   Per-test mocks (e.g. APIService responses) stay in their own files
 *   because they vary between tests.
 */

// ── expo-camera ───────────────────────────────────────────────────────────────
// CameraView is a native view that requires device hardware.
// Mock it as a plain View so components that render it don't crash.
jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: jest.fn(() => [
    { granted: false, status: 'undetermined' },
    jest.fn().mockResolvedValue({ granted: true }),
  ]),
}));

// ── expo-secure-store ─────────────────────────────────────────────────────────
// Secure storage requires a real device keychain — returns null in tests.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// ── expo-image-picker ─────────────────────────────────────────────────────────
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true }),
  MediaTypeOptions: { Images: 'Images' },
}));

// ── @supabase/supabase-js ─────────────────────────────────────────────────────
// Supabase client makes real network requests. Replace with controlled fakes.
jest.mock('./services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn().mockResolvedValue({}),
      signInAnonymously: jest.fn(),
      refreshSession: jest.fn(),
    },
  },
  default: {
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn().mockResolvedValue({}),
    getSession: jest.fn().mockResolvedValue(null),
    signInAnonymously: jest.fn(),
    getUserProfile: jest.fn().mockResolvedValue({ subscription_status: 'free' }),
  },
}));

// ── React Native Alert ────────────────────────────────────────────────────────
// Alert.alert is a no-op in tests unless we spy on it per-test.
//
// WHY __esModule + default:
//   React Native re-exports Alert as `export { default as Alert }` from
//   './Libraries/Alert/Alert'. Without a `default` property in the mock,
//   Babel's CommonJS interop resolves Alert to `undefined` everywhere
//   (both in screen components and test files), causing
//   "Cannot read properties of undefined (reading 'alert')" at runtime.
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  __esModule: true,
  default: { alert: jest.fn() },
}));
