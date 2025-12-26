# Authentication Setup Guide

This guide will help you set up authentication for the Smart Pantry backend.

## Prerequisites

1. **Supabase Project**: You should have a Supabase project created
2. **Environment Variables**: Your `.env` file should be configured with:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key
   SUPABASE_SERVICE_KEY=your-service-role-key
   DATABASE_URL=postgresql://postgres:your-password@db.your-project.supabase.co:5432/postgres
   ```

## Setup Steps

### Step 1: Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### Step 2: Run Database Migrations

You have two options to run the migrations:

#### Option A: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project: https://app.supabase.com
2. Navigate to **SQL Editor**
3. Run each migration file in order:
   - Copy the contents of `migrations/001_create_users_table.sql`
   - Paste into the SQL Editor
   - Click **Run**
   - Repeat for all migration files in numerical order

#### Option B: Using Python Script

```bash
python run_migrations.py
```

This will automatically run all migrations in the correct order.

### Step 3: Verify Database Tables

After running migrations, verify the tables were created:

1. Go to Supabase Dashboard → **Table Editor**
2. You should see the following tables:
   - `users` - User accounts and subscription info
   - `recipes` - Stored recipes
   - `ingredients` - Master ingredient list
   - `receipts` - Receipt tracking

### Step 4: Start the Backend Server

```bash
uvicorn app.main:app --reload
```

The server will start on `http://localhost:8000`

### Step 5: Test Authentication Endpoints

#### Check API Documentation

Visit `http://localhost:8000/docs` to see the interactive API documentation (Swagger UI).

You should see the following auth endpoints:
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/refresh`

#### Test Registration

Using curl:
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'
```

Expected response:
```json
{
  "user_id": "uuid-here",
  "email": "test@example.com",
  "access_token": "jwt-token-here",
  "refresh_token": "refresh-token-here",
  "subscription_status": "free"
}
```

#### Test Login

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'
```

#### Test Protected Endpoint (Get Current User)

```bash
# Replace YOUR_ACCESS_TOKEN with the token from login/register
curl -X GET http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Step 6: Run Unit Tests

```bash
cd backend
pytest tests/unit/test_auth.py -v
```

All auth tests should now pass!

## Troubleshooting

### "User not found in database"

This means the user exists in Supabase Auth but not in your PostgreSQL `users` table.

**Solution**: Make sure migrations were run successfully.

### "Could not validate credentials"

This means the JWT token is invalid or expired.

**Solution**:
- Check that `SUPABASE_URL` and `SUPABASE_KEY` are correct in `.env`
- Make sure you're using the access token (not refresh token)
- Tokens expire after 1 hour - get a new one by logging in again

### "Connection refused" or "Database connection failed"

**Solution**:
- Verify `DATABASE_URL` is correct
- Check if your Supabase project is active
- Ensure your IP is allowed in Supabase (Project Settings → Database)

### "Module not found" errors

**Solution**: Make sure you installed all dependencies:
```bash
pip install -r requirements.txt
```

## How Authentication Works

1. **User Registration**:
   - Frontend calls `POST /api/v1/auth/register`
   - Backend creates user in Supabase Auth (handles password hashing)
   - Backend creates user record in PostgreSQL `users` table
   - Returns JWT tokens

2. **User Login**:
   - Frontend calls `POST /api/v1/auth/login`
   - Backend validates credentials with Supabase Auth
   - Returns JWT tokens

3. **Protected API Calls**:
   - Frontend includes JWT token in Authorization header: `Bearer <token>`
   - Backend middleware validates token with Supabase
   - If valid, request proceeds with user info

4. **Token Refresh**:
   - Access tokens expire after 1 hour
   - Frontend calls `POST /api/v1/auth/refresh` with refresh token
   - Backend returns new access token

## Next Steps

Now that authentication is working, you can:

1. **Test with React Native App**: Update `config/env.ts` to point to your backend
2. **Implement Pantry Endpoints**: See `SETUP.md` Sprint 2
3. **Implement Recipe Endpoints**: See `SETUP.md` Sprint 3

## Security Notes

- Never commit `.env` file to git (it's in `.gitignore`)
- Access tokens expire after 1 hour (Supabase default)
- Refresh tokens are long-lived but can be revoked
- Row Level Security (RLS) is enabled on all tables - users can only see their own data
- Passwords are hashed by Supabase Auth (never stored in plain text)
