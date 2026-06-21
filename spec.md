# Spec — Pantry & Recipe Planner App

**Current Version: v0.03** — last updated 2026-06-21

This document is a **technical specification** derived from the Product Requirements Document (PRD). It is intended for **engineering execution**, AI-assisted development (Vercel/Cursor), and backend–frontend alignment. Sprint plans and task tracking live in [`SPRINTS.md`](SPRINTS.md).

---

## 1. Product Overview

**Goal**: Help users save **time and money** by:
- Tracking pantry ingredients
- Suggesting recipes using what they already have
- Minimizing grocery purchases
- Planning meals for the week
- Tracking grocery spend

**Target users**:
- Budget-conscious shoppers
- Students
- Busy professionals

---

## 2. Supported Platforms

- Android (primary MVP)
- iOS (post-MVP parity)

Framework:
- React Native (Expo + Dev Client)

---

## 3. Core Architecture

### Frontend (Mobile)
- React Native + Expo
- Local-first design
- Offline support

### Backend / API
- FastAPI (Python)
- Supabase (Postgres, Auth, Storage)

### AI / ML
- OpenAI GPT-4o — recipe generation AND receipt OCR (vision API)
- Google ML Kit — barcode scanning (receipt OCR deferred to Phase 2 swap)

### Integrations
- OpenFoodFacts — barcode → product lookup
- Stripe — subscriptions
- AdMob — ads (free users)

---

## 4. Data Storage Strategy

### On-device (current MVP)
- **SecureStore**: auth tokens, feature flags, preferences
- **SQLite**: deferred to Phase 2 — see Section 20 for offline sync plan

### Cloud (primary data store — MVP)
- Supabase Postgres: pantry items, recipes, receipts, users, analytics
- Supabase Storage: receipt images (optional)

---

## 5. Feature Specifications

### 5.1 Pantry Management (MVP)

**User actions**
- Add ingredient manually
- Scan barcode to add ingredient
- Edit quantity and unit
- Favorite ingredients

**Implementation**
- Barcode scanning: ML Kit
- Product lookup: OpenFoodFacts
- Normalization: backend
- Storage: SQLite (sync to Supabase optional)

---

### 5.2 Receipt Scanning & Spend Tracking (MVP)

**User actions**
- Take photo of grocery receipt
- Review and confirm/deselect detected items
- View monthly grocery spend
- View average grocery bill

**Logic**
- Camera captures still photo → sent to backend for GPT-4o vision extraction
- Extract line items, totals, dates, store names
- Aggregate monthly spend

**Implementation (as built — see Section 14 for full rationale)**
- ~~OCR: ML Kit (on-device)~~ — replaced by GPT-4o vision; ML Kit requires Expo prebuild which added too much MVP complexity
- OCR: GPT-4o vision API (server-side)
- Parsing: FastAPI ReceiptParser (two-step: GPT-4o extracts raw text → ReceiptParser structures it)
- Storage: Supabase (Receipt records + PantryItems created on confirm)
- Free tier limit: 8 receipt scans per month (enforced by UserUsage table — see Section 15)

**Planned future swap (Phase 2):**
- ML Kit on-device OCR to eliminate per-scan cost (~20 lines + Expo prebuild required)
- See Section 14 for migration plan

---

### 5.3 Recipe System (MVP)

The recipe system uses a **hybrid recommendation architecture** that prioritizes popular online recipes via metadata matching and falls back to AI-generated recipes only when necessary.

---

### 5.3.1 Data Flow — Hybrid Recipe Generation & Suggestions

#### Step 1: Pantry Normalization
- User pantry ingredients are stored locally in SQLite.
- Ingredient names and units are normalized (on-device or via backend sync).

---

#### Step 2: Popular Recipe Metadata Matching (Primary Path)
- The app queries the **Recipe Metadata Index** (synced from Supabase or cached locally).
- Stored metadata includes:
  - Recipe title
  - Source site name
  - URL
  - Normalized ingredient list
  - Cook time
  - Category/tags
- A matching algorithm scores recipes based on:
  - Ingredient overlap percentage
  - Number of missing ingredients
  - Cook time constraints
  - User-selected category filters

