# Quick Start Guide

Get your Smart Pantry backend running in 5 minutes!

## Prerequisites

- Python 3.9+
- Supabase account with a project created
- `.env` file configured (see `.env.example`)

## Step 1: Install Dependencies (30 seconds)

```bash
cd backend
pip install -r requirements.txt
```

## Step 2: Run Migrations (2 minutes)

### Option A: Supabase Dashboard
1. Go to https://app.supabase.com → Your Project
2. Click **SQL Editor** → **New Query**
3. Copy/paste each file from `migrations/` folder in order:
   - `001_create_users_table.sql`
   - `002_create_recipes_table.sql`
   - `003_create_ingredients_table.sql`
   - `004_create_receipts_table.sql`
4. Click **Run** for each

### Option B: Python Script
```bash
python run_migrations.py
```

## Step 3: Start Server (10 seconds)

```bash
uvicorn app.main:app --reload
```

Server is now running at: **http://localhost:8000**

## Step 4: Test It! (1 minute)

### View API Docs
Open: **http://localhost:8000/docs**

### Register a Test User
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'
```

You should get back an access token! 🎉

### Test Protected Endpoint
```bash
# Get token from registration response above, then:
curl -X GET http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## What's Implemented?

✅ **Authentication** (5 endpoints)
- `POST /api/v1/auth/register` - Sign up
- `POST /api/v1/auth/login` - Sign in
- `GET /api/v1/auth/me` - Get current user
- `POST /api/v1/auth/logout` - Sign out
- `POST /api/v1/auth/refresh` - Refresh token

❌ **Pantry** (0/6 endpoints) - TODO
❌ **Recipes** (0/5 endpoints) - TODO
❌ **Receipts** (0/2 endpoints) - TODO
❌ **Budget** (0/2 endpoints) - TODO
❌ **Subscriptions** (0/2 endpoints) - TODO

## Environment Variables

Create `backend/.env`:

```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGc...  # Anon/Public key
SUPABASE_SERVICE_KEY=eyJhbGc...  # Service role key
DATABASE_URL=postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres

# OpenAI (for recipe generation - not used yet)
OPENAI_API_KEY=sk-...

# Stripe (for subscriptions - not used yet)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App Settings
ENVIRONMENT=development
API_VERSION=v1
ALLOWED_ORIGINS=http://localhost:19006,http://localhost:19000
```

Get these values from:
- **Supabase**: Project Settings → API
- **OpenAI**: https://platform.openai.com/api-keys
- **Stripe**: https://dashboard.stripe.com/test/apikeys

## Troubleshooting

### "Connection refused"
- Make sure backend is running (`uvicorn app.main:app --reload`)
- Check the port (default: 8000)

### "User not found in database"
- Run migrations (Step 2)
- Check Supabase → Table Editor → `users` table exists

### "Could not validate credentials"
- Check `SUPABASE_URL` and `SUPABASE_KEY` in `.env`
- Make sure you're using the access token (not refresh token)

### "Module not found"
- Install dependencies: `pip install -r requirements.txt`

## File Structure

```
backend/
├── app/
│   ├── main.py              # Entry point (registers routes)
│   ├── config.py            # Environment variables
│   ├── database.py          # Database connection
│   ├── models/              # Database models (User)
│   ├── middleware/          # Auth middleware (JWT validation)
│   ├── routers/             # API endpoints (auth)
│   └── services/            # Business logic (empty for now)
├── migrations/              # SQL migration files
├── tests/                   # Unit tests
├── requirements.txt         # Python dependencies
└── *.md                     # Documentation
```

## Next Steps

1. **Test with mobile app**: Update `config/env.ts` to point to backend
2. **Implement Pantry**: See `AUTH_IMPLEMENTATION_SUMMARY.md` → Sprint 2
3. **Implement Recipes**: See `AUTH_IMPLEMENTATION_SUMMARY.md` → Sprint 3

## Documentation

- 📖 **Full Setup Guide**: `AUTH_SETUP_GUIDE.md`
- 🧪 **Testing Guide**: `TESTING_AUTH.md`
- 📊 **Implementation Summary**: `AUTH_IMPLEMENTATION_SUMMARY.md`
- 🏗️ **Architecture**: `backend/SETUP.md`

## Need Help?

Check the detailed guides:
- **Setup issues**: See `AUTH_SETUP_GUIDE.md`
- **Testing**: See `TESTING_AUTH.md`
- **What's implemented**: See `AUTH_IMPLEMENTATION_SUMMARY.md`

---

**You're all set!** 🚀

The authentication system is working. Now you can build the remaining features (Pantry, Recipes, etc.) on top of this foundation.
