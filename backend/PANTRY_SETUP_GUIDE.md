# Pantry Management Setup Guide

Congratulations! The Pantry Management API is now fully implemented. This guide will help you set it up and test it.

## What Was Implemented

✅ **7 Pantry Endpoints**:
- `GET /api/v1/pantry` - Get all pantry items
- `POST /api/v1/pantry` - Add new item
- `PUT /api/v1/pantry/:id` - Update item
- `DELETE /api/v1/pantry/:id` - Delete item (soft delete)
- `POST /api/v1/pantry/sync` - Sync items from mobile
- `GET /api/v1/pantry/barcode/:code` - Barcode lookup (OpenFoodFacts)
- `GET /api/v1/pantry/expiring-soon` - Get expiring items

✅ **Features**:
- Ingredient name normalization (for recipe matching)
- Auto-categorization (produce, dairy, protein, etc.)
- Barcode scanning support (OpenFoodFacts API - free!)
- Expiration tracking
- Offline sync support
- Soft delete (preserves data for sync)

## Setup Steps

### Step 1: Install New Dependencies

```bash
cd backend
pip install -r requirements.txt
```

This will install `requests` (needed for barcode lookup).

### Step 2: Run the Pantry Migration

You need to create the `pantry_items` table in Supabase.

**Option A: Supabase Dashboard** (Recommended)

1. Go to https://app.supabase.com → Your Project
2. Click **SQL Editor** → **New Query**
3. Copy the contents of `migrations/005_create_pantry_items_table.sql`
4. Paste and click **Run**

**Option B: Python Script**

```bash
python run_migrations.py
```

### Step 3: Start the Backend Server

```bash
uvicorn app.main:app --reload
```

Server should start at: **http://localhost:8000**

### Step 4: Verify in Swagger UI

Open **http://localhost:8000/docs**

You should see the new **pantry** section with 7 endpoints!

## Testing the Endpoints

### Test 1: Add a Pantry Item

1. Open http://localhost:8000/docs
2. Find `POST /api/v1/pantry`
3. Click **Try it out**
4. First, you need to authenticate:
   - Register/login via `/auth/login` or `/auth/register`
   - Copy the `access_token` from the response
   - Click the **Authorize** button (lock icon 🔒)
   - Enter: `Bearer YOUR_TOKEN_HERE`
   - Click **Authorize**

5. Now add a pantry item:
   ```json
   {
     "ingredient_name": "Organic Tomatoes",
     "quantity": 5,
     "unit": "count",
     "location": "fridge",
     "expiration_date": "2025-01-15"
   }
   ```
6. Click **Execute**

You should get a 201 response with the created item!

Notice:
- `normalized_name` is automatically set to "tomato"
- `category` is automatically set to "produce"

### Test 2: Get All Pantry Items

1. Find `GET /api/v1/pantry`
2. Click **Try it out**
3. Click **Execute**

You should see the tomatoes you just added!

### Test 3: Barcode Lookup

Let's test barcode scanning:

1. Find `GET /api/v1/pantry/barcode/{barcode}`
2. Click **Try it out**
3. Enter a test barcode: `0011110000064` (Milk)
4. Click **Execute**

You should get product information from OpenFoodFacts:
```json
{
  "product_name": "Whole Milk",
  "brands": "...",
  "quantity": "1 gallon",
  "categories": "Dairy",
  "suggested_category": "dairy",
  "barcode": "0011110000064"
}
```

Try other barcodes:
- `737628064502` - Coca Cola
- `028400064316` - Cheerios
- `041196403008` - Ritz Crackers

### Test 4: Update an Item

1. Find `PUT /api/v1/pantry/{item_id}`
2. Click **Try it out**
3. Enter the `id` from the item you created
4. Update the quantity:
   ```json
   {
     "quantity": 3
   }
   ```
5. Click **Execute**

The item should be updated!

### Test 5: Sync from Mobile (Batch Upload)

This endpoint is used by the mobile app to sync offline changes:

1. Find `POST /api/v1/pantry/sync`
2. Click **Try it out**
3. Enter:
   ```json
   {
     "items": [
       {
         "id": "550e8400-e29b-41d4-a716-446655440000",
         "ingredient_name": "Eggs",
         "quantity": 12,
         "unit": "count",
         "category": "protein",
         "location": "fridge"
       },
       {
         "id": "550e8400-e29b-41d4-a716-446655440001",
         "ingredient_name": "Milk",
         "quantity": 1,
         "unit": "gallon",
         "category": "dairy",
         "location": "fridge"
       }
     ]
   }
   ```
4. Click **Execute**

