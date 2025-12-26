# Recipe Generation - Quick Start (5 Minutes)

Get your AI recipe generation with intelligent caching running NOW!

## Prerequisites

✅ Backend already running
✅ Authentication working
✅ Pantry endpoints working

## Step 1: Add OpenAI API Key (1 minute)

1. Get API key from https://platform.openai.com/api-keys
2. Update `backend/.env`:

```env
OPENAI_API_KEY=sk-proj-your-actual-key-here
```

**Cost**: ~$0.002-0.01 per recipe (but caching saves 70-95%!)

## Step 2: Run Migrations (2 minutes)

Go to https://app.supabase.com → SQL Editor

**Migration 1**: `migrations/002_create_recipes_table.sql`
- Copy entire file
- Paste and **Run**

**Migration 2**: `migrations/006_add_recipe_caching_fields.sql`
- Copy entire file
- Paste and **Run**

## Step 3: Restart Server (10 seconds)

```bash
# Stop current server (Ctrl+C)
# Restart:
uvicorn app.main:app --reload
```

## Step 4: Test It! (2 minutes)

### Generate Your First Recipe

Open http://localhost:8000/docs

1. Find `POST /api/v1/recipes/generate`
2. Click "Try it out"
3. Paste this:

```json
{
  "ingredients": ["chicken", "rice", "broccoli"],
  "preferences": {
    "cuisine": "Asian",
    "difficulty": "easy"
  }
}
```

4. Click **Execute**

**Expected**: Recipe generated in ~2 seconds
```json
{
  "from_cache": false,  ← First time!
  "message": "Generated new recipe with OpenAI..."
}
```

### Test Caching

**Try the EXACT same request again!**

**Expected**: Instant response (~50ms)
```json
{
  "from_cache": true,   ← Cached!
  "cache_similarity": 1.0,
  "api_call_saved": true
}
```

### Try Similar Ingredients

```json
{
  "ingredients": ["grilled chicken", "white rice", "steamed broccoli", "soy sauce"]
}
```

**Expected**: Should find cached recipe with ~85% similarity!

## Step 5: Check Cache Stats

```
GET /api/v1/recipes/cache/stats
```

Response:
```json
{
  "cache_hit_rate": 0.67,
  "estimated_cost_saved_usd": 0.002
}
```

## ✅ Success!

Your recipe generation is working with intelligent caching!

## What You Get

✅ **AI Recipe Generation**: GPT-4 powered recipes
✅ **Smart Caching**: 70-95% cost reduction
✅ **Instant Results**: Cached recipes in <100ms
✅ **Cost Tracking**: Monitor savings in real-time
✅ **Recipe Suggestions**: Based on pantry items
✅ **Pantry Matching**: "You have 80% of ingredients"

## Cost Savings

Without caching:
- 1000 users = $5.00

With caching (90% hit rate):
- 1000 users = $0.50
- **Savings: $4.50 (90%!)**

## Next Steps

1. **Generate 5-10 recipes** to populate cache
2. **Test with different ingredients** to see caching work
3. **Share with team** and watch savings grow!
4. **Monitor cache stats** to track effectiveness

## Full Documentation

- **Setup Guide**: `RECIPE_SETUP_GUIDE.md`
- **Caching Details**: `RECIPE_CACHING_GUIDE.md`
- **Implementation**: `RECIPE_IMPLEMENTATION_SUMMARY.md`

---

**That's it!** You now have production-ready AI recipe generation with 70-95% cost savings! 🎉
