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

## Sprint 2 — Receipts & Barcode Scanning UI (status: active)

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
