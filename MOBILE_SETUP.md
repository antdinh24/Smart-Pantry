# Smart Pantry Mobile App Setup Guide

## Current State
You already have a great foundation:
- ✅ React Native with Expo
- ✅ Navigation (React Navigation)
- ✅ Screens (Home, Pantry, Recipes, Grocery, etc.)
- ✅ Contexts for state management
- ✅ SQLite and MMKV installed
- ✅ Camera support (expo-camera)

## What We're Adding
- Database initialization services
- API layer to connect to FastAPI backend
- Authentication with Supabase
- Environment configuration
- Real data services (replacing mocks)

---

## Step 1: Install Additional Dependencies

Run this command in your project root:

```bash
npm install @supabase/supabase-js axios react-native-dotenv uuid
npm install --save-dev @types/uuid
```

**What each package does:**
- `@supabase/supabase-js` - Connects to your Supabase backend
- `axios` - Makes HTTP requests to your FastAPI server
- `react-native-dotenv` - Loads environment variables (API keys)
- `uuid` - Generates unique IDs for offline data
- `@types/uuid` - TypeScript types for uuid

---

## Step 2: Configure Environment Variables

I'll create configuration files for your API keys and backend URLs.

---

## Project Structure (After Setup)

```
Smart-Pantry/
├── App.tsx                          # Main entry (already exists)
├── screens/                         # Your screens (already exists)
│   ├── HomeScreen.tsx
│   ├── PantryScreen.tsx
│   ├── RecipesScreen.tsx
│   └── ...
├── contexts/                        # State management (already exists)
│   ├── AppContext.tsx
│   ├── PantryContext.tsx
│   ├── RecipesContext.tsx
│   └── AuthContext.tsx             # NEW - We'll add this
├── services/                        # Data layer
│   ├── mockDataService.ts          # (Existing - we'll replace)
│   ├── database.ts                 # NEW - SQLite initialization
│   ├── storage.ts                  # NEW - MMKV wrapper
│   ├── api.ts                      # NEW - FastAPI client
│   ├── supabase.ts                 # NEW - Supabase client
│   ├── sync.ts                     # NEW - Offline sync logic
│   └── pantryService.ts            # NEW - Pantry data operations
├── config/
│   └── env.ts                      # NEW - Environment config
├── types/                           # TypeScript types
│   └── navigation.ts               # (Already exists)
└── backend/                         # (Already created earlier)
```

---

## What Each New File Does

| File | Purpose |
|------|---------|
| `services/database.ts` | Initializes SQLite, creates tables |
| `services/storage.ts` | Wrapper for MMKV (settings, tokens) |
| `services/api.ts` | HTTP client for FastAPI backend |
| `services/supabase.ts` | Supabase client setup |
| `services/sync.ts` | Syncs local data to cloud |
| `services/pantryService.ts` | Pantry CRUD operations |
| `contexts/AuthContext.tsx` | Login/logout, user state |
| `config/env.ts` | Loads API URLs and keys |

---

## Next Steps
1. Install dependencies
2. Configure environment variables
3. Set up database services
4. Create API layer
5. Add authentication
6. Replace mock data with real services

Let's do this step by step!
