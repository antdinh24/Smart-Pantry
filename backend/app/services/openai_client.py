"""
OpenAI Client Service

Product Manager Note:
- Generates recipes using GPT-4
- Structured output for consistent format
- Optimized prompts for cost efficiency
- Error handling and retries
"""

import json
from typing import List, Dict, Optional
from openai import OpenAI
from app.config import get_settings

settings = get_settings()


class OpenAIRecipeGenerator:
    """Service for generating recipes with OpenAI"""

    def __init__(self):
        """Initialize OpenAI client"""
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = "gpt-4-turbo-preview"  # or "gpt-3.5-turbo" for lower cost

    def generate_recipe(
        self,
        ingredients: List[str],
        preferences: Optional[Dict] = None
    ) -> Dict:
        """
        Generate a recipe using OpenAI GPT-4.

        Product Manager Note:
        - Uses structured prompts for consistent output
        - Considers user preferences (cuisine, difficulty, etc.)
        - Returns JSON format for easy parsing
        - Cost: ~$0.002-0.01 per recipe (GPT-4 Turbo)

        Args:
            ingredients: List of available ingredients
            preferences: Optional preferences dict
                {
                    "cuisine": "Italian",
                    "difficulty": "easy",
                    "meal_type": "dinner",
                    "dietary_restrictions": ["vegetarian"],
                    "servings": 4
                }

        Returns:
            Dict with recipe data:
                {
                    "title": "Pasta Carbonara",
                    "description": "Classic Italian pasta...",
                    "ingredient_list": [...],
                    "instructions": [...],
                    "prep_time_minutes": 10,
                    "cook_time_minutes": 20,
                    ...
                }

        Raises:
            Exception: If OpenAI API fails
        """
        preferences = preferences or {}

        # Build the prompt
        prompt = self._build_recipe_prompt(ingredients, preferences)

        try:
            # Call OpenAI API
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a professional chef and recipe developer. Generate delicious, practical recipes based on available ingredients."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.7,  # Creative but consistent
                max_tokens=1500,
                response_format={"type": "json_object"}
            )

            # Parse response
            recipe_json = response.choices[0].message.content
            recipe_data = json.loads(recipe_json)

            # Validate and normalize response
            return self._normalize_recipe_response(recipe_data, preferences)

        except Exception as e:
            raise Exception(f"Recipe generation failed: {str(e)}")

    def _build_recipe_prompt(
        self,
        ingredients: List[str],
        preferences: Dict
    ) -> str:
        """
        Build optimized prompt for recipe generation.

        Product Manager Note:
        - Clear instructions reduce hallucinations
        - JSON format enforces structure
        - Examples improve output quality
        """
        # Format ingredients list
        ingredients_str = ", ".join(ingredients)

        # Build preferences string
        prefs_parts = []
        if preferences.get('cuisine'):
            prefs_parts.append(f"Cuisine: {preferences['cuisine']}")
        if preferences.get('difficulty'):
            prefs_parts.append(f"Difficulty: {preferences['difficulty']}")
        if preferences.get('meal_type'):
            prefs_parts.append(f"Meal type: {preferences['meal_type']}")
        if preferences.get('dietary_restrictions'):
            restrictions = ", ".join(preferences['dietary_restrictions'])
            prefs_parts.append(f"Dietary restrictions: {restrictions}")
        if preferences.get('servings'):
            prefs_parts.append(f"Servings: {preferences['servings']}")

        prefs_str = "\n".join(prefs_parts) if prefs_parts else "No specific preferences"

        prompt = f"""Create a recipe using these ingredients: {ingredients_str}

{prefs_str}

IMPORTANT: Return ONLY valid JSON in this exact format (no markdown, no extra text):

{{
    "title": "Recipe Name",
    "description": "Brief description of the dish (2-3 sentences)",
    "ingredient_list": [
        {{"name": "tomato", "quantity": "2", "unit": "cups"}},
        {{"name": "pasta", "quantity": "400", "unit": "grams"}}
    ],
    "instructions": [
        {{"step": 1, "text": "Detailed instruction for step 1"}},
        {{"step": 2, "text": "Detailed instruction for step 2"}}
    ],
    "prep_time_minutes": 15,
    "cook_time_minutes": 30,
    "servings": 4,
    "difficulty": "easy",
    "cuisine_type": "Italian",
    "meal_type": "dinner",
    "nutritional_info": {{
        "calories": 450,
        "protein": "20g",
        "carbs": "60g",
        "fat": "15g"
    }}
}}

Guidelines:
- Use as many of the provided ingredients as possible
- Create a complete, practical recipe
- Include clear, step-by-step instructions
- Estimate realistic prep and cook times
- Provide nutritional information (approximate)
- Make it delicious and achievable for home cooks"""

        return prompt

    def _normalize_recipe_response(
        self,
        recipe_data: Dict,
        preferences: Dict
    ) -> Dict:
        """
        Normalize and validate OpenAI response.

        Product Manager Note:
        - Ensures consistent format
        - Fills in missing fields with defaults
        - Validates required fields exist

        Args:
            recipe_data: Raw response from OpenAI
            preferences: Original preferences

        Returns:
            Normalized recipe dict
        """
        # Ensure required fields exist
        normalized = {
            "title": recipe_data.get("title", "Untitled Recipe"),
            "description": recipe_data.get("description", ""),
            "ingredient_list": recipe_data.get("ingredient_list", []),
            "instructions": recipe_data.get("instructions", []),
            "prep_time_minutes": recipe_data.get("prep_time_minutes", 0),
            "cook_time_minutes": recipe_data.get("cook_time_minutes", 0),
            "servings": recipe_data.get("servings", preferences.get("servings", 4)),
            "difficulty": recipe_data.get("difficulty", preferences.get("difficulty", "medium")),
            "cuisine_type": recipe_data.get("cuisine_type", preferences.get("cuisine", "")),
            "meal_type": recipe_data.get("meal_type", preferences.get("meal_type", "")),
            "nutritional_info": recipe_data.get("nutritional_info", {}),
        }

        return normalized

    def suggest_recipe_title(
        self,
        ingredients: List[str],
        cuisine: Optional[str] = None
    ) -> str:
        """
        Generate a creative recipe title (quick call for suggestions).

        Product Manager Note:
        - Lightweight call for recipe suggestions
        - Cheaper than full recipe generation
        - Used for browsing/discovery

        Args:
            ingredients: List of main ingredients
            cuisine: Optional cuisine type

        Returns:
            Recipe title suggestion
        """
        cuisine_str = f"{cuisine} " if cuisine else ""
        ingredients_str = ", ".join(ingredients[:3])  # Max 3 ingredients

        prompt = f"Suggest a creative {cuisine_str}recipe name using: {ingredients_str}. Return only the recipe name, nothing else."

        try:
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",  # Cheaper model for simple task
                messages=[
                    {"role": "system", "content": "You are a creative chef naming recipes."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.9,
                max_tokens=50
            )

            return response.choices[0].message.content.strip()

        except Exception:
            # Fallback to simple name
            return f"{cuisine_str}Dish with {ingredients[0]}"
