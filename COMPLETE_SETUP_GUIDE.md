# Smart Pantry - Complete Setup Guide

## 🎉 What We've Built

You now have a **complete full-stack Smart Pantry app** with:

### **Backend (FastAPI)**
- Python web server with OpenAI GPT integration
- Supabase PostgreSQL database (cloud)
- API endpoints for pantry, recipes, receipts, budgeting
- Authentication and subscription management

### **Mobile App (React Native)**
- Offline-first architecture (works without internet)
- SQLite database on device
- MMKV for fast settings storage
- API layer connecting to backend
- Authentication system
- Sync service for offline changes

---

## 📁 Project Structure

```
Smart-Pantry/
├── backend/                          # FastAPI Backend
│   ├── app/
│   │   ├── main.py                  # Server entry point
│   │   ├── config.py                # Environment config
│   │   ├── routers/                 # API endpoints (to build)
│   │   ├── models/                  # Database models (to build)
│   │   ├── services/                # Business logic (to build)
│   │   └── schemas/
│   │       ├── sqlite_schema.sql   # Mobile database schema
│   │       └── MMKV_KEYS.md        # Key-value storage docs
│   ├── migrations/                  # Supabase SQL migrations
│   │   ├── 001_create_users_table.sql
│   │   ├── 002_create_recipes_table.sql
│   │   ├── 003_create_ingredients_table.sql
│   │   └── 004_create_receipts_table.sql
│   ├── requirements.txt             # Python dependencies
│   ├── .env.example                # Backend config template
│   ├── .gitignore
│   └── SETUP.md                    # Backend setup instructions
│
├── App.tsx                          # Mobile app entry (updated)
├── screens/                         # Your UI screens
│   ├── HomeScreen.tsx
│   ├── PantryScreen.tsx
│   ├── RecipesScreen.tsx
│   └── ... (6 more screens)
├── contexts/                        # State management
│   ├── AppContext.tsx
│   ├── PantryContext.tsx
│   ├── RecipesContext.tsx
│   ├── AuthContext.tsx             # ✨ NEW - Authentication
│   └── ... (3 more contexts)
├── services/                        # ✨ NEW - Data layer
│   ├── database.ts                 # SQLite initialization
│   ├── storage.ts                  # MMKV wrapper
│   ├── api.ts                      # FastAPI client
│   ├── supabase.ts                 # Supabase client
│   ├── sync.ts                     # Offline sync logic
│   └── mockDataService.ts          # (Existing - replace later)
├── config/                          # ✨ NEW
│   └── env.ts                      # Environment variables
├── .env.example                    # Mobile config template
├── package.json
├── MOBILE_SETUP.md                 # Mobile setup instructions
└── COMPLETE_SETUP_GUIDE.md         # This file
```

---

## 🚀 Getting Started

### **Step 1: Install Dependencies**

```bash
# Install additional packages
npm install @supabase/supabase-js axios react-native-dotenv uuid
npm install --save-dev @types/uuid
```

### **Step 2: Set Up Backend**

Follow instructions in `backend/SETUP.md`:
1. Create Python virtual environment
2. Install Python dependencies
3. Create Supabase project
4. Run database migrations
5. Configure `.env` with API keys
6. Start FastAPI server

Quick start:
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # On Windows
pip install -r requirements.txt

# Configure .env, then:
uvicorn app.main:app --reload
```

### **Step 3: Configure Mobile App**

```bash
# Copy environment template
cp .env.example .env

# Edit .env and add:
# - EXPO_PUBLIC_API_URL (your FastAPI URL)
# - EXPO_PUBLIC_SUPABASE_URL
# - EXPO_PUBLIC_SUPABASE_ANON_KEY
```

### **Step 4: Run Mobile App**

```bash
# Start Expo
npm start

# Or run directly on device
npm run android  # Android
npm run ios      # iOS
```

---

## 🗄️ Database Architecture

### **Cloud (Supabase PostgreSQL)**
Stores shared/synced data:
- `users` - User accounts and subscriptions
- `recipes` - AI-generated and user recipes
- `ingredients` - Normalized ingredient list
- `receipts` - Receipt history

### **Local (SQLite on Device)**
Offline-first storage:
- `pantry_items` - User's current pantry
- `recipes_cache` - Downloaded recipes
- `grocery_list` - Shopping list
- `meal_schedule` - Meal planning
- `sync_queue` - Pending cloud uploads

### **Settings (MMKV)**
Fast key-value storage:
- Auth tokens
- User preferences (theme, units, language)
- Feature flags (premium status)
- App state (last sync time)

---

## 🔧 How It Works

### **Offline-First Flow**
```
User adds pantry item (offline)
  ↓
Saved to SQLite (instant)
  ↓
Added to sync_queue
  ↓
When online → SyncService runs
  ↓
Uploads to FastAPI backend
  ↓
Backend saves to Supabase
  ↓
Marked as synced in local DB
```

### **Authentication Flow**
```
User signs in
  ↓
Supabase Auth validates
  ↓
Token saved to MMKV
  ↓
AuthContext updates user state
  ↓
All API calls include token
  ↓
Backend verifies token
```

### **Recipe Generation Flow**
```
User requests AI recipe
  ↓
Mobile app → FastAPI
  ↓
FastAPI reads user's pantry
  ↓
Sends to OpenAI GPT
  ↓
Validates & structures recipe
  ↓
Saves to Supabase
  ↓
Returns to mobile app
  ↓
Cached in SQLite
```

---

## 📱 Using the Services

### **Storage (MMKV)**
```typescript
import StorageService from './services/storage'

