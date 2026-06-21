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

**Every method, function, or endpoint we create must have corresponding tests.**

### What to write tests for
- Every new backend service method
- Every new router endpoint
- Every utility function with non-trivial logic

### What makes a test suite thorough
Tests must cover all of these categories where applicable:

1. **Happy path** — the expected successful case
2. **Auth/access** — unauthenticated requests must be rejected (403/401)
3. **Input validation** — missing required fields, wrong types, empty strings (422)
4. **Edge cases** — empty input, null/None values, single-item lists, large inputs
5. **Boundary values** — min/max limits, zero quantities, negative numbers
6. **Error paths** — what happens when a downstream service fails (500), not found (404)
7. **Side effects** — counters only increment on success (not on error or cache hit), DB operations happen in the right order
8. **Response shape** — all expected fields are present with correct types

### Test file naming
- Backend router tests: `test_routers_<router_name>.py`
- Backend service tests: `test_services_<service_name>.py`
- Tests go in `backend/tests/`

### Mocking pattern (backend)
- Override the DB dependency: `app.dependency_overrides[get_db] = lambda: mock_db`
- Mock services with `@patch("app.routers.<module>.<ServiceName>.<method_name>")`
- Always tear down overrides after each test class (`app.dependency_overrides.clear()`)
- The `autouse` fixture `mock_supabase_token_validation` in `conftest.py` handles auth mocking

### Test organisation
- Group tests into classes by endpoint or method (`class TestGetRecipeById`, `class TestSaveRecipe`)
- Each class tests one logical unit — do not mix endpoints in one class
- Name tests descriptively: `test_returns_404_when_recipe_not_found`, not `test_recipe_1`

---

## Tech Notes

- Use `expo-camera` (`CameraView`, `useCameraPermissions`) — NOT the deprecated `expo-barcode-scanner`
- Auth middleware returns **403** (not 401) for missing tokens — tests should allow both
- Custom markers in `pytest.ini` must be registered before use (`--strict-markers` is on)
- The `autouse` fixture `mock_supabase_token_validation` in `conftest.py` mocks Supabase auth for all tests
