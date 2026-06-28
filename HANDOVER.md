# Jest Test Suite — Handover

## Current state

**Branch:** `frontend-jest-test-suite`

**Overall test count: 474/474 PASSING** ✓

All ingredient autocomplete work is complete and passing.

| Suite | File | Tests |
|-------|------|-------|
| App smoke test | `__tests__/App.smoke.test.tsx` | 2 |
| Login screen | `screens/__tests__/LoginScreen.test.tsx` | 16 |
| Register screen | `screens/__tests__/RegisterScreen.test.tsx` | ✓ |
| Home screen | `screens/__tests__/HomeScreen.test.tsx` | ✓ |
| Pantry screen | `screens/__tests__/PantryScreen.test.tsx` | 20 |
| Barcode result screen | `screens/__tests__/BarcodeResultScreen.test.tsx` | ✓ |
| Edit pantry item screen | `screens/__tests__/EditPantryItemScreen.test.tsx` | ✓ |
| Add ingredients screen | `screens/__tests__/AddIngredientsScreen.test.tsx` | 18 |
| Grocery screen | `screens/__tests__/GroceryScreen.test.tsx` | ✓ |
| Schedule screen | `screens/__tests__/ScheduleScreen.test.tsx` | ✓ |
| Recipe detail screen | `screens/__tests__/RecipeDetailScreen.test.tsx` | ✓ |
| Recipes screen | `screens/__tests__/RecipesScreen.test.tsx` | 20 |
| Scan screen | `screens/__tests__/ScanScreen.test.tsx` | 19 |
| Receipt confirm screen | `screens/__tests__/ReceiptConfirmScreen.test.tsx` | 21 |
| API service | `services/__tests__/api.test.ts` | 37 |
| PantryContext | `contexts/__tests__/PantryContext.test.tsx` | 35 |
| AuthContext | `contexts/__tests__/AuthContext.test.tsx` | 31 |
| RecipesContext | `contexts/__tests__/RecipesContext.test.tsx` | 30 |
| GroceryContext | `contexts/__tests__/GroceryContext.test.tsx` | 25 |
| MealScheduleContext | `contexts/__tests__/MealScheduleContext.test.tsx` | 18 |
| Utility functions | `utils/__tests__/calculations.test.ts` | 41 |
| **IngredientAutocomplete** | `components/__tests__/IngredientAutocomplete.test.tsx` | **13** |

Run full suite: `npm test -- --no-coverage`  
Run a specific file: `npm test -- --no-coverage --testPathPattern="LoginScreen" --verbose`

---

## What was completed (ingredient autocomplete feature — Sprint 4)

1. **`backend/seed_ingredients.py`** — 150 common grocery ingredients seeded into `ingredient_cache` table
2. **`services/api.ts`** — `IngredientSearchResult` type + `searchIngredients` + `selectIngredient` methods added
3. **`components/IngredientAutocomplete.tsx`** — two-phase debounce component (timer → state → useEffect → API call)
4. **`screens/AddIngredientsScreen.tsx`** + **`screens/EditPantryItemScreen.tsx`** — IngredientAutocomplete wired in
5. **`components/__tests__/IngredientAutocomplete.test.tsx`** — 13/13 passing (selective fake timers)
6. **`screens/__tests__/AddIngredientsScreen.test.tsx`** — 18/18 passing (autocomplete tests scoped with per-describe fake timers)

---

## Recipe-matching question (answered)

**"Are we able to match these ingredients that are cached with ingredients to generate recipes?"**

Yes, automatically. When a user picks an ingredient from the autocomplete dropdown, the selected `ingredient_name` is stored in their pantry item. Recipe generation reads pantry items by name and uses them to build the prompt. No extra work needed — the pipeline already connects. The cache also helps by standardising names (always "Tomatoes", never "tomato" / "Tomatos"), so recipe generation prompts are cleaner and more consistent than free-text entry.

---

## Remaining tasks (next session)