**If matches are found:**
- Ranked recipe cards are returned to the user.
- Each card displays:
  - Recipe title
  - Source site
  - Ingredient match %
  - Missing ingredients
  - Cook time
- Selecting a recipe opens the **original recipe page** in an in-app browser (no content is stored or replicated).

---

#### Step 3: AI-Generated Recipe Fallback (Secondary Path)

If no popular recipes meet a minimum match threshold:
- The app invokes the OpenAI API to generate a **fully original recipe**.
- AI inputs include:
  - Available pantry ingredients
  - Budget constraints
  - Time constraints
  - Desired dish category (if specified)

**AI output:**
- Structured recipe (ingredients, steps, cook time)
- Labeled clearly as AI-generated

**Post-processing:**
- Generated recipes are fingerprinted and stored in the shared recipe cache.
- Future users with similar inputs reuse cached recipes to reduce API costs.

---

#### Step 4: Offline Behavior
- Recipe metadata matching works offline using locally cached metadata.
- Opening third-party recipes requires an internet connection.
- If offline and no cached popular recipe is available, the app suggests AI-generated or previously cached recipes.

---

### 5.3.2 Legal & Compliance Guarantees
- No third-party recipe instructions or images are stored.
- Only factual metadata is indexed.
- Full recipes are accessed exclusively via external links.
- AI-generated recipes are original and non-derivative.

---


### 5.4 Shared Recipe Cache (Cost Control)

**Behavior**
- All AI-generated recipes stored in shared database
- Recipes fingerprinted by:
  - Core ingredients
  - Dish type
  - Time bucket
  - Budget level

**Reuse rules**
- If fingerprint match exists → reuse recipe
- Otherwise → generate and store

---

### 5.5 ~~Weekly Recipe Scheduling (MVP)~~ → post-MVP

**User actions**
- View weekly calendar (7 days)
- Add one or more recipes per day
- Manually plan meals (free users)

**Logic**
- Show missing ingredients for the week
- Show total cook time per day/week

**Storage**
- SQLite (local)

---

### 5.6 ~~Auto-Generated Weekly Meal Plans (Premium)~~ → post-MVP

**Behavior**
- One-tap auto-generate weekly plan
- Prioritizes pantry ingredients
- Minimizes new ingredients
- Respects:
  - Budget
  - Time constraints

**Output**
- Weekly recipe schedule
- Consolidated grocery list

---

### 5.7 Custom Recipe Upload (Premium)

**Inputs**
- Photo (OCR)
- Manual text entry
- Video transcript (user-provided)

**AI behavior**
- Rewrite into original structured recipe
- Normalize ingredients and steps

**Legal safeguards**
- User must confirm ownership or permission
- Raw scraped text is not stored

---

## 6. Monetization

