// Data Models
export interface PantryItem {
  id: number;
  name: string;
  category: string;
  quantity: string;
  expiry: string; // e.g., "2 days", "1 week", "2024-01-20"
  urgent: boolean;
  addedDate?: string;
}

export interface Recipe {
  id: number;
  name: string;
  time: string; // e.g., "30 min"
  servings: number;
  ingredients: number; // number of ingredients
  matchScore: number; // 0-100 match percentage
  description?: string;
  instructions?: string[];
  imageUrl?: string;
}

export interface GroceryItem {
  id: number;
  name: string;
  quantity: string;
  price: number;
  checked: boolean;
  category?: string;
}

export interface Meal {
  id: number;
  name: string;
  recipeId?: number;
  time?: string;
  ingredients?: string[];
}

export interface MealSchedule {
  day: string;
  date: string;
  meals: Meal[];
}

export interface DayOfWeek {
  day: string;
  date: string;
}

// Statistics
export interface PantryStats {
  totalItems: number;
  categoriesCount: number;
  expiringSoonCount: number;
  expiringItems: PantryItem[];
}

export interface GroceryStats {
  totalPrice: number;
  checkedCount: number;
  remainingCount: number;
  monthlyAverage: number;
}

