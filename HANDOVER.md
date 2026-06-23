# Jest Test Suite — Handover

## Current state

**Branch:** `frontend-jest-test-suite`

**Overall test count: 139/139 PASSING** ✓

| Suite | File | Tests |
|-------|------|-------|
| Utility functions | `utils/__tests__/calculations.test.ts` | 41/41 |
| Login screen | `screens/__tests__/LoginScreen.test.tsx` | 16/16 |
| Pantry screen | `screens/__tests__/PantryScreen.test.tsx` | 20/20 |
| Recipes screen | `screens/__tests__/RecipesScreen.test.tsx` | 20/20 |
| Scan screen | `screens/__tests__/ScanScreen.test.tsx` | 19/19 |
| Receipt confirm screen | `screens/__tests__/ReceiptConfirmScreen.test.tsx` | 21/21 |
| App smoke test | `__tests__/App.smoke.test.tsx` | 2/2 |

Run full suite: `npm test -- --no-coverage`  
Run a specific file: `npm test -- --no-coverage --testPathPattern="LoginScreen" --verbose`

---

## What was completed this session

1. **Fixed Alert mock** (`jest-setup.ts`) — the old mock `{ alert: jest.fn() }` had no `default` export. React Native re-exports Alert as `export { default as Alert }`, so without `__esModule: true, default: { alert: jest.fn() }` the Alert was `undefined` in both screen components and test files — causing 16 of the 18 failures with `TypeError: Cannot read properties of undefined (reading 'alert')`.

2. **Fixed LoginScreen loading state tests** — two tests used `new Promise(() => {})` (never resolves) combined with `await fireEvent.press()`. React 19's `act()` waits for ALL pending promises, so the test hung past the 5-second timeout. Fixed with a deferred promise: do NOT await the `fireEvent.press()` call, assert on mock call count (called synchronously inside `act()`), then resolve the deferred and await the press promise.

3. **Added App smoke test** (`__tests__/App.smoke.test.tsx`) — verifies the app boots without crashing and routes unauthenticated users to the login screen. Key learnings for this file are in the Notable Gotchas section below.

---

## What to do next (priority order)

### Priority 1 — Tests for the 8 screens with zero coverage

These screens currently have **no tests at all**. Any bug in them is invisible to CI. They use the same mocking patterns already established — this is the fastest high-value work.

**Screens to cover (suggested order):**

| Screen | File | What to test |
|--------|------|-------------|
| `RegisterScreen` | `screens/__tests__/RegisterScreen.test.tsx` | Form renders, email/password/confirm validation, signUp call, navigate to Login |
| `HomeScreen` | `screens/__tests__/HomeScreen.test.tsx` | Renders stats, nav buttons route to correct screens, loading/empty state |
| `BarcodeResultScreen` | `screens/__tests__/BarcodeResultScreen.test.tsx` | Displays product name/brand, "Add to Pantry" calls API, success navigates back |
| `EditPantryItemScreen` | `screens/__tests__/EditPantryItemScreen.test.tsx` | Pre-populated form, quantity/unit validation, save calls updatePantryItem, cancel navigates back |
| `GroceryScreen` | `screens/__tests__/GroceryScreen.test.tsx` | List renders, check-off toggles, clear-completed, empty state |
| `AddIngredientsScreen` | `screens/__tests__/AddIngredientsScreen.test.tsx` | Input + add, duplicate handling, bulk add to pantry |
| `ScheduleScreen` | `screens/__tests__/ScheduleScreen.test.tsx` | Week grid renders, drag/drop placeholder if applicable, meal slot interactions |
| `RecipeDetailScreen` | `screens/__tests__/RecipeDetailScreen.test.tsx` | Fetches recipe on mount, renders ingredients + instructions, loading/error states |

For each screen, follow the checklist in `CLAUDE.md` under "Frontend Testing" — render, loading, error, empty, interaction, navigation, and API response handling.

---

### Priority 2 — API service unit tests (`services/api.ts`)

**Why this matters:** every frontend screen test mocks the API. If the backend changes a response shape, endpoint URL, or required field, all 139 tests still pass even though the live app is broken. API service tests are the only thing that catches this class of bug without a running backend.

Create `services/__tests__/api.test.ts`. Mock `axios` at the module level and test:

- Correct endpoint URLs are called (`GET /api/v1/pantry`, etc.)
- Request payloads are shaped correctly (field names, types)
- Successful responses are parsed and returned correctly
- 4xx/5xx responses throw with a meaningful error message
- **The 401 → token refresh → retry interceptor** — this is the trickiest and most important:
  - First call returns 401 → `supabase.auth.refreshSession()` is called → request is retried with new token
  - If refresh also fails → `supabase.auth.signOut()` is called
  - The `_retry` flag prevents infinite loops
- Auth header is set correctly from SecureStore token

```typescript
// Skeleton for the interceptor test:
jest.mock('axios')
jest.mock('../services/supabase', ...)  // already in jest-setup.ts globally
jest.mock('expo-secure-store', ...)     // already in jest-setup.ts globally

it('retries a 401 with a refreshed token', async () => {
  // First call → 401, second call → 200
  // Assert refreshSession was called once, request was retried
})
```

---

## Notable gotchas — read before writing any new tests