### Free Tier (MVP — the only tier at launch)
- Ads enabled (AdMob — ~$0.20–$0.60/month per active user, covers scan costs)
- 8 receipt scans per month
- 10 AI recipe generations per month (cache hits are free and don't count toward limit)
- Unlimited access to shared recipe cache (recipes generated by other users)

### Premium Tier (post-MVP)
- Ad-free
- Unlimited receipt scans and recipe generations
- Auto weekly meal planning
- Budget insights
- Stripe integration

**Pricing target (post-MVP)**
- $6.99/month
- $49.99/year

---

## 7. Analytics & Metrics

### Firebase Analytics
- App opens
- Crashes
- Navigation flows

### Mixpanel
- Recipe generated
- Recipe cooked
- Week planned
- Upgrade clicked
- Conversion funnel

---

## 8. AI Cost Control Rules

- Cache all AI outputs
- Reuse recipes across users (80% ingredient similarity threshold — see Section 16)
- Tiered model usage
- **Monthly per-user limits (enforced via UserUsage table — see Section 15):**
  - Free tier: 8 receipt scans/month (~$0.02/scan midpoint, covered by AdMob)
  - Free tier: 10 AI recipe generations/month (cache hits are free and don't count)
- Batch recipe generation

---

## 9. Non-Goals (MVP)

- Social sharing
- Community recipes
- Nutrition/macro tracking
- Smart kitchen integrations
- Weekly meal scheduling (post-MVP)
- Premium / paid subscription tier (post-MVP)
- Stripe integration (post-MVP)
- Auto-generated meal plans (post-MVP)

---

## 10. Definition of MVP Complete

The MVP is considered complete when:
- Users can track pantry ingredients
- Users can scan barcodes to add items
- Users can scan receipts to bulk-add items
- Users can see recipe suggestions based on their pantry
- Users can generate AI recipes from their ingredients
- Free tier usage limits are enforced (8 scans, 10 recipe generations/month)

**Explicitly deferred to post-MVP:**
- Weekly meal scheduling (ScheduleScreen)
- Grocery spend tracking (GroceryScreen backend wiring)
- Premium subscription and Stripe integration
- Ad-free / AdMob integration

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| High AI costs | Aggressive caching & reuse |
| OCR errors | Manual correction flow |
| Legal issues | AI-original content + attribution |
| Low retention | Weekly planning habit loop |

---

**This spec is designed to be executable by an AI coding assistant or engineering team without additional clarification.**

---

## 12. Receipt & Barcode Processing: Merchant Detection Strategy

### Current Implementation (Phase 1)

Database-backed merchant patterns with hardcoded fallback for reliability.

**Architecture:**
- **Primary:** Database-stored patterns (dynamic, user-contributed)
- **Backup:** Hardcoded patterns in code (always available)
- **Ultimate fallback:** First line of receipt (never fails)

**Benefits:**
- Runtime updates without code deployment
- Tracks pattern usage/popularity
- Graceful degradation if database unavailable
- Easy to add new merchants via admin endpoint

---

### Future Enhancement (Phase 2): User-Contributed Learning

**Why User Learning Matters:**

OCR text from receipts varies significantly across:
- Regional chains (H-E-B in Texas, Publix in Southeast, etc.)
- International stores
- Small local markets
- Receipt format variations (abbreviations, spacing, fonts)

**How It Works:**

**1. Low Confidence Detection:**
- System scans receipt, OCR extracts: "WHOLE FOOD MARKET 123"
- Parser tries database patterns → no match found
- Parser tries hardcoded patterns → partial match with low confidence
- System detects merchant as "Whole Food Market" but confidence < 0.6

**2. User Verification Flow:**
- App shows confirmation screen with detected data
- Displays: "We detected: **Whole Food Market** - Is this correct?"
- User can:
  - ✅ Confirm (creates new pattern)
  - ✏️ Edit (user types "Whole Foods")
  - 🔍 Search merchants (dropdown with suggestions)

**3. Pattern Learning:**
```python
# User confirmed/corrected merchant
def learn_merchant_pattern(ocr_text: str, confirmed_merchant: str, db: Session):
    # Extract the raw merchant text from OCR
    raw_merchant = extract_raw_merchant_from_header(ocr_text)

    # Normalize to regex pattern
    # "WHOLE FOOD MARKET" → r'whole\s*food\s*market'
    pattern = normalize_to_regex(raw_merchant)

    # Check if pattern exists
    existing = db.query(MerchantPattern).filter_by(regex_pattern=pattern).first()

    if existing:
        # Increment usage count (reinforcement learning)
        existing.usage_count += 1
        existing.verified_count += 1  # User confirmed this pattern
    else:
        # Create new pattern
        new_pattern = MerchantPattern(
            merchant_name=confirmed_merchant,  # "Whole Foods"
            regex_pattern=pattern,             # r'whole\s*food\s*market'
            raw_variants=[raw_merchant],       # ["WHOLE FOOD MARKET"]
            usage_count=1,
            verified_count=1,
            created_by='user_learning',
            confidence_score=0.8  # Start with medium confidence
        )
        db.add(new_pattern)

    db.commit()
```

**4. Pattern Validation & Ranking:**
- Patterns with higher `verified_count` get priority in matching
- Low-usage patterns (< 3 verifications) have lower confidence
- Patterns matched but never verified by users get flagged for review

**5. Data Collection for Future ML:**
- Store OCR header text + user correction pairs
- Build training dataset: `{"ocr_text": "WHL FDS MKT", "label": "Whole Foods"}`
- Can train classification model when dataset reaches 1000+ examples

---

### Database Schema Extension

**Enhanced merchant_patterns table:**
```sql
CREATE TABLE merchant_patterns (
    id UUID PRIMARY KEY,
    merchant_name TEXT NOT NULL,          -- Normalized: "Whole Foods"
    regex_pattern TEXT NOT NULL,          -- Pattern: r'whole\s*foods?'
    raw_variants JSONB,                   -- OCR variations seen: ["WHOLE FOODS", "WHL FDS"]
    usage_count INT DEFAULT 0,            -- How many times this pattern matched
    verified_count INT DEFAULT 0,         -- How many times users confirmed this
    created_by TEXT,                      -- 'system' | 'user_learning' | 'admin'
    confidence_score DECIMAL(3,2),        -- 0.0 to 1.0
    is_active BOOLEAN DEFAULT TRUE,       -- Can be disabled if causing false positives
    created_at TIMESTAMP,
    last_used TIMESTAMP
);
```

**Track user corrections for ML training:**
```sql
CREATE TABLE merchant_corrections (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    ocr_header_text TEXT,                 -- Raw OCR: "WHOLE FOOD MARKET"
    detected_merchant TEXT,               -- What system guessed: "Whole Food Market"
    corrected_merchant TEXT,              -- What user said: "Whole Foods"
    pattern_created UUID REFERENCES merchant_patterns(id),  -- Which pattern was created
    created_at TIMESTAMP
);
```

---

### Success Metrics

- **Phase 1:** 80%+ merchant detection rate with hardcoded + DB patterns
- **Phase 2:** 95%+ detection rate after 1000 user corrections
- **Phase 3:** 98%+ detection rate with ML model

---

### Privacy Notes

- Raw OCR text stored temporarily (30 days) for pattern learning
- User corrections are anonymized (user_id removed after pattern creation)
- No receipt images stored (only extracted text)

---

## 13. Category Auto-Detection Enhancement

Similar user-learning approach can be applied to ingredient categorization:
- User corrects "Bananas" from "pantry" → "produce"
- System learns association: "banana" → "produce"
- Builds confidence in category keywords over time

---

## 14. Receipt Scanning Architecture Decision (GPT-4o vs ML Kit)

### Decision: GPT-4o Vision API (Server-Side)

The original spec called for Google ML Kit (on-device OCR). During implementation we chose GPT-4o vision instead for MVP.

**Reasons for GPT-4o:**
- ML Kit requires a custom Expo dev client (`expo prebuild`) — significant setup overhead for MVP
- GPT-4o handles varied receipt formats, fonts, and lighting conditions with no tuning
- Reuses existing OpenAI client already wired for recipe generation
- Faster to ship: ~20 lines of code vs. a full Expo managed → bare workflow migration

**Cost analysis:**
- GPT-4o vision: ~$0.01–$0.03 per receipt scan (midpoint ~$0.02)
- Free users capped at 8 scans/month → max $0.24/user/month at worst case
- AdMob revenue: ~$0.20–$0.60/month per active user — covers scan cost
- Premium users pay $6.99/month — unlimited scans well within margin

**Two-step pipeline (as implemented):**
1. `ReceiptScannerService.scan_image(image_base64)` — sends base64 image to GPT-4o vision with a prompt asking for plain receipt text
2. `ReceiptParser.parse_receipt_text(raw_text)` — existing parser structures the raw text into line items, merchant, date, total

This reuses all existing parsing logic without modification.

**Future ML Kit swap (Phase 2):**
- Replace `ReceiptScannerService.scan_image()` with ML Kit on-device OCR
- Estimated change: ~20 lines in `receipt_scanner.py` + `expo prebuild` migration
- Eliminates per-scan cost entirely — relevant once user base scales
- The two-step pipeline means the parser is unaffected by the OCR swap

### Receipt Confirm Screen Flow

```
ScanScreen (receipt mode)
  → takePictureAsync({ base64: true, quality: 0.7 })
  → POST /api/v1/receipts/scan   [UsageService checks limit first]
  → ReceiptConfirmScreen (checklist of line items)
  → POST /api/v1/receipts/confirm  [backend adds items to pantry]
  → PantryContext.refreshItems()
  → PantryScreen
```

**HTTP 429 handling:**
- If `check_receipt_limit()` raises 429, `ScanScreen` shows an Alert: "You've used all 8 free receipt scans this month."
- No navigation to ReceiptConfirmScreen occurs.
- User sees upgrade prompt.

---

## 15. Free Tier Usage Limits — UserUsage Table

### Design Decision: Separate Table (not columns on users)

We use a dedicated `user_usage` table rather than adding columns to the `users` table.

**Tradeoffs considered:**

| Approach | Pros | Cons |
|---|---|---|
| Columns on users | No join needed | Clutters users table; altering users table risks migration issues |
| Separate UserUsage table | Clean separation; easy to extend with more limit types | One extra JOIN per usage check |

The extra JOIN cost is negligible (keyed on user_id, always a single-row lookup).

### Schema

```sql
CREATE TABLE user_usage (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    receipt_scans_this_month INTEGER NOT NULL DEFAULT 0,
    recipe_generations_this_month INTEGER NOT NULL DEFAULT 0,
    reset_date DATE NOT NULL   -- first day of current month at row creation
);
```

### Lazy Monthly Reset (no cron job)

Counters are reset lazily on every access — no background task or cron job is needed.

`UsageService.get_or_create(db, user_id)` runs this logic every time:
1. Fetch (or create) the row for `user_id`
2. Compute `this_month_start = date.today().replace(day=1)`
3. If `row.reset_date < this_month_start` → reset both counters to 0, update `reset_date`, commit

This means the reset happens automatically the first time a user does anything in a new month.

### Limit Constants

```python
RECEIPT_SCAN_LIMIT = 8       # scans per month, free tier
RECIPE_GENERATION_LIMIT = 10 # generations per month, free tier (cache hits excluded)
```

### Counter Increment Timing

Counters only increment **after** the operation succeeds:
- Receipt scan: incremented after GPT-4o call succeeds AND Receipt record is committed to DB
- Recipe generation: incremented only when `result['from_cache'] == False` (real OpenAI call was made)

A failed scan or a cache hit does **not** consume quota.

---

## 16. Recipe Caching Implementation Details

### Shared Recipe Cache

All AI-generated recipes are stored as public records and reused across users.

**Similarity threshold: 80%**
- Before calling OpenAI, `RecipeSimilarityService` checks existing cached recipes
- If a cached recipe has ≥ 80% ingredient overlap with the request → return it (free, no API call)
- If no match ≥ 80% → generate a new recipe and store it as public for future users

**Cache hit behavior:**
- `from_cache: true` is returned in the API response
- The recipe generation counter is **not** incremented (cache hits are free)
- The `api_call_saved: true` flag is also set so analytics can track savings

**Generation counter logic in `POST /recipes/generate`:**
```
1. check_recipe_limit(db, user_id)          ← raises 429 if at limit
2. generate_or_find_recipe(...)             ← checks cache, may call OpenAI
3. if not result['from_cache']:
       increment_recipe_generations(db, user_id)  ← only real OpenAI calls count
```

---

## 17. Pantry Soft Delete

The `DELETE /api/v1/pantry/:id` endpoint does **not** remove the database row.

**Behavior:** Sets `deleted = True` on the PantryItem record.

**Reason:** Preserves sync integrity. If a device is offline when an item is deleted, the `deleted` flag propagates on next sync. Hard-deleting a row would cause sync conflicts where the deleted item reappears from another device's local state.

The frontend filters out `deleted=True` items when building the pantry list — users never see them.

---

## 18. Navigation Architecture

### Two Separate Stacks

The app uses two distinct React Navigation stacks:

- **AuthStack** (`AuthStackParamList`): `Login`, `Register` — shown when no user is logged in
- **AppStack** (`RootStackParamList`): all main app screens — shown when user is logged in

Keeping them separate prevents the back button from reaching the login screen from inside the app.

### Edit → Delete Navigation Pattern

`EditPantryItemScreen` uses `navigation.pop(2)` after a delete, not `navigation.goBack()`.

**Why:** The navigation stack at delete time is `PantryScreen → EditPantryItemScreen`. `goBack()` returns to `EditPantryItemScreen` which immediately shows "Item not found" (the deleted item is gone from PantryContext). `pop(2)` skips past `EditPantryItemScreen` entirely and lands on `PantryScreen`.

This requires `NativeStackNavigationProp` (not the generic `useNavigation` type) because `pop()` is a method only available on the native stack navigator's prop type.

---

## 19. Backend Test Architecture

### Dependency Injection Override Pattern

Tests use `app.dependency_overrides[get_db]` to inject a mock database session instead of connecting to a real database.

```python
@pytest.fixture
def override_db(mock_app):
    mock_db = Mock()
    mock_app.dependency_overrides[get_db] = lambda: mock_db
    yield mock_db
    mock_app.dependency_overrides.clear()
```

### Supabase Auth Mock

`conftest.py` contains an `autouse` fixture `mock_supabase_token_validation` that mocks Supabase JWT verification for all tests. This means tests can pass any Bearer token and the auth middleware will accept it without hitting Supabase.

### Auth Middleware Behavior

The auth middleware returns **403** (not 401) for missing or invalid tokens. Tests checking for authentication failures should accept both 401 and 403.

### PantryItem `server_default` Issue

`PantryItem` instances created in memory (not via DB insert) have `added_date = None` because `server_default` only runs on actual database inserts. Tests that check the full item response shape must use mock objects with pre-configured `to_dict()` rather than constructing real `PantryItem()` instances.

---

## 21. RecipeDetailScreen Navigation Design

### Decision: Option B — Screen Fetches Its Own Data

`RecipeDetailScreen` calls `GET /api/v1/recipes/:id` on mount rather than receiving a pre-fetched `Recipe` object as a navigation param.

**Navigation params:** `{ recipeId: string; title: string }`

- `recipeId` — passed to `APIService.getRecipe(recipeId)` on mount
- `title` — shown in the header **immediately**, before the fetch completes, so the user always sees a label rather than a blank header bar

**Why not pass the full recipe object as a nav param?**
Option A (pass the full object) was considered. Option B was chosen because:
1. When Phase 2 offline support is added (see §20), there is **one place** to add the SQLite cache lookup — inside `RecipeDetailScreen.loadRecipe()` — rather than two (RecipesScreen + any other future entry point)
2. The detail screen always shows fresh data regardless of how stale the summary card in RecipesScreen might be
3. Nav params are serialized; large objects with nested arrays (ingredient_list, instructions) are expensive to pass and can cause issues with deep-link serialization

**States the screen handles:**
- `loading` — spinner while GET is in flight; header still shows title
- `error` — friendly message with "Try Again" button; special-cases 404 vs. general failure
- `loaded` — full detail: ingredients list, numbered instructions, timings, match %, nutrition

---

## 20. SQLite Offline Support (Deferred — Phase 2)

### Decision: API-First for MVP

The original spec listed SQLite as the primary on-device store. This has been deferred. For MVP, Supabase is the single source of truth and an internet connection is required.

**Rationale:**
- Pantry management is almost always done with internet access — offline support is nice-to-have, not critical for launch
- A proper offline sync layer adds an estimated 2–3 weeks of implementation and testing complexity
- Shipping a reliable online-only app is more valuable than shipping a buggy offline-capable one

### What SQLite Would Enable (Phase 2 goals)
- View pantry while offline (no network required for list reads)
- Add/edit items while offline — mutations queued and replayed on reconnect
- Fast list renders (no API round-trip latency)

### Why Offline Sync Is Hard for This App

**1. UUID ownership**
The current backend generates UUIDs for all pantry items on insert. Offline-created items need client-generated UUIDs that must be reconciled when synced. The client UUID must replace the server UUID everywhere it is referenced locally.

**2. Conflict resolution**
If a user edits an item on device A while offline, and deletes the same item on device B while online, there is no clear winner. The app needs a defined policy — e.g. "last write wins by `last_updated` timestamp" or "deletes always win."

**3. Sync queue**
Offline mutations (add, update, delete) must be stored in a local queue and replayed in order when connectivity returns. Out-of-order replay can produce incorrect state.

**4. Soft delete dependency**
The existing soft-delete pattern (`deleted = True`) is a prerequisite for correct sync — it's already in place. Hard deletes would cause deleted items to reappear from an offline device's local copy.

### Prerequisites Already in Place
- `last_updated` timestamp on every `PantryItem` — the key field for conflict resolution
- Soft delete (`deleted` flag) — prevents sync resurrection of deleted items
- UUID primary keys — compatible with client-side UUID generation

### Recommended Phase 2 Approach

**Local schema (SQLite via `expo-sqlite`):**
- Mirror the `PantryItem` shape exactly
- Add a `sync_status` column: `'synced' | 'pending_add' | 'pending_update' | 'pending_delete'`

**Sync flow:**
1. On app open (online): pull server state, merge into local SQLite using `last_updated` as the tiebreaker
2. On mutation (add/update/delete): write to SQLite immediately, mark `sync_status = 'pending_*'`
3. Background sync job: flush pending rows to API, mark `sync_status = 'synced'` on success
4. On conflict (server `last_updated` > local `last_updated`): server wins — overwrite local

**What does NOT need to change for Phase 2:**
- Backend API — it is already the source of truth; the client just adds a local cache layer
- `PantryContext` interface — screens call the same `addItem` / `updateItem` / `deleteItem`; the implementation underneath swaps from API-direct to SQLite-first

**What changes for Phase 2:**
- `PantryContext` reads from SQLite instead of API on mount (faster)
- `APIService` calls become background sync rather than blocking foreground calls
- A `SyncService` is introduced to manage the pending queue and conflict resolution

---

## 22. Guest Mode

### Decision: Supabase Anonymous Auth (Option A)

Guest users sign in via `supabase.auth.signInAnonymously()`, which creates a real anonymous Supabase session with a valid UUID and JWT. All backend API calls work normally under this identity.

**Rationale:** Chosen for MVP simplicity. Option B (local-only SQLite guest) requires the offline sync layer which is deferred to Phase 2.

**Prerequisite:** "Anonymous sign-ins" must be enabled in the Supabase dashboard: Authentication → Providers → Anonymous sign-ins → toggle ON.

### What guest users can do

| Feature | Available to guest? | Reason |
|---|---|---|
| Add pantry items manually | ✅ Yes | No cost |
| Barcode lookup (OpenFoodFacts) | ✅ Yes | No cost — OpenFoodFacts is free |
| View recipe suggestions | ✅ Yes | Read-only, no OpenAI call |
| Generate AI recipes | ❌ Blocked | Calls OpenAI — cost abuse risk |
| Scan receipts (GPT-4o) | ❌ Blocked | Calls OpenAI — cost abuse risk |

### Data persistence

Guest data is stored in Supabase PostgreSQL under the anonymous UUID — it **persists between app close/reopen** via the session stored in SecureStore, the same as a regular user session. Data is lost if the user uninstalls the app, explicitly signs out, or the Supabase refresh token expires from inactivity (default: 7 days).

### Abuse protection

Blocking recipe generation and receipt scanning at the UI level prevents cost abuse via unlimited anonymous accounts. Guests can create unlimited anonymous accounts, but each one can only use free features (manual pantry entry, barcode lookup), neither of which has a per-request cost.

### Upgrade path

Anonymous sessions can be upgraded to a full account via `supabase.auth.updateUser({ email, password })` without losing the existing pantry data. This is a Phase 2 enhancement — for MVP, guests who want an account must sign out and register fresh.

### UI gates

- `RecipesScreen.handleGenerate()` — checks `isGuest` before calling OpenAI; shows an Alert with "Sign Up Free" which calls `signOut()`, returning the user to the AuthStack
- `ScanScreen.handleTakePicture()` — same gate for receipt mode only; barcode mode is unrestricted

---

## 23. Production Hosting

### Decision: Render (free tier)

The backend is deployed to [Render](https://render.com) using the free web service tier.

**Why Render over Railway:**
- Railway's free tier expired after 30 days / $5 credit — not sustainable for a pre-revenue project
- Render's free tier has no time or credit limit
- No credit card required

**Free tier tradeoff — cold starts:**
- Render spins the server down after 15 minutes of no traffic
- The first API call after inactivity takes ~30 seconds while the server wakes up
- Acceptable for a test project; upgrade to Render Starter ($7/month) when launching publicly to eliminate this

**Deployment config:**
- `render.yaml` at the repo root defines the service (root directory: `backend`, build: `pip install -r requirements.txt`, start: `uvicorn app.main:app`)
- Render deploys automatically on every push to `main`
- Secrets (database URL, Supabase keys, OpenAI key) are set in the Render dashboard — never committed to the repo

**Stripe keys:**
- `stripe_secret_key` and `stripe_webhook_secret` in `app/config.py` are optional fields (default empty string) because Stripe is post-MVP
- The server starts without them; Stripe-related code will fail gracefully if called before real keys are configured

---

## 24. Auth Token Expiry Handling

Supabase access tokens expire every hour. When an expired token reaches the backend, it returns HTTP 401.

### Pattern (as implemented in `services/api.ts`)

The axios response interceptor handles 401s in two steps:

1. **Silent refresh** — call `supabase.auth.refreshSession()`, which uses the stored refresh token (valid for 7 days by default). If successful, update the access token in SecureStore and **retry the original request**. The user sees nothing.
2. **Sign-out fallback** — if the refresh fails (refresh token expired, user logged out on another device, or any error), call `supabase.auth.signOut()` and clear SecureStore. On the next render cycle, `AuthContext` detects no session and returns the user to the login screen.

**Why retry once (`_retry` flag):** without it, a failure on the retried request would loop. The `_retry = true` flag on the original request config ensures the interceptor only attempts a refresh once per request.

**Why not call `AuthContext.signOut()`:** `api.ts` is not a React component and has no access to React context. Calling `supabase.auth.signOut()` directly is equivalent — `AuthContext.checkAuthStatus()` picks up the cleared session on the next render.

---

## Version History

### v0.03 — 2026-06-21
- **Added §23 Production Hosting**: Render free tier chosen over Railway (Railway trial expired). Cold start tradeoff accepted for pre-revenue test phase. Stripe config fields made optional (empty string defaults) so server starts without them until Stripe is built.
- **Added §24 Auth Token Expiry Handling**: Silent refresh via `supabase.auth.refreshSession()` with one retry, sign-out fallback if refresh fails. Pattern lives in `services/api.ts` response interceptor.

### v0.02 — 2026-06-20
- **Added §22 Guest Mode**: Supabase anonymous auth (Option A). Chose over local-only SQLite (Option B) for MVP simplicity — SQLite offline sync is Phase 2 work. AI features (recipe generation, receipt scanning) are blocked for guests to prevent cost abuse via unlimited anonymous accounts.

### v0.01 — 2026-06-20

Initial versioned specification. This version captures the state of the project after Sprint 1 (backend foundation) and Sprint 2 (receipts and barcode scanning). All content above this section reflects the current design.

**Changes from pre-versioned state:**

- **§12 Merchant Detection — Implementation Phases checklist**: Removed the Phase 1/2/3 task checklists (✅/📋 items) from this section. Sprint task tracking now lives in `SPRINTS.md`. The architectural content (strategy, schema, learning flow, success metrics) remains here.
- **Policy change — strikethroughs**: Prior to v0.01, changed decisions were marked with `~~strikethrough~~` inline. Going forward, inline content is updated to reflect current plans and all historical changes are recorded here in Version History. Existing strikethroughs in §5.2 and §5.5/§5.6 are pre-versioning artifacts and will be cleaned up in the next version update.
- **Policy change — sprint plans**: Sprint and phase plans previously embedded in this file are now maintained exclusively in `SPRINTS.md`.