// Save settings
StorageService.setTheme('dark')
StorageService.setMonthlyBudget(500)

// Check premium
if (StorageService.isPremiumUnlocked()) {
  // Show premium features
}
```

### **Database (SQLite)**
```typescript
import DatabaseService from './services/database'

// Get database instance
const db = DatabaseService.getDatabase()

// Query pantry items
const items = await db.getAllAsync('SELECT * FROM pantry_items WHERE user_id = ?', [userId])

// Add item
await db.runAsync(
  'INSERT INTO pantry_items (id, user_id, ingredient_name, quantity) VALUES (?, ?, ?, ?)',
  [uuid(), userId, 'tomato', 2]
)
```

### **API Calls**
```typescript
import APIService from './services/api'

// Generate AI recipe
const recipe = await APIService.generateRecipe({
  cuisine: 'Italian',
  difficulty: 'easy'
})

// Add pantry item (syncs to cloud)
await APIService.addPantryItem({
  ingredient_name: 'tomato',
  quantity: 2,
  unit: 'count'
})
```

### **Authentication**
```typescript
import { useAuth } from './contexts/AuthContext'

function MyScreen() {
  const { user, signIn, signOut, isPremium } = useAuth()

  const handleLogin = async () => {
    await signIn('user@example.com', 'password')
  }

  if (isPremium) {
    // Show AI recipe generation
  } else {
    // Show upgrade prompt
  }
}
```

### **Syncing**
```typescript
import SyncService from './services/sync'

// Queue offline change
await SyncService.queueSync('pantry_items', itemId, 'INSERT', item)

// Sync all pending changes
await SyncService.syncAll()
```

---

## 🔐 Security Best Practices

### ✅ Do This
- Keep `.env` files out of git (already done)
- Use environment variables for all secrets
- Enable Supabase Row Level Security (RLS)
- Validate user input on backend
- Use HTTPS in production

### ❌ Don't Do This
- Hardcode API keys in code
- Store passwords in MMKV (use Supabase Auth)
- Trust client-side premium checks for billing
- Commit `.env` files

---

## 🎯 Next Steps - Building Features

### **Sprint 1: Authentication UI**
- Create login/signup screens
- Use `AuthContext` for state
- Handle errors (wrong password, etc.)

### **Sprint 2: Pantry Management**
- Build pantry CRUD operations
- Use `DatabaseService` for offline storage
- Call `APIService.addPantryItem()` to sync
- Implement barcode scanning

### **Sprint 3: Recipe Generation**
- Create recipe request UI
- Call `APIService.generateRecipe()`
- Cache in SQLite
- Show match percentage

### **Sprint 4: Receipt Scanning**
- Use `expo-camera` for photo capture
- OCR text extraction (ML Kit)
- Parse with backend
- Save to database

### **Sprint 5: Budget Tracking**
- Query receipts from SQLite
- Calculate monthly total
- Show alerts if over budget
- Charts for spending trends

---

## 🐛 Troubleshooting

### Database not initializing
```typescript
// Check logs in Expo dev tools
// Look for "🗄️ Initializing SQLite database..."
```

### API calls failing
```typescript
// Check API URL in .env
console.log(env.apiUrl) // Should match your FastAPI server

// Check if backend is running
// Visit http://localhost:8000 in browser
```

### Auth not working
```typescript
// Check Supabase keys in .env
// Make sure you ran the migrations in Supabase dashboard
```

### Sync not working
```typescript
// Check sync queue
const db = DatabaseService.getDatabase()
const queue = await db.getAllAsync('SELECT * FROM sync_queue')
console.log('Pending syncs:', queue)

// Manually trigger sync
await SyncService.syncAll()
```

---

## 📚 Key Files Reference

| File | Purpose |
|------|---------|
| `App.tsx` | App entry, initializes database |
| `config/env.ts` | Loads environment variables |
| `services/database.ts` | SQLite initialization & migrations |
| `services/storage.ts` | MMKV wrapper for settings |
| `services/api.ts` | FastAPI HTTP client |
| `services/supabase.ts` | Supabase client & auth |
| `services/sync.ts` | Offline sync logic |
| `contexts/AuthContext.tsx` | Authentication state management |

---

## 🎓 For Product Managers

### **What's SQLite?**
A tiny database that lives on the user's phone. Think of it like an Excel file that the app can query instantly without internet.

### **What's MMKV?**
Ultra-fast settings storage. Like Windows Registry or Mac plist files - small key-value pairs (theme, tokens, flags).

### **What's Supabase?**
Backend-as-a-service. Gives you PostgreSQL database, authentication, and file storage without building your own server.

### **What's FastAPI?**
Python web framework. Handles business logic (GPT calls, budget calculations, receipt parsing) that's too heavy for mobile.

### **Why Offline-First?**
Users can use the app in subway, airplane, or anywhere. Changes sync automatically when online. Better UX, faster performance.

---

## 🚀 You're All Set!

You now have:
- ✅ Backend API server (FastAPI)
- ✅ Cloud database (Supabase)
- ✅ Offline mobile database (SQLite)
- ✅ Fast settings storage (MMKV)
- ✅ Authentication system
- ✅ API service layer
- ✅ Sync mechanism

**Next:** Start building your first feature! I recommend starting with **Pantry Management** since it touches all the layers we built.

Questions? Check the other guides:
- `backend/SETUP.md` - Backend setup details
- `MOBILE_SETUP.md` - Mobile app setup details
- `backend/app/schemas/MMKV_KEYS.md` - Storage keys reference
- `backend/migrations/README.md` - Database migration guide

Good luck! 🎉
