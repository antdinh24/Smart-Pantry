# Smart Pantry — Sprint Planning & Retro Log

> Sprint task tracking, status, and retro notes. Architecture decisions go in [`spec.md`](spec.md).

---

## Sprint 1 — Backend Foundation (status: complete)

**Dates:** ~2026-05 → 2026-06
**Branch:** `main`
**Goal:** Stand up the FastAPI backend, auth system, and all core API endpoints needed for the MVP feature set.

### Tasks
- [x] FastAPI project setup with SQLAlchemy + Supabase (PostgreSQL)
- [x] Auth middleware (JWT validation via Supabase)
- [x] Pantry CRUD endpoints (`GET`, `POST`, `PUT`, `DELETE /api/v1/pantry`)
- [x] Barcode lookup endpoint (`GET /api/v1/pantry/barcode/:barcode` via OpenFoodFacts)
- [x] Receipt scanning API — GPT-4o vision two-step pipeline (`POST /api/v1/receipts/scan`)
- [x] Receipt confirm endpoint — adds line items to pantry (`POST /api/v1/receipts/confirm`)
- [x] Recipe generation with shared cache (`POST /api/v1/recipes/generate`)
- [x] Recipe suggestions endpoint (`GET /api/v1/recipes/suggestions`)
- [x] Free tier usage limits — `UserUsage` table with lazy monthly reset
- [x] Analytics endpoints
- [x] CI/CD pipeline (GitHub Actions) with quality gates
- [x] pytest foundation — `conftest.py`, autouse auth mock (`mock_supabase_token_validation`), test client pattern

### Retro Notes
- Auth middleware returns **403** (not 401) for missing or invalid tokens. Any test checking auth rejection must accept both 403 and 401.
- `app.dependency_overrides[get_db] = lambda: mock_db` is the correct pattern for injecting a mock DB in FastAPI tests. Using `@patch` on the module-level `get_db` function does **not** work — FastAPI captures the original function reference at route-definition time, so a module-level patch has no effect at request time.
- `PantryItem` instances created in memory (not via a real DB insert) have `added_date = None` because `server_default` only runs on actual database inserts. Tests checking full item response shapes must use mock objects with pre-configured `to_dict()` rather than constructing bare `PantryItem()` instances.
- The `UserUsage` lazy reset avoids needing a cron job: on every access, if `row.reset_date < this_month_start`, counters are zeroed and `reset_date` updated in the same transaction.
- Receipt scanning uses a two-step pipeline: `ReceiptScannerService` extracts raw text via GPT-4o vision → `ReceiptParser` structures it into line items. The parser is OCR-agnostic — swapping to ML Kit in Phase 2 only touches `ReceiptScannerService`.

---

## Sprint 2 — Receipts & Barcode Scanning UI (status: complete)

**Dates:** 2026-06-20 → ongoing
**Branch:** `Receipts-and-Barcode-Scanning`
**Goal:** Complete the receipt scanning and barcode scanning frontend flows, fix the full backend test suite to 100% passing, and verify the app connects to the backend from a real Android device.

### Tasks
- [x] Receipt scanning frontend — camera capture → confirm screen flow
- [x] Barcode scanning frontend — scan → add to pantry flow
- [x] Fix 34 backend test failures → 392 passing, 86.64% coverage
- [x] Fix Android → backend network connectivity (LAN IP in `.env`)
- [x] Update `backend/.env` CORS origins to include device LAN IP
- [x] Remove leftover agent debug probes from `services/api.ts` and `config/env.ts`
- [x] Restructure `spec.md` — version label, Version History section, no inline strikethroughs going forward
- [x] Create `SPRINTS.md` and move phase checklists here from `spec.md`
- [x] Update `CLAUDE.md` — SPRINTS.md maintenance instructions, Version History policy
- [ ] Verify end-to-end: app on device → backend → Supabase (after network fix)
- [x] Guest login — "Continue as Guest" button on LoginScreen
- [x] Guest login — `signInAsGuest()` in AuthContext using Supabase anonymous auth
- [x] Guest login — `isGuest` flag on User type, exposed via `useAuth()`
- [x] Guest gate — recipe generation blocked for guests (RecipesScreen)
- [x] Guest gate — receipt scanning blocked for guests, barcode scanning allowed (ScanScreen)
- [ ] Merchant detection Phase 2 — user confirmation UI in `ReceiptConfirmScreen` when merchant confidence < 0.6
- [ ] Merchant detection Phase 2 — merchant search dropdown with suggestions
- [ ] Merchant detection Phase 2 — `learn_merchant_pattern()` called on user confirmation
- [ ] Merchant detection Phase 2 — write corrections to `merchant_corrections` table
- [x] Make `stripe_secret_key` and `stripe_webhook_secret` optional in `app/config.py` (post-MVP, server must start without them)
- [x] Token expiry handler in `services/api.ts` — silent refresh via Supabase, one retry, sign-out fallback
- [x] Add `render.yaml` at repo root for Render free-tier deployment (Railway trial expired)
- [x] Frontend Jest test suite — 139/139 passing across 7 suites (96 screen tests + 41 utils + 2 smoke)
- [ ] Commit all changes on this branch and merge to `main`
- [ ] Deploy backend to Render and set env vars in Render dashboard (DATABASE_URL, SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY, OPENAI_API_KEY)
- [ ] Update `EXPO_PUBLIC_API_URL` in root `.env` to point at Render URL
- [ ] Run all 11 database migrations in Supabase SQL Editor (001–011)

