"""
seed_ingredients.py

Seeds the ingredient_cache table with ~150 common grocery ingredients.

WHY this script exists:
  The ingredient_cache table starts empty on a fresh deployment.
  OpenFoodFacts is great for branded products but returns poor results
  for plain ingredients like "tomatoes" or "chicken breast" that pantry
  users actually stock. This seed list fills that gap so suggestions
  work from day one.

  The backend's search service falls back to OpenFoodFacts when the cache
  has fewer than 10 results for a query. Once seeded, common queries like
  "chicken" or "milk" will hit the cache instantly, with no external API call.

USAGE:
  cd backend
  python seed_ingredients.py

IDEMPOTENT:
  Safe to run multiple times — entries that already exist (matched by
  normalized_name) are skipped, so re-running will not create duplicates.

POPULARITY VALUES:
  Initial popularity is set relative to how commonly an ingredient appears
  in a typical household. This primes the ranking so common items like
  "Salt" and "Eggs" surface first before real usage data accumulates.
"""

import sys
import os

# Make sure Python can find the 'app' package when run from the backend/ dir
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models.ingredient_cache import IngredientCache

# fmt: off
SEED_INGREDIENTS = [
    # ── Produce ──────────────────────────────────────────────────────────────
    {"ingredient_name": "Tomatoes",          "normalized_name": "tomatoes",          "category": "produce",    "popularity": 50},
    {"ingredient_name": "Cherry Tomatoes",   "normalized_name": "cherry tomatoes",   "category": "produce",    "popularity": 30},
    {"ingredient_name": "Onion",             "normalized_name": "onion",             "category": "produce",    "popularity": 60},
    {"ingredient_name": "Red Onion",         "normalized_name": "red onion",         "category": "produce",    "popularity": 40},
    {"ingredient_name": "Garlic",            "normalized_name": "garlic",            "category": "produce",    "popularity": 70},
    {"ingredient_name": "Ginger",            "normalized_name": "ginger",            "category": "produce",    "popularity": 35},
    {"ingredient_name": "Carrot",            "normalized_name": "carrot",            "category": "produce",    "popularity": 50},
    {"ingredient_name": "Potato",            "normalized_name": "potato",            "category": "produce",    "popularity": 55},
    {"ingredient_name": "Sweet Potato",      "normalized_name": "sweet potato",      "category": "produce",    "popularity": 40},
    {"ingredient_name": "Broccoli",          "normalized_name": "broccoli",          "category": "produce",    "popularity": 45},
    {"ingredient_name": "Cauliflower",       "normalized_name": "cauliflower",       "category": "produce",    "popularity": 35},
    {"ingredient_name": "Spinach",           "normalized_name": "spinach",           "category": "produce",    "popularity": 50},
    {"ingredient_name": "Kale",              "normalized_name": "kale",              "category": "produce",    "popularity": 30},
    {"ingredient_name": "Lettuce",           "normalized_name": "lettuce",           "category": "produce",    "popularity": 40},
    {"ingredient_name": "Cucumber",          "normalized_name": "cucumber",          "category": "produce",    "popularity": 40},
    {"ingredient_name": "Bell Pepper",       "normalized_name": "bell pepper",       "category": "produce",    "popularity": 45},
    {"ingredient_name": "Capsicum",          "normalized_name": "capsicum",          "category": "produce",    "popularity": 30},
    {"ingredient_name": "Zucchini",          "normalized_name": "zucchini",          "category": "produce",    "popularity": 30},
    {"ingredient_name": "Mushrooms",         "normalized_name": "mushrooms",         "category": "produce",    "popularity": 45},
    {"ingredient_name": "Avocado",           "normalized_name": "avocado",           "category": "produce",    "popularity": 50},
    {"ingredient_name": "Lemon",             "normalized_name": "lemon",             "category": "produce",    "popularity": 55},
    {"ingredient_name": "Lime",              "normalized_name": "lime",              "category": "produce",    "popularity": 40},
    {"ingredient_name": "Apple",             "normalized_name": "apple",             "category": "produce",    "popularity": 50},
    {"ingredient_name": "Banana",            "normalized_name": "banana",            "category": "produce",    "popularity": 50},
    {"ingredient_name": "Strawberries",      "normalized_name": "strawberries",      "category": "produce",    "popularity": 45},
    {"ingredient_name": "Blueberries",       "normalized_name": "blueberries",       "category": "produce",    "popularity": 40},
    {"ingredient_name": "Grapes",            "normalized_name": "grapes",            "category": "produce",    "popularity": 35},
    {"ingredient_name": "Orange",            "normalized_name": "orange",            "category": "produce",    "popularity": 45},
    {"ingredient_name": "Celery",            "normalized_name": "celery",            "category": "produce",    "popularity": 35},
    {"ingredient_name": "Peas",              "normalized_name": "peas",              "category": "produce",    "popularity": 35},
    {"ingredient_name": "Corn",              "normalized_name": "corn",              "category": "produce",    "popularity": 40},
    {"ingredient_name": "Green Beans",       "normalized_name": "green beans",       "category": "produce",    "popularity": 35},
    {"ingredient_name": "Asparagus",         "normalized_name": "asparagus",         "category": "produce",    "popularity": 30},
    {"ingredient_name": "Leek",              "normalized_name": "leek",              "category": "produce",    "popularity": 25},
    {"ingredient_name": "Spring Onion",      "normalized_name": "spring onion",      "category": "produce",    "popularity": 30},
    {"ingredient_name": "Chilli",            "normalized_name": "chilli",            "category": "produce",    "popularity": 40},
    # ── Protein ──────────────────────────────────────────────────────────────
    {"ingredient_name": "Chicken Breast",    "normalized_name": "chicken breast",    "category": "protein",    "popularity": 70},
    {"ingredient_name": "Chicken Thigh",     "normalized_name": "chicken thigh",     "category": "protein",    "popularity": 55},
    {"ingredient_name": "Ground Beef",       "normalized_name": "ground beef",       "category": "protein",    "popularity": 60},
    {"ingredient_name": "Beef Mince",        "normalized_name": "beef mince",        "category": "protein",    "popularity": 55},
    {"ingredient_name": "Steak",             "normalized_name": "steak",             "category": "protein",    "popularity": 45},
    {"ingredient_name": "Pork Mince",        "normalized_name": "pork mince",        "category": "protein",    "popularity": 35},
    {"ingredient_name": "Bacon",             "normalized_name": "bacon",             "category": "protein",    "popularity": 60},
    {"ingredient_name": "Ham",               "normalized_name": "ham",               "category": "protein",    "popularity": 50},
    {"ingredient_name": "Salmon",            "normalized_name": "salmon",            "category": "protein",    "popularity": 55},
    {"ingredient_name": "Tuna",              "normalized_name": "tuna",              "category": "protein",    "popularity": 50},
    {"ingredient_name": "Prawns",            "normalized_name": "prawns",            "category": "protein",    "popularity": 45},
    {"ingredient_name": "Shrimp",            "normalized_name": "shrimp",            "category": "protein",    "popularity": 45},
    {"ingredient_name": "Eggs",              "normalized_name": "eggs",              "category": "protein",    "popularity": 80},
    {"ingredient_name": "Tofu",              "normalized_name": "tofu",              "category": "protein",    "popularity": 40},
    {"ingredient_name": "Lentils",           "normalized_name": "lentils",           "category": "protein",    "popularity": 40},
    {"ingredient_name": "Chickpeas",         "normalized_name": "chickpeas",         "category": "protein",    "popularity": 45},
    {"ingredient_name": "Black Beans",       "normalized_name": "black beans",       "category": "protein",    "popularity": 40},
    {"ingredient_name": "Kidney Beans",      "normalized_name": "kidney beans",      "category": "protein",    "popularity": 35},
    # ── Dairy ─────────────────────────────────────────────────────────────────
    {"ingredient_name": "Whole Milk",        "normalized_name": "whole milk",        "category": "dairy",      "popularity": 70},
    {"ingredient_name": "Skim Milk",         "normalized_name": "skim milk",         "category": "dairy",      "popularity": 45},
    {"ingredient_name": "Butter",            "normalized_name": "butter",            "category": "dairy",      "popularity": 70},
    {"ingredient_name": "Cheddar Cheese",    "normalized_name": "cheddar cheese",    "category": "dairy",      "popularity": 55},
    {"ingredient_name": "Mozzarella",        "normalized_name": "mozzarella",        "category": "dairy",      "popularity": 50},
    {"ingredient_name": "Parmesan",          "normalized_name": "parmesan",          "category": "dairy",      "popularity": 45},
    {"ingredient_name": "Cream Cheese",      "normalized_name": "cream cheese",      "category": "dairy",      "popularity": 40},
    {"ingredient_name": "Greek Yogurt",      "normalized_name": "greek yogurt",      "category": "dairy",      "popularity": 45},
    {"ingredient_name": "Natural Yogurt",    "normalized_name": "natural yogurt",    "category": "dairy",      "popularity": 40},
    {"ingredient_name": "Heavy Cream",       "normalized_name": "heavy cream",       "category": "dairy",      "popularity": 40},
    {"ingredient_name": "Sour Cream",        "normalized_name": "sour cream",        "category": "dairy",      "popularity": 35},
    {"ingredient_name": "Feta Cheese",       "normalized_name": "feta cheese",       "category": "dairy",      "popularity": 35},
    # ── Grains ────────────────────────────────────────────────────────────────
    {"ingredient_name": "White Rice",        "normalized_name": "white rice",        "category": "grains",     "popularity": 65},
    {"ingredient_name": "Brown Rice",        "normalized_name": "brown rice",        "category": "grains",     "popularity": 50},
    {"ingredient_name": "Pasta",             "normalized_name": "pasta",             "category": "grains",     "popularity": 60},
    {"ingredient_name": "Spaghetti",         "normalized_name": "spaghetti",         "category": "grains",     "popularity": 55},
    {"ingredient_name": "Penne",             "normalized_name": "penne",             "category": "grains",     "popularity": 45},
    {"ingredient_name": "Bread",             "normalized_name": "bread",             "category": "grains",     "popularity": 65},
    {"ingredient_name": "White Bread",       "normalized_name": "white bread",       "category": "grains",     "popularity": 55},
    {"ingredient_name": "Sourdough Bread",   "normalized_name": "sourdough bread",   "category": "grains",     "popularity": 40},
    {"ingredient_name": "Oats",              "normalized_name": "oats",              "category": "grains",     "popularity": 50},
    {"ingredient_name": "Rolled Oats",       "normalized_name": "rolled oats",       "category": "grains",     "popularity": 45},
    {"ingredient_name": "Quinoa",            "normalized_name": "quinoa",            "category": "grains",     "popularity": 40},
    {"ingredient_name": "Plain Flour",       "normalized_name": "plain flour",       "category": "grains",     "popularity": 60},
    {"ingredient_name": "All-Purpose Flour", "normalized_name": "all-purpose flour", "category": "grains",     "popularity": 55},
    {"ingredient_name": "Bread Crumbs",      "normalized_name": "bread crumbs",      "category": "grains",     "popularity": 35},
    {"ingredient_name": "Tortilla Wraps",    "normalized_name": "tortilla wraps",    "category": "grains",     "popularity": 40},
    # ── Pantry staples ────────────────────────────────────────────────────────
    {"ingredient_name": "Olive Oil",         "normalized_name": "olive oil",         "category": "pantry",     "popularity": 75},
    {"ingredient_name": "Vegetable Oil",     "normalized_name": "vegetable oil",     "category": "pantry",     "popularity": 60},
    {"ingredient_name": "Salt",              "normalized_name": "salt",              "category": "pantry",     "popularity": 80},
    {"ingredient_name": "Black Pepper",      "normalized_name": "black pepper",      "category": "pantry",     "popularity": 80},
    {"ingredient_name": "Sugar",             "normalized_name": "sugar",             "category": "pantry",     "popularity": 70},
    {"ingredient_name": "Brown Sugar",       "normalized_name": "brown sugar",       "category": "pantry",     "popularity": 50},
    {"ingredient_name": "Honey",             "normalized_name": "honey",             "category": "pantry",     "popularity": 55},
    {"ingredient_name": "Coconut Milk",      "normalized_name": "coconut milk",      "category": "pantry",     "popularity": 45},
    {"ingredient_name": "Chicken Stock",     "normalized_name": "chicken stock",     "category": "pantry",     "popularity": 55},
    {"ingredient_name": "Beef Stock",        "normalized_name": "beef stock",        "category": "pantry",     "popularity": 45},
    {"ingredient_name": "Vegetable Stock",   "normalized_name": "vegetable stock",   "category": "pantry",     "popularity": 40},
    {"ingredient_name": "Baking Powder",     "normalized_name": "baking powder",     "category": "pantry",     "popularity": 45},
    {"ingredient_name": "Baking Soda",       "normalized_name": "baking soda",       "category": "pantry",     "popularity": 40},
    {"ingredient_name": "Vanilla Extract",   "normalized_name": "vanilla extract",   "category": "pantry",     "popularity": 40},
    {"ingredient_name": "Cumin",             "normalized_name": "cumin",             "category": "pantry",     "popularity": 45},
    {"ingredient_name": "Paprika",           "normalized_name": "paprika",           "category": "pantry",     "popularity": 45},
    {"ingredient_name": "Turmeric",          "normalized_name": "turmeric",          "category": "pantry",     "popularity": 40},
    {"ingredient_name": "Cinnamon",          "normalized_name": "cinnamon",          "category": "pantry",     "popularity": 45},
    {"ingredient_name": "Chilli Flakes",     "normalized_name": "chilli flakes",     "category": "pantry",     "popularity": 40},
    {"ingredient_name": "Dried Oregano",     "normalized_name": "dried oregano",     "category": "pantry",     "popularity": 35},
    {"ingredient_name": "Dried Thyme",       "normalized_name": "dried thyme",       "category": "pantry",     "popularity": 30},
    {"ingredient_name": "Bay Leaves",        "normalized_name": "bay leaves",        "category": "pantry",     "popularity": 30},
    {"ingredient_name": "Cornstarch",        "normalized_name": "cornstarch",        "category": "pantry",     "popularity": 40},
    # ── Condiments ───────────────────────────────────────────────────────────
    {"ingredient_name": "Soy Sauce",         "normalized_name": "soy sauce",         "category": "condiments", "popularity": 60},
    {"ingredient_name": "Tomato Sauce",      "normalized_name": "tomato sauce",      "category": "condiments", "popularity": 65},
    {"ingredient_name": "Tomato Paste",      "normalized_name": "tomato paste",      "category": "condiments", "popularity": 55},
    {"ingredient_name": "Vinegar",           "normalized_name": "vinegar",           "category": "condiments", "popularity": 45},
    {"ingredient_name": "Apple Cider Vinegar","normalized_name": "apple cider vinegar","category": "condiments","popularity": 40},
    {"ingredient_name": "Mustard",           "normalized_name": "mustard",           "category": "condiments", "popularity": 45},
    {"ingredient_name": "Mayonnaise",        "normalized_name": "mayonnaise",        "category": "condiments", "popularity": 50},
    {"ingredient_name": "Ketchup",           "normalized_name": "ketchup",           "category": "condiments", "popularity": 50},
    {"ingredient_name": "Sesame Oil",        "normalized_name": "sesame oil",        "category": "condiments", "popularity": 35},
    {"ingredient_name": "Fish Sauce",        "normalized_name": "fish sauce",        "category": "condiments", "popularity": 35},
    {"ingredient_name": "Oyster Sauce",      "normalized_name": "oyster sauce",      "category": "condiments", "popularity": 30},
    {"ingredient_name": "Worcestershire Sauce","normalized_name": "worcestershire sauce","category": "condiments","popularity": 30},
    {"ingredient_name": "Sriracha",          "normalized_name": "sriracha",          "category": "condiments", "popularity": 35},
    {"ingredient_name": "Hot Sauce",         "normalized_name": "hot sauce",         "category": "condiments", "popularity": 35},
    # ── Beverages ─────────────────────────────────────────────────────────────
    {"ingredient_name": "Orange Juice",      "normalized_name": "orange juice",      "category": "beverages",  "popularity": 45},
    {"ingredient_name": "Apple Juice",       "normalized_name": "apple juice",       "category": "beverages",  "popularity": 40},
    {"ingredient_name": "Sparkling Water",   "normalized_name": "sparkling water",   "category": "beverages",  "popularity": 35},
    # ── Snacks / Nuts ─────────────────────────────────────────────────────────
    {"ingredient_name": "Almonds",           "normalized_name": "almonds",           "category": "snacks",     "popularity": 40},
    {"ingredient_name": "Cashews",           "normalized_name": "cashews",           "category": "snacks",     "popularity": 35},
    {"ingredient_name": "Peanuts",           "normalized_name": "peanuts",           "category": "snacks",     "popularity": 40},
    {"ingredient_name": "Walnuts",           "normalized_name": "walnuts",           "category": "snacks",     "popularity": 35},
    {"ingredient_name": "Peanut Butter",     "normalized_name": "peanut butter",     "category": "snacks",     "popularity": 50},
    {"ingredient_name": "Dark Chocolate",    "normalized_name": "dark chocolate",    "category": "snacks",     "popularity": 40},
]
# fmt: on


def seed_ingredients():
    """
    Insert the SEED_INGREDIENTS list into the ingredient_cache table.

    Checks each entry by normalized_name before inserting — entries that
    already exist are skipped. Commits all new entries in a single transaction
    for efficiency.

    Returns:
        tuple: (added_count, skipped_count)
    """
    db = SessionLocal()
    try:
        added = 0
        skipped = 0

        for ingredient in SEED_INGREDIENTS:
            existing = db.query(IngredientCache).filter_by(
                normalized_name=ingredient["normalized_name"]
            ).first()

            if existing:
                skipped += 1
                continue

            db.add(IngredientCache(
                ingredient_name=ingredient["ingredient_name"],
                normalized_name=ingredient["normalized_name"],
                category=ingredient["category"],
                source="seed",
                popularity=ingredient.get("popularity", 0),
            ))
            added += 1

        db.commit()
        print(f"Seeding complete: {added} ingredients added, {skipped} already existed.")
        return added, skipped

    except Exception as e:
        db.rollback()
        print(f"Error seeding ingredients: {e}")
        raise

    finally:
        db.close()


if __name__ == "__main__":
    seed_ingredients()
