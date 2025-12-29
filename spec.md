# Spec — Pantry & Recipe Planner App

This document is a **technical specification** derived from the Product Requirements Document (PRD). It is intended for **engineering execution**, AI-assisted development (Vercel/Cursor), and backend–frontend alignment.

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
- OpenAI GPT API — recipe generation, rewriting, planning
- Google ML Kit — barcode scanning, receipt OCR

### Integrations
- OpenFoodFacts — barcode → product lookup
- Stripe — subscriptions
- AdMob — ads (free users)

---

## 4. Data Storage Strategy

### On-device
- **SQLite**: pantry items, recipes, schedules, receipts
- **SecureStore**: auth tokens, feature flags, preferences

### Cloud
- Supabase Postgres: shared recipes, users, analytics metadata
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
- Review and correct detected items
- View monthly grocery spend
- View average grocery bill

**Logic**
- Detect barcode first → fallback to OCR
- Extract totals, dates, store names
- Aggregate monthly spend

**Implementation**
- OCR: ML Kit (on-device)
- Parsing: FastAPI
- Storage: SQLite + Supabase

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

### 5.5 Weekly Recipe Scheduling (MVP)

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

### 5.6 Auto-Generated Weekly Meal Plans (Premium)

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

### Free Tier
- Ads enabled
- Manual meal planning
- Limited AI usage (view cached recipes only)

### Premium Tier
- Ad-free
- AI recipe generation
- Auto weekly meal planning
- Budget insights

**Pricing target**
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
- Reuse recipes across users
- Tiered model usage
- Daily AI limits per user
- Batch recipe generation

---

## 9. Non-Goals (MVP)

- Social sharing
- Community recipes
- Nutrition/macro tracking
- Smart kitchen integrations

---

## 10. Definition of MVP Complete

The MVP is considered complete when:
- Users can track pantry ingredients
- Users can see recipes they can cook
- Users can plan a week of meals
- Users can see grocery spend
- Premium subscription is live

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

### Implementation Phases

**Phase 1 (Current Sprint):**
- ✅ Database-backed patterns with seeding
- ✅ Hardcoded fallback mechanism
- ✅ Basic admin endpoint for adding patterns

**Phase 2 (Next Sprint):**
- 📋 User confirmation UI in ConfirmationScreen
- 📋 Merchant search dropdown with suggestions
- 📋 Pattern learning on user confirmation
- 📋 Track corrections in merchant_corrections table

**Phase 3 (Future):**
- 📋 Admin dashboard to review learned patterns
- 📋 Pattern analytics (which merchants are most common)
- 📋 ML model training from correction data
- 📋 Automatic pattern merging (detect duplicates)

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