### Retro Notes

**Test suite fixes (34 failures → 0):**
- `httpx>=0.28` breaks `starlette.testclient.TestClient` with `TypeError: Client.__init__() got an unexpected keyword argument 'app'`. Pinned to `httpx>=0.25.2,<0.28` in `backend/requirements.txt`.
- FastAPI Path `ge/le` constraints (e.g. `ge=2020, le=2100`) return 422 before endpoint code runs. Removed them from the analytics router so the manual `raise HTTPException(400)` in the endpoint body could fire — tests were expecting 400.
- Pydantic `Field(min_length=1)` also returns 422 before the endpoint body runs. Removed `min_length=1` from `ProcessReceiptRequest.ocr_text` so empty-text reaches the service which raises `ValueError` → 400.
- Hardcoded 2024 dates in receipt parser tests became stale (>365 days ago; the parser rejects dates older than a year). Fixed by using `datetime.now() - timedelta(days=30)` for all date-dependent test data.
- `mock_user_id` in receipt router tests must return `test_user_id = "550e8400-e29b-41d4-a716-446655440000"` (the fixed UUID the `conftest.py` JWT fixture uses). A random UUID caused ownership checks (`str(receipt.user_id) != user_id`) to return 403 on confirm/delete tests.
- CORS test (`test_cors_headers`) must include `headers={"Origin": "http://localhost"}` in the OPTIONS request — `CORSMiddleware` ignores OPTIONS requests with no `Origin` header, returning 405.
- Float assertions on spending totals fail with precision drift (`145.67 != 145.67000000000002`) — use `pytest.approx()`.
- `order_value` was a typo in a mock chain in `test_ingredient_search.py` — should be `order_by`.

**Frontend Jest test suite (18 failures → 0, +2 smoke tests):**
- `jest.mock('react-native/Libraries/Alert/Alert', () => ({ alert: jest.fn() }))` is incomplete. React Native exports Alert as `export {default as Alert}` — without `__esModule: true, default: { alert: jest.fn() }` in the mock, Babel's CommonJS interop resolves `Alert` to `undefined` everywhere, causing `TypeError: Cannot read properties of undefined (reading 'alert')` in both screen components and test files.
- `new Promise(() => {})` (never-resolving) combined with `await fireEvent.press()` hangs in React 19. `act()` was updated in React 19 to wait for ALL pending promises, so an un-resolvable promise causes the test to exceed Jest's 5-second timeout. Fix: use a deferred promise (`new Promise<void>((res) => { resolve = res })`) and do NOT await the `fireEvent.press()` call. Instead fire without await, assert on synchronous side-effects (mock call counts), resolve the deferred promise, then await the press promise.
- After the deferred-press fix: `mockFn.toHaveBeenCalledTimes(1)` works because the event handler is called synchronously inside `act()`'s synchronous phase. However, checking UI state (e.g. `queryByText(...)`) does NOT work at that point — React's re-render commit is asynchronous and only completes when `act()`'s promise resolves.
- Smoke test (`__tests__/App.smoke.test.tsx`): `createNativeStackNavigator` must be mocked so Navigator reads the first Screen's `component` prop directly (`React.Children.toArray(children)[0]?.props?.component`) and renders it. Screen itself returns null — it is a descriptor node, not a renderable component. `expo-sqlite` must be mocked with `openDatabaseAsync` (async API, not `openDatabaseSync`). The AuthContext `console.error` on startup is benign — the Supabase default mock returns `null` where AuthContext expects a session shape; the finally block still sets `loading=false` and the login screen renders.
- `cache_ingredient()` read `ingredient_data.get('extra_data')` but callers pass `'metadata'` key. Fixed to try `metadata` first, `extra_data` as fallback.

