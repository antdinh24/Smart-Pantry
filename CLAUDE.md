# Smart Pantry — Claude Code Instructions

## Project Overview

Smart Pantry is a React Native (Expo) mobile app for tracking pantry ingredients, scanning barcodes and receipts, suggesting recipes, and planning weekly meals. Backend is FastAPI + Supabase (PostgreSQL).

- **Frontend:** React Native + Expo (SDK 54), TypeScript, expo-camera, expo-sqlite
- **Backend:** FastAPI (Python), SQLAlchemy, Supabase, OpenFoodFacts API
- **Primary target:** Android (MVP), iOS post-MVP

---

## Code Style & Commenting Requirements

**The developer reviewing this code is a junior software engineer.**
Every file I write or modify must include:

### 1. File-level header comment
Explain what the file is, why it exists, and how it fits into the overall app.

### 2. Method/function header comments
For every function or method, explain:
- **What it does** (the purpose)
- **Parameters** — what each one is and why it's needed
- **Return value** — what it returns and what the caller should do with it
- **Important side effects** — navigation, API calls, state changes

### 3. Inline comments on non-obvious logic
Explain *why* a decision was made, not just *what* the code does. Examples:
- Why a ref is used instead of state
- Why a timeout exists
- Why a particular data structure was chosen

### 4. Variable comments for anything non-obvious
If a variable name alone doesn't fully explain its purpose, add a one-line comment.

---

## Communication Style

Before implementing anything, **explain what is about to be done**, why, and how — so the developer can follow along without needing to reverse-engineer the approach.

Structure explanations like:
1. What the goal is
2. What files will be touched and why
3. Any tradeoffs or decisions made

---

## SPRINTS.md — Sprint Planning & Retro Log

**`SPRINTS.md` is the single source of truth for sprint plans, task status, and retro notes.**

It lives at the repo root alongside `spec.md`. Sprint content must never live inside `spec.md`.

### Structure of each sprint entry

Every sprint gets a dated section with these four parts:

```markdown
## Sprint N — Name (status: active | complete)

**Dates:** YYYY-MM-DD → YYYY-MM-DD
**Branch:** `branch-name`
**Goal:** One sentence on what this sprint delivers.

### Tasks
- [x] Completed task
- [ ] Incomplete task

### Retro Notes
- Anything a new agent starting fresh would need to know to pick up this sprint without re-discovering problems.
- Include: bugs hit and how they were fixed, non-obvious constraints, decisions made mid-sprint, anything that broke unexpectedly and why.
```

### Rules

- Mark tasks `[x]` as they are completed — do not wait until the sprint ends.
- When starting a new sprint, close out the previous one with a final retro note and set status to `complete`.
- Retro Notes are for **non-obvious things only** — bugs, workarounds, gotchas, mid-sprint pivots. Do not repeat things already in `spec.md`.
- Architectural decisions made during a sprint go in `spec.md` (and the Version History). Operational notes and task status go in `SPRINTS.md`.

---

## spec.md — Living Document Rule

**`spec.md` must be kept up to date after every session.**

After any conversation where a design decision, architectural choice, scope change, or implementation plan is agreed upon — update `spec.md` before finishing. Do not wait to be asked.

### What must be documented in spec.md:
- Any decision that changes or contradicts what's already written (e.g. swapping a technology, changing a limit, deferring a feature)
- New architectural patterns introduced (e.g. lazy reset, soft delete, two-step pipelines)
- Scope changes to the MVP (features added or removed)
- Free tier limits or monetization decisions
- Navigation patterns or data flow decisions that aren't obvious from the code
- Any "why we chose X over Y" rationale that future contributors would need

### What does NOT need to go in spec.md:
- Bug fixes
- Routine CRUD implementations that follow existing patterns
- Test coverage additions
- Code style or comment changes

### Version numbering and history:
`spec.md` carries a current version label (e.g. `**Current Version: v0.3**`) near the top.

**When a design decision changes:**
1. Update the inline content in `spec.md` to reflect the new plan — keep the active spec clean and accurate.
2. Bump the version number at the top.
3. Add an entry to the `## Version History` section at the **bottom** of `spec.md` describing what was removed or changed from the previous version.

Each Version History entry must include:
- **Version number and date** — e.g. `### v0.3 — 2026-06-20`
- **Section changed** — cite the section heading (e.g. `§6 OCR Strategy`)
- **What changed** — the specific content that was replaced or removed
- **Why** — the reason for the change

Example entry:
```
### v0.3 — 2026-06-20
- **§6 OCR Strategy**: Switched from ML Kit (on-device) to GPT-4o vision.
  Reason: ML Kit requires Expo prebuild which added too much complexity for MVP.
```

Do NOT use `~~strikethrough~~` inline — it clutters the active spec. All history belongs in Version History only.

### When to update:
- Immediately after agreeing on an approach with the user — before implementing
- At the end of any session where the above categories were touched
- When the user explicitly asks for a plan or design discussion

---

## Testing Standards

**No task is complete until its tests are written and passing. Run the full test suite before marking any work done.**

This applies to both backend and frontend. Any time a function, endpoint, screen, component, button, or conditional UI element is added or modified, the corresponding test must be created or updated in the same session.

---

### Tools & Locations

| Layer | Framework | Location |
|---|---|---|
| Backend | pytest + pytest-cov | `backend/tests/` |
| Frontend components & hooks | Jest + `@testing-library/react-native` | `screens/__tests__/`, `components/__tests__/`, `hooks/__tests__/` |
| Frontend API mocking | `jest.mock()` (no external mock server needed) | inline in test files |