### RNTL v14 async rules (non-negotiable)
```typescript
// render() is async — always await it
const { getByText } = await render(<MyScreen />)

// fireEvent is async — always await it
await fireEvent.press(getByText('Submit'))
await fireEvent.changeText(getByPlaceholderText('Email'), 'a@b.com')

// wait for async side effects
await waitFor(() => expect(mockFn).toHaveBeenCalled())
```

### Never use `new Promise(() => {})` for loading state tests
React 19's `act()` waits for ALL pending promises. A never-resolving promise hangs the test past the 5-second timeout. Use a deferred promise instead:

```typescript
let resolveIt!: () => void
mockFn.mockReturnValue(new Promise<void>((res) => { resolveIt = res }))

// DO NOT await the press — act() fires the handler synchronously then suspends
const pressPromise = fireEvent.press(button)
// At this point the handler HAS been called (synchronously inside act())
expect(mockFn).toHaveBeenCalledTimes(1)
resolveIt()       // unblock the promise
await pressPromise // let act() complete
```

**Important:** after the non-awaited `fireEvent.press`, you can assert on mock call counts (synchronous) but NOT on UI state (e.g. `queryByText`). React's re-render commit is async — it only happens after `act()`'s promise resolves. Don't write `expect(queryByText('Sign In')).toBeNull()` without awaiting.

### Alert mock — must include `__esModule: true` and `default`
```typescript
// jest-setup.ts — already correct, do not revert this:
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  __esModule: true,
  default: { alert: jest.fn() },
}))
// Without __esModule + default, Alert is undefined everywhere
// (React Native: export {default as Alert} — the default property is what gets used)
```

In test files, import and assert:
```typescript
import { Alert } from 'react-native'
// ...
expect(Alert.alert).toHaveBeenCalledWith('Title', expect.any(String), expect.any(Array))
```

### `__DEV__` is `true` in Jest
The Seed button is visible in PantryScreen tests. This is intentional and expected. Don't add `if (!__DEV__)` to hide it — just account for it in the test (or assert it exists).

### App smoke test gotchas (for reference if you need to extend it)
- `expo-sqlite` must be mocked with `openDatabaseAsync` (async API) not `openDatabaseSync`
- `createNativeStackNavigator` mock: Navigator reads `React.Children.toArray(children)[0]?.props?.component` directly — `Screen` itself returns null (it's a descriptor). This renders only the initial route.
- The AuthContext logs `console.error('Failed to check auth status:')` during the smoke test — this is benign. The Supabase default mock returns `null` where AuthContext expects a session shape; the `finally` block still sets `loading=false` and the login screen renders correctly.
- `NavigationContainer` must be mocked as a passthrough — it requires a native bridge unavailable in Jest.

---

## Global mocking cheat sheet

All of these are set up in `jest-setup.ts` and apply to every test file automatically:

| Module | What's mocked |
|--------|--------------|
| `expo-camera` | `CameraView` as plain View, `useCameraPermissions` → `[{granted:false}, mockRequestFn]` |
| `expo-secure-store` | `getItemAsync` → null, `setItemAsync` / `deleteItemAsync` → resolved |
| `expo-image-picker` | `launchImageLibraryAsync` → `{ canceled: true }` |
| `services/supabase` | `supabase.auth.getSession` → `{ data: { session: null }, error: null }` |
| `react-native/Libraries/Alert/Alert` | `default: { alert: jest.fn() }` |
| `react-native-vector-icons/*` | Icons render as `<Text testID="icon-{name}" />` (via `__mocks__/`) |

Per-test mocking patterns:

```typescript
// Navigation
const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}))

// useRoute (screens that receive params)
const mockUseRoute = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => mockUseRoute(),
}))
// In beforeEach: mockUseRoute.mockReturnValue({ params: { ... } })

// Auth context
jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }))
// In beforeEach: (useAuth as jest.Mock).mockReturnValue({ isGuest: false, signOut: jest.fn() })

// A hook (e.g. usePantry)
jest.mock('../../hooks/usePantry', () => ({ usePantry: jest.fn() }))
// In beforeEach: (usePantry as jest.Mock).mockReturnValue({ items: [], deleteItem: mockFn, ... })

// APIService
jest.mock('../../services/api', () => ({
  APIService: { methodName: jest.fn().mockResolvedValue(data) },
}))

// Press an icon button (vector-icons mock renders as Text with testID)
await fireEvent.press(getByTestId('icon-eye'))
await fireEvent.press(getByTestId('icon-x'))
await fireEvent.press(getByTestId('icon-camera'))
```

---

## Coverage gap summary

| Area | Status |
|------|--------|
| 5 main screens (Login, Pantry, Recipes, Scan, ReceiptConfirm) | ✅ 96 tests |
| Utility functions | ✅ 41 tests |
| App boot / auth gate | ✅ 2 smoke tests |
| **8 screens (Register, Home, BarcodeResult, EditPantryItem, Grocery, AddIngredients, Schedule, RecipeDetail)** | ❌ 0 tests |
| **`services/api.ts` (endpoint URLs, payload shape, 401 interceptor)** | ❌ 0 tests |
| Real API integration (backend contract) | ❌ mocked only |
| Real camera / barcode / OCR pipeline | ❌ mocked only |
| End-to-end navigation flows | ❌ only assert navigate() was called |