**Android networking:**
- On Android (real device or emulator), `localhost` in a URL resolves to the device itself, not the development machine. `EXPO_PUBLIC_API_URL` must use the host machine's LAN IP.
- Real device on WiFi → `http://192.168.1.149:8000/api/v1`
- Android emulator → `http://10.0.2.2:8000/api/v1`
- Both `.env` files are gitignored (`.env*` in root `.gitignore`, `backend/.env` in `backend/.gitignore`) — LAN IP and all API keys are safe from commits.
- React Native mobile apps do not enforce CORS (that's a browser concept), so `ALLOWED_ORIGINS` in `backend/.env` only matters for web/Expo web usage. Updated it to include LAN IP variants anyway for completeness.

**Guest mode:**
- Chose Supabase anonymous auth (Option A) over local-only SQLite (Option B) for MVP simplicity. Option B requires the Phase 2 offline sync layer.
- Anonymous auth must be enabled in the Supabase dashboard: Authentication → Providers → Anonymous sign-ins → toggle ON. Without this, `signInAnonymously()` returns an error.
- Guest data persists between app sessions (stored in Supabase under anonymous UUID + SecureStore session) — data is NOT wiped on app close.
- Data is lost only on app uninstall, explicit sign-out, or refresh token expiry (7 days inactivity).
- Gates use `isGuest` from `useAuth()`. Tapping "Sign Up Free" in the gate alert calls `signOut()` which drops the user back to the AuthStack to register.
- Barcode lookup (OpenFoodFacts) is allowed for guests — it goes through the backend but has no per-request cost.

**Metro / Expo:**
- Saying "No" when Metro asks to use port 8082 (because 8081 is busy) keeps the existing 8081 server running — it does not start a new one on 8081.
- `expo run:android` rebuilds the native APK. `npx expo start` only restarts the Metro JS bundler. Native rebuild is required after changing `app.json` plugins (e.g. removing `react-native-vision-camera`, adding `expo-splash-screen`).

**Hosting — Render vs Railway:**
- Railway's free tier runs out after 30 days / $5. Switched to Render free tier — no credit or time limit.
- Render free tier spins down after 15 min of inactivity; first request after a break takes ~30s. Acceptable for pre-revenue testing.
- `render.yaml` at repo root is all Render needs. Deploys automatically on every push to `main`.
- Secrets must be set in the Render dashboard, not in `render.yaml` (which is committed to git).

**Stripe config:**
- `stripe_secret_key` and `stripe_webhook_secret` were required fields in `app/config.py` with no default — server wouldn't start without them even though Stripe is post-MVP. Fixed by adding `= ""` defaults. No Stripe keys needed until the subscription tier is built.

**Token expiry:**
- Added a 401 interceptor in `services/api.ts`. On 401: tries `supabase.auth.refreshSession()`, updates SecureStore with new access token, retries the original request. If refresh fails, calls `supabase.auth.signOut()` to clear local state — AuthContext picks this up on the next render and returns user to login screen.
- Uses `_retry` flag on the request config to prevent infinite retry loops.

**To stop uvicorn on Windows (if running in background):**
```powershell
$proc = (Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue).OwningProcess
if ($proc) { Stop-Process -Id $proc -Force }
```

---

## Sprint 3 — Comprehensive Frontend Test Suite (status: complete)

**Dates:** 2026-06-22 → 2026-06-23
**Branch:** `frontend-jest-test-suite`
**Goal:** Achieve full unit-test coverage of all frontend screens, contexts, and the API service layer. 445/445 tests passing across 21 suites.

### Tasks
- [x] RegisterScreen tests — form validation, signUp call, navigation
- [x] HomeScreen tests — expiry alert, quick action nav, bottom nav
- [x] BarcodeResultScreen tests — found/not-found banners, addItem call, success/error alerts
- [x] EditPantryItemScreen tests — pre-populated form, 3 validation guards, updateItem, deleteItem with Alert confirm
- [x] GroceryScreen tests — toggle, add form, clearCompleted show/hide, goBack
- [x] AddIngredientsScreen tests — 4 validation guards, payload shape, success/error, loading state
- [x] ScheduleScreen tests — day cards, empty day placeholder, meal names, nav
- [x] RecipeDetailScreen tests — loading/error/404 states, Try Again, loaded metadata/ingredients/instructions/nutrition/AI disclaimer
- [x] `services/__tests__/api.test.ts` — 37 tests: all 18 endpoint URLs + payloads, auth header interceptor, 401 → refresh → retry flow, refresh failure → signOut
- [x] `contexts/__tests__/PantryContext.test.tsx` — 35 tests: fetch lifecycle, isUrgent flag, stats derivation, categories, CRUD mutations + failure isolation, refreshItems, getItemById, getFilteredItems, provider guard
- [x] `contexts/__tests__/AuthContext.test.tsx` — 31 tests: all 4 sign-in paths, signOut, refreshSubscriptionStatus, isPremium/isGuest flags, provider guard
- [x] `contexts/__tests__/RecipesContext.test.tsx` — 30 tests: fetch lifecycle, generateRecipe prepend + generating flag, refreshRecipes, getFilteredRecipes (match/time/name), provider guard
- [x] `contexts/__tests__/GroceryContext.test.tsx` — 25 tests: addItem ID assignment, toggleItem, clearCompleted, deleteItem, updateItem, getItemById, stats recalculation, provider guard
- [x] `contexts/__tests__/MealScheduleContext.test.tsx` — 18 tests: addMeal, removeMeal, updateMeal, getMealsForDay, provider guard

### Retro Notes

**axios mock — hoisting of module-level const with TypeScript type annotations does NOT work:**
`const mockState: { instance: SomeType } = {}` is `undefined` when the `jest.mock('axios', factory)` factory runs. babel-jest's 'mock' prefix hoisting skips declarations with complex TypeScript type annotations. Fix: define everything inside the factory closure; expose the mock instance via the mocked module's own property; access it with `jest.requireMock('axios').__mockInstance`. Documented in full in `HANDOVER.md`.

**`jest.clearAllMocks()` kills interceptor handler references stored in `mock.calls`:**
Interceptors are registered once (when api.ts is first imported). If you read `interceptors.request.use.mock.calls[0][0]` inside a test, it's `undefined` because `beforeEach: jest.clearAllMocks()` wiped the call history. Fix: capture handlers in a plain object (`_handlers`) stored on the mock instance — `mockClear()` does not touch plain object properties, only the `mock.*` arrays.

**HomeScreen duplicate text — `getAllByText` required:**
"Schedule" and "Recipes" appear both in the Quick Actions grid and the bottom nav. `getByText('Schedule')` throws "Found multiple elements". Use `getAllByText('Schedule').length >= 1` or target the subtitle text unique to each card ("Plan meals", "Generate ideas") to avoid ambiguity.

**RecipeDetailScreen ingredient name collision:**
`getByText(/Spaghetti/)` matches both "Spaghetti Carbonara" (recipe title) and "200 g Spaghetti" (ingredient). Use `getAllByText(/Spaghetti/).length >= 1` instead.

**renderHook guard tests — use `.rejects.toThrow()`, not `expect(() => renderHook()).toThrow()`:**
In RNTL v14, `renderHook` is async. When the hook throws synchronously during render, the returned Promise rejects rather than the call throwing synchronously. Correct pattern:
```typescript
await expect(renderHook(() => useMyHook())).rejects.toThrow('expected message')
```
`expect(() => renderHook(...)).toThrow(...)` will NOT work — it doesn't see the async rejection.

**Context tests — use `renderHook(callback, { wrapper })` + `waitFor` for async effects:**
Pattern for testing a context hook:
```typescript
const wrapper = ({ children }) => <MyProvider>{children}</MyProvider>
const { result } = await renderHook(() => useMyHook(), { wrapper })
await waitFor(() => expect(result.current.loading).toBe(false))
// Now safe to assert on result.current.*
```
Mutations must be wrapped in `act(async () => { await result.current.mutate(...) })`.

**EditPantryItemScreen Alert button extraction:**
To test the "Delete" confirm button inside an Alert, extract the callback array from mock call history:
```typescript
const alertArgs = (Alert.alert as jest.Mock).mock.calls[0]
const deleteBtn = alertArgs[2].find((b: any) => b.text === 'Delete')
await deleteBtn.onPress()
```

**Context mutation tests — always `await act(async () => { ... })`:**
In React 19 / RNTL v14, `act()` always returns a Promise — even when the callback is synchronous. Calling `act(() => { ... })` without `await` means React's state update is not committed before the next line runs. Symptoms: the test sees the old value (mutation appears to have no effect), OR `result.current` is `null` in the test AFTER the one that had the un-awaited act (React leaves the tree in a "dirty" state that can cause subsequent renderHook calls to produce a null result). Always use:
```typescript
await act(async () => { result.current.toggleItem(3) })
// Never: act(() => { result.current.toggleItem(3) })
```
For contexts with async mutations (API calls): `await act(async () => { await result.current.generateRecipe([...]) })`.

**GroceryContext and MealScheduleContext mock data — define inline in the factory:**
Both contexts initialise state from `mockDataService` exports at `useState()` time. If mock fixture data is declared as a module-level `const FIXTURE: Type[] = [...]` and referenced inside the `jest.mock()` factory, babel-jest's hoisting moves the `jest.mock()` call before the const initializer, so `FIXTURE` is `undefined` when the factory runs. Fix: define the data inline inside the factory return value, OR use a `jest.fn(() => DATA)` implementation (lazy evaluation — `DATA` is only read when the mock is called, which is after module initialisation completes).

---

## Sprint 4 — Ingredient Autocomplete Feature (status: complete)

**Dates:** 2026-06-26
**Branch:** `frontend-jest-test-suite`
**Goal:** Add a real-time ingredient autocomplete component to AddIngredientsScreen and EditPantryItemScreen, backed by a seeded ingredient cache, with full test coverage (474/474 passing).

### Tasks
- [x] `backend/seed_ingredients.py` — 150 common grocery ingredients seeded into `ingredient_cache` table
- [x] `services/api.ts` — `IngredientSearchResult` type + `searchIngredients` + `selectIngredient` methods
- [x] `components/IngredientAutocomplete.tsx` — two-phase debounce component (timer → state → useEffect → API call)
- [x] `screens/AddIngredientsScreen.tsx` — IngredientAutocomplete wired in place of plain TextInput
- [x] `screens/EditPantryItemScreen.tsx` — IngredientAutocomplete wired in place of plain TextInput
- [x] `components/__tests__/IngredientAutocomplete.test.tsx` — 13/13 passing (selective fake timers approach)
- [x] `screens/__tests__/AddIngredientsScreen.test.tsx` — 18/18 passing (autocomplete integration tests fixed)
- [x] Full suite: 474/474 passing across 22 suites

### Retro Notes

**Two-phase debounce design (non-negotiable for testability):**
The `setTimeout` callback only calls `setSearchQuery(text)` — pure synchronous `setState`. The async API call lives in a `useEffect` that reacts to `searchQuery`. This design is required because React's `act()` can flush a `useEffect` chain (state change → effect → Promise → state changes) but CANNOT track async work started inside a raw `setTimeout` callback. Do NOT move API calls into the `setTimeout` callback — doing so causes nested-async-act corruption in tests.

**Selective fake timers — the only working approach for debounce tests:**
```typescript
jest.useFakeTimers({
  doNotFake: ['setImmediate', 'clearImmediate', 'queueMicrotask'],
})
```
This fakes only `setTimeout/clearTimeout` (our debounce). React's scheduler (`setImmediate`, `MessageChannel`) stays real, so `jest.advanceTimersByTime(350)` inside `act()` fires our debounce without touching React's internal scheduler — preventing "overlapping act" corruption.

Every other approach tried (full fake timers + `runAllTimers`, real timers + `findByText`, `afterEach` setImmediate drains) failed due to either overlapping act corruption or cross-test contamination from the 3-keystroke `changeText` pattern in the debounce deduplication test.

**Scoping fake timers to a single describe block:**
In `AddIngredientsScreen.test.tsx`, the autocomplete tests needed fake timers but the form tests relied on `waitFor` (which internally uses `setInterval`, which would be faked by a file-level `useFakeTimers`). Solution: put `jest.useFakeTimers({...})` in a `beforeEach` and `jest.useRealTimers()` in an `afterEach` scoped to only the autocomplete `describe` block. Tests outside that block continue to use real timers.

**Deprecated `findByText` timeout parameter:**
`findByText(text, { timeout: 2000 })` puts the timeout in the query options (2nd param) which is deprecated — it should be in `waitForOptions` (3rd param). Avoid entirely by using `advanceDebounce()` + synchronous `getByText` instead.

**Cancelled ref flag in useEffect cleanup:**
The `let cancelled = false` / `return () => { cancelled = true }` pattern inside the search `useEffect` prevents stale `setSuggestions` calls when the user types faster than the API responds, or when the component unmounts mid-flight. This is standard React cleanup — do not remove it.