Run backend tests: `cd backend && pytest`
Run frontend tests: `npx jest` (once frontend test suite is bootstrapped)

---

### Backend Testing

#### What to write tests for
- Every new backend service method
- Every new router endpoint
- Every utility function with non-trivial logic

#### What makes a backend test thorough
Cover all of these categories where applicable:

1. **Happy path** — the expected successful case
2. **Auth/access** — unauthenticated requests rejected (403/401)
3. **Input validation** — missing required fields, wrong types, empty strings (422)
4. **Edge cases** — empty input, null/None values, single-item lists, large inputs
5. **Boundary values** — min/max limits, zero quantities, negative numbers
6. **Error paths** — downstream service failure (500), resource not found (404)
7. **Side effects** — counters only increment on success; DB operations happen in the right order
8. **Response shape** — all expected fields present with correct types
9. **Data isolation** — user A cannot read or modify user B's records; test with two distinct user IDs

#### Test file naming
- Router tests: `test_routers_<name>.py`
- Service tests: `test_services_<name>.py`

#### Mocking pattern
- Override DB: `app.dependency_overrides[get_db] = lambda: mock_db`
- Mock services: `@patch("app.routers.<module>.<ServiceName>.<method>")`
- Always tear down: `app.dependency_overrides.clear()` after each test class
- Auth is handled by `mock_supabase_token_validation` autouse fixture in `conftest.py`

#### Organisation
- One class per endpoint or service method (`class TestGenerateRecipe`)
- Name tests descriptively: `test_returns_404_when_recipe_not_found`, not `test_recipe_1`

---

### Frontend Testing

#### What to write tests for — new screen or component
- Renders without crashing given minimal valid props
- Renders correctly in every meaningful prop or state combination
- Loading state (spinner shown, action button disabled)
- Empty state (correct empty-state message shown)
- Error state (user-readable message shown, Retry button present and functional)
- Every conditional render branch — test both the shown and hidden paths
- Accessibility: key interactive elements have accessible labels

#### What to write tests for — new button or user interaction
- Pressing the button calls its handler exactly once (`fireEvent.press()` + `expect(mockFn).toHaveBeenCalledTimes(1)`)
- Pressing while loading/disabled does NOT call the handler
- Correct arguments are passed to the handler

#### What to write tests for — new form or input
- Valid input is accepted and the submit handler is called
- Each required field: leaving it empty blocks submission and shows an error
- Invalid format (wrong type, too short, etc.) shows an inline error
- Submitting a valid form calls the API with the correct payload shape

#### What to write tests for — new navigation trigger
- Tapping the element calls `navigation.navigate` with the correct screen name and params

#### What to write tests for — state & context integration
- Inserting, deleting, or updating a record updates context state and the change is immediately visible in all components reading that context (no manual refresh)
- Adding a duplicate item updates the existing record rather than inserting a second copy

#### What to write tests for — API response handling
- Component handles a successful response and renders the expected data
- Component does not crash when the response has missing keys, null values, or an empty array
- Component shows an error state when the API call rejects

#### Test file naming
- Screens: `screens/__tests__/<ScreenName>.test.tsx`
- Components: `components/__tests__/<ComponentName>.test.tsx`
- Hooks: `hooks/__tests__/use<HookName>.test.ts`

#### Mocking pattern
```typescript
// API service
jest.mock('../services/api')
const mockAPIService = APIService as jest.Mocked<typeof APIService>

// Navigation
const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: {} }),
}))

// Auth context — wrap with a helper that accepts overrides
function renderWithProviders(ui: ReactElement, { isGuest = false } = {}) {
  return render(<MockAuthProvider isGuest={isGuest}>{ui}</MockAuthProvider>)
}
```

---

### Security — Check on Every Endpoint & Input
- No sensitive data (tokens, keys, passwords, full stack traces) returned in any API response
- User A cannot read or modify User B's data — every endpoint that fetches by ID must verify ownership
- Receipt images and user content are not logged in plaintext
- File uploads (receipt images): validate that the input is a valid base64 image; reject payloads that exceed a safe size before sending to OpenAI

---

### Error Handling — Check on Every Feature
- All exceptions return structured JSON (`{"detail": "..."}`) — never a raw Python traceback
- DB or network failure returns a meaningful HTTP status (503/500), not an unhandled crash
- User-facing error messages are human-readable (no exception class names or SQL)
- Frontend components catch API errors and show an error state; they never leave the user on a blank or frozen screen

---

### Before Marking Any Feature Complete
- [ ] Backend tests written and `pytest` passes with no failures
- [ ] Frontend tests written and `npx jest` passes with no failures
- [ ] Auth / permission cases covered (unauthenticated, wrong user)
- [ ] Error and edge cases covered (missing data, API failure, empty state)
- [ ] No sensitive data exposed in responses or logs
- [ ] Security: data isolation verified (user A cannot access user B's data)

---

## Tech Notes

- Use `expo-camera` (`CameraView`, `useCameraPermissions`) — NOT the deprecated `expo-barcode-scanner`
- Auth middleware returns **403** (not 401) for missing tokens — tests should allow both
- Custom markers in `pytest.ini` must be registered before use (`--strict-markers` is on)
- The `autouse` fixture `mock_supabase_token_validation` in `conftest.py` mocks Supabase auth for all tests
