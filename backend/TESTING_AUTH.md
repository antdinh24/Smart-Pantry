# Authentication Testing Guide

This guide explains how to test the authentication implementation.

## Quick Test

To verify authentication is working:

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Start the backend server
uvicorn app.main:app --reload
```

In another terminal, test the endpoints:

```bash
# Test health check
curl http://localhost:8000/health

# Test registration
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "SecurePassword123!"
  }'
```

## Running Unit Tests

The auth unit tests require mocking Supabase since they don't connect to a real database.

### Prerequisites

Make sure you have:
1. All Python dependencies installed (`pip install -r requirements.txt`)
2. Backend server NOT running (tests will start their own test server)

### Run Tests

```bash
# Run all auth tests
pytest tests/unit/test_auth.py -v

# Run specific test
pytest tests/unit/test_auth.py::TestAuthEndpoints::test_login_success -v

# Run with coverage
pytest tests/unit/test_auth.py --cov=app.routers.auth --cov-report=html
```

## Manual Testing with Swagger UI

The easiest way to test authentication is using the built-in API documentation:

1. **Start the server**:
   ```bash
   uvicorn app.main:app --reload
   ```

2. **Open Swagger UI**: Navigate to http://localhost:8000/docs

3. **Test Registration**:
   - Click on `POST /api/v1/auth/register`
   - Click "Try it out"
   - Enter test credentials:
     ```json
     {
       "email": "test@example.com",
       "password": "TestPassword123!"
     }
     ```
   - Click "Execute"
   - You should get a 201 response with tokens

4. **Test Login**:
   - Click on `POST /api/v1/auth/login`
   - Click "Try it out"
   - Enter the same credentials
   - Click "Execute"
   - Copy the `access_token` from the response

5. **Test Protected Endpoint** (`/auth/me`):
   - Click on `GET /api/v1/auth/me`
   - Click "Try it out"
   - Click the lock icon 🔒 at the top right
   - Enter: `Bearer YOUR_ACCESS_TOKEN` (replace with actual token)
   - Click "Authorize"
   - Now click "Execute" on the `/auth/me` endpoint
   - You should see your user information

## Integration Testing with React Native App

To test authentication with your mobile app:

1. **Update frontend config**: Make sure `config/env.ts` points to your backend:
   ```typescript
   apiUrl: 'http://YOUR_IP:8000/api/v1'
   ```

2. **Start backend**:
   ```bash
   cd backend
   uvicorn app.main:app --reload --host 0.0.0.0
   ```

3. **Test in app**:
   - Open the app
   - Try signing up with a new account
   - Try logging in
   - Try accessing protected features

## Common Test Scenarios

### Scenario 1: New User Registration

**Expected Flow**:
1. User enters email and password
2. Backend creates user in Supabase Auth
3. Backend creates user record in database
4. Backend returns access tokens
5. User is automatically logged in

**Test**:
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "MyPassword123!"
  }'
```

**Expected Response** (200):
```json
{
  "user_id": "uuid-here",
  "email": "newuser@example.com",
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "subscription_status": "free"
}
```

### Scenario 2: Duplicate Email Registration

**Expected**: Registration should fail with 400

**Test**:
```bash
# Register once
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "duplicate@example.com", "password": "Pass123!"}'

# Try to register again with same email
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "duplicate@example.com", "password": "Pass123!"}'
```

**Expected Response** (400):
```json
{
  "detail": "Email already registered"
}
```

### Scenario 3: Login with Valid Credentials

**Test**:
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'
```

**Expected Response** (200):
```json
{
  "user_id": "uuid-here",
  "email": "test@example.com",
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "subscription_status": "free"
}
```

### Scenario 4: Login with Invalid Credentials

**Expected**: Login should fail with 401

**Test**:
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "WrongPassword"
  }'
```

**Expected Response** (401):
```json
{
  "detail": "Invalid email or password"
}
```

### Scenario 5: Access Protected Endpoint Without Token

**Expected**: Should fail with 401

**Test**:
```bash
curl -X GET http://localhost:8000/api/v1/auth/me
```

**Expected Response** (403):
```json
{
  "detail": "Not authenticated"
}
```

### Scenario 6: Access Protected Endpoint With Token

**Test**:
```bash
# First login to get token
TOKEN=$(curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "TestPassword123!"}' \
  | jq -r '.access_token')

# Then access protected endpoint
curl -X GET http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response** (200):
```json
{
  "id": "uuid-here",
  "user_id": "uuid-here",
  "email": "test@example.com",
  "subscription_status": "free",
  "subscription_end_date": null,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### Scenario 7: Token Refresh

**Test**:
```bash
# Login and get refresh token
REFRESH_TOKEN=$(curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "TestPassword123!"}' \
  | jq -r '.refresh_token')

# Use refresh token to get new access token
curl -X POST http://localhost:8000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\": \"$REFRESH_TOKEN\"}"
```

**Expected Response** (200):
```json
{
  "user_id": "uuid-here",
  "email": "test@example.com",
  "access_token": "new-token-here",
  "refresh_token": "new-refresh-token-here",
  "subscription_status": "free"
}
```

### Scenario 8: Logout

**Test**:
```bash
# Get token from login
TOKEN=$(curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "TestPassword123!"}' \
  | jq -r '.access_token')

# Logout
curl -X POST http://localhost:8000/api/v1/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response** (200):
```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

## Troubleshooting Tests

### Test fails with "connection refused"

**Problem**: Can't connect to database or Supabase

**Solution**:
- Make sure `.env` file has correct database URL
- For unit tests, this shouldn't matter (they use mocks)
- For integration tests, database must be running

### Test fails with "module not found"

**Problem**: Missing dependencies

**Solution**:
```bash
pip install -r requirements.txt
```

### Test fails with "table does not exist"

**Problem**: Database migrations not run

**Solution**:
```bash
python run_migrations.py
```

Or run migrations manually in Supabase dashboard (see AUTH_SETUP_GUIDE.md)

## Next Steps

After authentication tests pass:

1. Test with React Native app
2. Implement Pantry endpoints (Sprint 2)
3. Add integration tests
4. Test production deployment
