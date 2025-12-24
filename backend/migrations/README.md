# Supabase Database Migrations

## How to Run These Migrations

### Option 1: Supabase Dashboard (Easiest)
1. Go to your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste each `.sql` file in order (001, 002, 003, 004)
5. Click **Run** for each one

### Option 2: Supabase CLI
```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

## Migration Order
Run these in sequence:
1. `001_create_users_table.sql` - User accounts and subscriptions
2. `002_create_recipes_table.sql` - Recipe storage
3. `003_create_ingredients_table.sql` - Normalized ingredient list
4. `004_create_receipts_table.sql` - Receipt tracking

## What Each Table Does

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `users` | User accounts and subscription status | Links to Supabase Auth, tracks premium status |
| `recipes` | AI-generated and user recipes | JSONB for flexible storage, full-text search |
| `ingredients` | Master ingredient list | Normalization, aliases, barcode support |
| `receipts` | Scanned grocery receipts | Budget tracking, OCR confidence scoring |

## Row Level Security (RLS)
All tables have RLS enabled. Users can only access their own data. This is enforced at the database level for security.

## Next Steps
After running migrations:
1. Enable Supabase Storage for receipt images
2. Create storage bucket: `receipt-images`
3. Set up storage policies (users can only access their own images)
