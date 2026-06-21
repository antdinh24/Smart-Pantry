# Backend Setup Scripts

Helper scripts to automate backend setup and testing.

## Available Scripts

### `npm run backend:check`
Checks if the backend server is running and displays server status.

```bash
npm run backend:check
```

**Output:**
- ✅ Backend is running - Shows server URL and health status
- ❌ Backend is not running - Shows instructions to start it

### `npm run backend:docs`
Opens the FastAPI interactive documentation in your default browser.

```bash
npm run backend:docs
```

**Requirements:**
- Backend server must be running on `http://localhost:8000`

### `npm run backend:setup`
Displays a complete setup guide with all steps needed to configure the backend.

```bash
npm run backend:setup
```

**Shows:**
1. How to run migrations in Supabase
2. How to start the backend server
3. How to access API documentation
4. How to register a test user
5. How to login with test user
6. How to test protected endpoints
7. How to connect React Native app

## Environment Variables

You can customize the backend URL by setting the `BACKEND_URL` environment variable:

```bash
BACKEND_URL=http://localhost:8000 npm run backend:check
```

## Manual Steps Reference

### 1. Run migrations in Supabase
- Go to https://app.supabase.com → Your Project
- Click **SQL Editor** → **New Query**
- Copy/paste each migration file from `backend/migrations/` in order
- Click **Run** for each migration

### 2. Start backend server
```bash
cd backend
venv\Scripts\activate  # Windows
# or
source venv/bin/activate  # Mac/Linux
uvicorn app.main:app --reload
```

### 3. Visit API documentation
Open: http://localhost:8000/docs

### 4. Register a test user
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "TestPassword123!"}'
```

### 5. Login with test user
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "TestPassword123!"}'
```

### 6. Access /auth/me with token
```bash
curl -X GET http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 7. Connect your React Native app
- Update `config/env.ts` with your backend URL
- Make sure `EXPO_PUBLIC_API_URL` points to `http://localhost:8000`
- Start your app: `npm start`