You should get:
```json
{
  "status": "success",
  "created": 2,
  "updated": 0,
  "deleted": 0,
  "total_processed": 2
}
```

### Test 6: Get Expiring Items

1. Find `GET /api/v1/pantry/expiring-soon`
2. Click **Try it out**
3. Set `days` to 30 (items expiring in next 30 days)
4. Click **Execute**

You should see the tomatoes expiring on 2025-01-15!

### Test 7: Delete an Item

1. Find `DELETE /api/v1/pantry/{item_id}`
2. Click **Try it out**
3. Enter an item ID
4. Click **Execute**

The item is soft-deleted (marked as deleted but not removed from database).

## Testing with curl

If you prefer command line:

```bash
# Login first
TOKEN=$(curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "TestPassword123!"}' \
  | jq -r '.access_token')

# Add pantry item
curl -X POST http://localhost:8000/api/v1/pantry \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ingredient_name": "Bananas",
    "quantity": 6,
    "unit": "count",
    "category": "produce"
  }'

# Get all items
curl -X GET http://localhost:8000/api/v1/pantry \
  -H "Authorization: Bearer $TOKEN"

# Lookup barcode
curl -X GET "http://localhost:8000/api/v1/pantry/barcode/737628064502" \
  -H "Authorization: Bearer $TOKEN"
```

## Features in Detail

### 1. Ingredient Normalization

Ingredient names are automatically normalized for recipe matching:

```
"Fresh Organic Tomatoes!!!" → "tomato"
"Extra Virgin Olive Oil" → "olive oil"
"Free Range Eggs" → "egg"
```

This helps match ingredients across recipes and pantry items.

### 2. Auto-Categorization

If you don't provide a category, the system auto-detects it:

```
"Milk" → "dairy"
"Chicken Breast" → "protein"
"Tomatoes" → "produce"
"Pasta" → "grains"
"Ketchup" → "condiments"
```

### 3. Barcode Lookup

Uses OpenFoodFacts (free API, 2M+ products):
- No API key required
- Returns product name, brand, image
- Suggests category
- Provides nutritional info

### 4. Sync Support

Mobile app can sync offline changes:
- Creates new items
- Updates existing items
- Soft-deletes removed items
- Returns summary of changes

### 5. Expiration Tracking

Track expiring items to reduce food waste:
- Default: items expiring in next 7 days
- Configurable time window
- Sorted by expiration date

## Architecture

```
Mobile App (SQLite)
     ↓
  Sync API
     ↓
Backend (PostgreSQL) ←→ OpenFoodFacts API
     ↓
Recipe Matching
```

## What's Next?

Now that Pantry is working, you can:

1. **Test with Mobile App**: Update `config/env.ts` API URL
2. **Implement Recipes** (Sprint 3):
   - Recipe generation with OpenAI
   - Recipe suggestions based on pantry
   - Ingredient matching algorithm

## Troubleshooting

### "Pantry item not found"

Make sure you're using the correct item ID and that the item belongs to the authenticated user.

### Barcode lookup fails

- Check internet connection
- OpenFoodFacts API may be slow/down
- Not all barcodes are in the database
- Try a different barcode

### Sync conflicts

The system uses "last write wins" strategy. If you need more sophisticated conflict resolution, we can implement it later.

## Files Created

```
backend/
├── migrations/
│   └── 005_create_pantry_items_table.sql  ⭐ NEW
├── app/
│   ├── models/
│   │   └── pantry.py                      ⭐ NEW
│   ├── services/
│   │   ├── __init__.py                    ⭐ NEW
│   │   ├── pantry.py                      ⭐ NEW
│   │   └── barcode.py                     ⭐ NEW
│   └── routers/
│       └── pantry.py                      ⭐ NEW
├── requirements.txt                        ✅ Updated
└── PANTRY_SETUP_GUIDE.md                  ⭐ NEW (this file)
```

## API Progress

| Feature                  | Status | Endpoints |
|-------------------------|--------|-----------|
| **Authentication**      | ✅ DONE | 5/5       |
| **Pantry Management**   | ✅ DONE | 7/7       |
| **Recipe Generation**   | ❌ TODO | 0/5       |
| **Receipt Processing**  | ❌ TODO | 0/2       |
| **Budget Tracking**     | ❌ TODO | 0/2       |
| **Subscriptions**       | ❌ TODO | 0/2       |

**Total Progress**: 12/23 endpoints (52%)

---

**Congrats!** 🎉 You now have a fully functional pantry management system with barcode scanning!

Next: Implement Recipe Generation (Sprint 3) to generate AI-powered recipes based on pantry items.