1. **Seed the ingredient cache** — run `python backend/seed_ingredients.py` against the production Supabase DB once the backend is deployed. This is NOT a migration — migration `007_create_ingredient_cache.sql` already creates the table. The seed script just inserts 150 starter ingredients.
2. **Update `spec.md`** — document ingredient autocomplete architectural decisions (two-phase debounce, ingredient cache, popularity ranking)
3. **Merge / commit** — commit all changes on this branch and open a PR to `main`
4. **Deploy backend to Render** — set env vars in Render dashboard (DATABASE_URL, SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY, OPENAI_API_KEY)
5. **Update `EXPO_PUBLIC_API_URL`** in root `.env` to point at Render URL
6. **Database migrations** — only needed if this is a fresh Supabase project with no prior migrations run. All 11 already exist (001–011); no new ones were added in Sprint 4.

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

**Important:** after the non-awaited `fireEvent.press`, you can assert on mock call counts (synchronous) but NOT on UI state (e.g. `queryByText`). React's re-render commit is async — it only happens after `act()`'s promise resolves.

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
The Seed button is visible in PantryScreen tests. This is intentional and expected.

### Debounce tests — selective fake timers pattern
```typescript
// In beforeAll (or beforeEach for a single describe block):
jest.useFakeTimers({
  doNotFake: ['setImmediate', 'clearImmediate', 'queueMicrotask'],
})

// Advance the debounce inside act() — flushes the full async chain:
async function advanceDebounce() {
  await act(async () => { jest.advanceTimersByTime(350) })
}

// In afterEach:
jest.clearAllTimers()
await new Promise<void>(r => setImmediate(r))
await new Promise<void>(r => setImmediate(r))
```

If you only need fake timers for SOME tests in a file, scope `useFakeTimers`/`useRealTimers` to a `beforeEach`/`afterEach` inside a `describe` block — don't add them at file level, as that would break any `waitFor` calls outside that describe (which need real `setInterval`).

### App smoke test gotchas
- `expo-sqlite` must be mocked with `openDatabaseAsync` (async API) not `openDatabaseSync`
- `createNativeStackNavigator` mock: Navigator reads `React.Children.toArray(children)[0]?.props?.component` directly
- `NavigationContainer` must be mocked as a passthrough

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

## Notable gotchas for api.test.ts

### axios.create() mock — hoisting issue

`jest.mock('axios', factory)` is hoisted by babel-jest before all imports. A `const mockState: any = { ... }` declared OUTSIDE the factory is `undefined` when the factory runs. Pattern that DOES work:

```typescript
jest.mock('axios', () => {
  const handlers: { requestFn?: any; responseErrFn?: any } = {}
  const instance = Object.assign(jest.fn(), {
    get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn((fn: any) => { handlers.requestFn = fn }) },
      response: { use: jest.fn((_: any, fn: any) => { handlers.responseErrFn = fn }) },
    },
    _handlers: handlers,
  })
  return { __esModule: true, default: { create: () => instance }, __mockInstance: instance }
})

const mockAxios = jest.requireMock('axios').__mockInstance
const getRequestFn = () => (mockAxios as any)._handlers.requestFn
const getResponseErrFn = () => (mockAxios as any)._handlers.responseErrFn
```

### `jest.clearAllMocks()` wipes `mock.calls` — interceptor handlers must not live there

Store interceptor handlers in a plain object (`_handlers`) — `mockClear` leaves plain object properties untouched.

---

## The IngredientAutocomplete component design

`components/IngredientAutocomplete.tsx` uses a **two-phase debounce** design:

- Phase 1: `setTimeout` only calls `setSearchQuery(text)` — pure synchronous setState
- Phase 2: `useEffect` reacts to `searchQuery` changes and makes the async API call

A `cancelled` ref flag in the `useEffect` cleanup prevents stale state updates after unmount or when a new search starts.

**DO NOT revert this design.** Any approach that puts async code inside the `setTimeout` callback will cause nested-async-act corruption in tests.
