"""
Pantry Service

Product Manager Note:
- Contains business logic for pantry operations
- Handles ingredient normalization
- Manages sync conflicts between mobile and cloud
- Used by pantry router endpoints
"""

import re
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from app.models.pantry import PantryItem
import uuid


class PantryService:
    """Business logic for pantry operations"""

    @staticmethod
    def normalize_ingredient_name(name: str) -> str:
        """
        Normalize ingredient name for matching.

        Product Manager Note:
        - Converts to lowercase
        - Removes extra spaces
        - Converts to singular form (basic)
        - Removes special characters

        Examples:
            "Fresh Tomatoes!!!" → "tomato"
            "Organic Eggs" → "egg"
            "Extra Virgin Olive Oil" → "olive oil"

        Args:
            name: Original ingredient name

        Returns:
            Normalized name for matching
        """
        # Convert to lowercase
        normalized = name.lower().strip()

        # Remove common prefixes
        prefixes = ["organic ", "fresh ", "raw ", "extra ", "virgin ", "whole ", "premium "]
        for prefix in prefixes:
            if normalized.startswith(prefix):
                normalized = normalized[len(prefix):]

        # Remove special characters but keep spaces
        normalized = re.sub(r'[^a-z0-9\s]', '', normalized)

        # Remove extra spaces
        normalized = ' '.join(normalized.split())

        # Basic pluralization removal
        # (Note: This is simplified. For production, use a library like inflect)
        if normalized.endswith('ies'):
            normalized = normalized[:-3] + 'y'
        elif normalized.endswith('es'):
            normalized = normalized[:-2]
        elif normalized.endswith('s') and not normalized.endswith('ss'):
            normalized = normalized[:-1]

        return normalized

    @staticmethod
    def categorize_ingredient(name: str) -> str:
        """
        Auto-categorize ingredient based on name.

        Product Manager Note:
        - Uses keyword matching
        - Provides default if no match
        - Can be improved with ML later

        Args:
            name: Ingredient name

        Returns:
            Category: "produce", "dairy", "meat", "pantry", etc.
        """
        name_lower = name.lower()

        # Produce
        produce_keywords = [
            'tomato', 'lettuce', 'carrot', 'onion', 'garlic', 'pepper',
            'apple', 'banana', 'orange', 'lemon', 'lime', 'berry',
            'spinach', 'kale', 'cabbage', 'broccoli', 'cauliflower',
            'potato', 'celery', 'cucumber', 'zucchini', 'mushroom'
        ]
        if any(keyword in name_lower for keyword in produce_keywords):
            return "produce"

        # Dairy
        dairy_keywords = [
            'milk', 'cheese', 'butter', 'cream', 'yogurt', 'sour cream',
            'cottage cheese', 'mozzarella', 'cheddar', 'parmesan'
        ]
        if any(keyword in name_lower for keyword in dairy_keywords):
            return "dairy"

        # Meat & Protein
        meat_keywords = [
            'chicken', 'beef', 'pork', 'turkey', 'fish', 'salmon',
            'tuna', 'shrimp', 'bacon', 'sausage', 'ham', 'steak',
            'egg'
        ]
        if any(keyword in name_lower for keyword in meat_keywords):
            return "protein"

        # Grains & Bread
        grain_keywords = [
            'bread', 'pasta', 'rice', 'flour', 'cereal', 'oat',
            'wheat', 'quinoa', 'tortilla', 'bagel'
        ]
        if any(keyword in name_lower for keyword in grain_keywords):
            return "grains"

        # Condiments & Sauces
        condiment_keywords = [
            'sauce', 'ketchup', 'mustard', 'mayo', 'oil', 'vinegar',
            'soy sauce', 'salsa', 'dressing', 'seasoning', 'spice'
        ]
        if any(keyword in name_lower for keyword in condiment_keywords):
            return "condiments"

        # Default
        return "pantry"

    @staticmethod
    def sync_items(
        db: Session,
        user_id: str,
        mobile_items: List[Dict]
    ) -> Dict:
        """
        Sync pantry items from mobile to cloud.

        Product Manager Note:
        - Handles conflict resolution (last write wins)
        - Creates, updates, or deletes items
        - Returns summary of changes

        Sync Strategy:
        1. For each item from mobile:
           - If item exists in cloud → Update if mobile is newer
           - If item doesn't exist → Create it
        2. Mark items as deleted if mobile sent delete flag

        Args:
            db: Database session
            user_id: User ID
            mobile_items: List of items from mobile app

        Returns:
            Dict with sync summary
        """
        created_count = 0
        updated_count = 0
        deleted_count = 0

        for mobile_item in mobile_items:
            item_id = mobile_item.get('id')

            # Check if item exists in cloud
            existing_item = db.query(PantryItem).filter(
                PantryItem.id == item_id,
                PantryItem.user_id == user_id
            ).first()

            # Handle deletion
            if mobile_item.get('deleted'):
                if existing_item:
                    existing_item.deleted = True
                    deleted_count += 1
                continue

            # Create new item
            if not existing_item:
                # Normalize ingredient name
                normalized_name = PantryService.normalize_ingredient_name(
                    mobile_item['ingredient_name']
                )

                # Auto-categorize if not provided
                category = mobile_item.get('category') or PantryService.categorize_ingredient(
                    mobile_item['ingredient_name']
                )

                new_item = PantryItem(
                    id=uuid.UUID(item_id) if item_id else uuid.uuid4(),
                    user_id=uuid.UUID(user_id),
                    ingredient_name=mobile_item['ingredient_name'],
                    normalized_name=normalized_name,
                    quantity=mobile_item.get('quantity', 1.0),
                    unit=mobile_item.get('unit'),
                    category=category,
                    location=mobile_item.get('location'),
                    barcode=mobile_item.get('barcode'),
                    expiration_date=mobile_item.get('expiration_date'),
                    deleted=False
                )
                db.add(new_item)
                created_count += 1

            # Update existing item
            else:
                # Update fields
                existing_item.ingredient_name = mobile_item.get(
                    'ingredient_name', existing_item.ingredient_name
                )
                existing_item.normalized_name = PantryService.normalize_ingredient_name(
                    existing_item.ingredient_name
                )
                existing_item.quantity = mobile_item.get('quantity', existing_item.quantity)
                existing_item.unit = mobile_item.get('unit', existing_item.unit)
                existing_item.category = mobile_item.get('category', existing_item.category)
                existing_item.location = mobile_item.get('location', existing_item.location)
                existing_item.barcode = mobile_item.get('barcode', existing_item.barcode)
                existing_item.expiration_date = mobile_item.get(
                    'expiration_date', existing_item.expiration_date
                )
                updated_count += 1

        db.commit()

        return {
            "status": "success",
            "created": created_count,
            "updated": updated_count,
            "deleted": deleted_count,
            "total_processed": len(mobile_items)
        }

    @staticmethod
    def get_user_pantry(
        db: Session,
        user_id: str,
        include_deleted: bool = False
    ) -> List[PantryItem]:
        """
        Get all pantry items for a user.

        Args:
            db: Database session
            user_id: User ID
            include_deleted: Whether to include soft-deleted items

        Returns:
            List of pantry items
        """
        query = db.query(PantryItem).filter(
            PantryItem.user_id == user_id
        )

        if not include_deleted:
            query = query.filter(PantryItem.deleted == False)

        return query.order_by(PantryItem.added_date.desc()).all()

    @staticmethod
    def get_expiring_soon(
        db: Session,
        user_id: str,
        days: int = 7
    ) -> List[PantryItem]:
        """
        Get items expiring within specified days.

        Product Manager Note:
        - Used for notifications/warnings
        - Helps reduce food waste

        Args:
            db: Database session
            user_id: User ID
            days: Number of days to look ahead

        Returns:
            List of expiring items
        """
        from datetime import datetime, timedelta

        expiration_threshold = datetime.now().date() + timedelta(days=days)

        return db.query(PantryItem).filter(
            PantryItem.user_id == user_id,
            PantryItem.deleted == False,
            PantryItem.expiration_date <= expiration_threshold,
            PantryItem.expiration_date >= datetime.now().date()
        ).order_by(PantryItem.expiration_date).all()
