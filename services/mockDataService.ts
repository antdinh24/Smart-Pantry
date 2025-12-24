import { PantryItem, Recipe, GroceryItem, MealSchedule, Meal, DayOfWeek } from '../types';

// Mock Pantry Items
export const mockPantryItems: PantryItem[] = [
  { id: 1, name: "Whole Milk", category: "Dairy", quantity: "1 gallon", expiry: "2 days", urgent: true },
  { id: 2, name: "Greek Yogurt", category: "Dairy", quantity: "3 cups", expiry: "3 days", urgent: true },
  { id: 3, name: "Cheddar Cheese", category: "Dairy", quantity: "8 oz", expiry: "2 weeks", urgent: false },
  { id: 4, name: "Chicken Breast", category: "Meat", quantity: "2 lbs", expiry: "4 days", urgent: false },
  { id: 5, name: "Romaine Lettuce", category: "Produce", quantity: "1 head", expiry: "1 day", urgent: true },
  { id: 6, name: "Tomatoes", category: "Produce", quantity: "6 units", expiry: "5 days", urgent: false },
  { id: 7, name: "Pasta", category: "Pantry", quantity: "1 lb", expiry: "6 months", urgent: false },
  { id: 8, name: "Olive Oil", category: "Pantry", quantity: "750 ml", expiry: "1 year", urgent: false },
  { id: 9, name: "Brown Rice", category: "Grains", quantity: "2 cups", expiry: "1 year", urgent: false },
  { id: 10, name: "Broccoli", category: "Produce", quantity: "1 head", expiry: "6 days", urgent: false },
  { id: 11, name: "Garlic", category: "Produce", quantity: "1 bulb", expiry: "2 weeks", urgent: false },
  { id: 12, name: "Ground Beef", category: "Meat", quantity: "1 lb", expiry: "3 days", urgent: true },
  { id: 13, name: "Eggs", category: "Dairy", quantity: "1 dozen", expiry: "7 days", urgent: false },
  { id: 14, name: "Bread", category: "Bakery", quantity: "1 loaf", expiry: "5 days", urgent: false },
  { id: 15, name: "Onions", category: "Produce", quantity: "3 units", expiry: "2 weeks", urgent: false },
];

// Mock Recipes
export const mockRecipes: Recipe[] = [
  {
    id: 1,
    name: "Creamy Chicken Pasta",
    time: "30 min",
    servings: 4,
    ingredients: 12,
    matchScore: 95,
    description: "A rich and creamy pasta dish with tender chicken",
  },
  {
    id: 2,
    name: "Greek Salad Bowl",
    time: "15 min",
    servings: 2,
    ingredients: 8,
    matchScore: 90,
    description: "Fresh Mediterranean salad with crisp vegetables",
  },
  {
    id: 3,
    name: "Tomato Basil Soup",
    time: "25 min",
    servings: 4,
    ingredients: 10,
    matchScore: 85,
    description: "Classic tomato soup with fresh basil",
  },
  {
    id: 4,
    name: "Beef and Rice Bowl",
    time: "35 min",
    servings: 3,
    ingredients: 9,
    matchScore: 88,
    description: "Hearty bowl with seasoned ground beef and rice",
  },
  {
    id: 5,
    name: "Stir-Fried Vegetables",
    time: "20 min",
    servings: 2,
    ingredients: 7,
    matchScore: 75,
    description: "Quick and healthy vegetable stir-fry",
  },
  {
    id: 6,
    name: "Garlic Bread",
    time: "10 min",
    servings: 4,
    ingredients: 5,
    matchScore: 70,
    description: "Crispy garlic bread with herbs",
  },
];

// Mock Grocery Items
export const mockGroceryItems: GroceryItem[] = [
  { id: 1, name: "Milk", quantity: "1 gallon", price: 4.99, checked: false, category: "Dairy" },
  { id: 2, name: "Bread", quantity: "1 loaf", price: 3.49, checked: false, category: "Bakery" },
  { id: 3, name: "Eggs", quantity: "1 dozen", price: 5.99, checked: true, category: "Dairy" },
  { id: 4, name: "Chicken", quantity: "2 lbs", price: 8.99, checked: false, category: "Meat" },
  { id: 5, name: "Tomatoes", quantity: "6 units", price: 4.49, checked: false, category: "Produce" },
  { id: 6, name: "Bananas", quantity: "1 bunch", price: 2.99, checked: false, category: "Produce" },
  { id: 7, name: "Orange Juice", quantity: "64 oz", price: 4.29, checked: false, category: "Beverages" },
];

// Helper to get current week's days
export function getCurrentWeekDays(): DayOfWeek[] {
  const today = new Date();
  const days: DayOfWeek[] = [];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Get Monday of current week
  const dayOfWeek = today.getDay();
  const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust when day is Sunday
  const monday = new Date(today.setDate(diff));

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    days.push({
      day: dayNames[date.getDay()],
      date: `${monthNames[date.getMonth()]} ${date.getDate()}`,
    });
  }

  return days;
}

// Mock Meal Schedules
export function getMockMealSchedules(): MealSchedule[] {
  const days = getCurrentWeekDays();
  return days.map((dayInfo, index) => {
    const meals: Meal[] = [];
    
    // Add some meals for certain days
    if (index === 0) {
      meals.push({ id: 1, name: "Creamy Chicken Pasta", recipeId: 1, time: "6:00 PM" });
    } else if (index === 2) {
      meals.push({ id: 2, name: "Greek Salad Bowl", recipeId: 2, time: "7:00 PM" });
    } else if (index === 4) {
      meals.push({ id: 3, name: "Beef and Rice Bowl", recipeId: 4, time: "6:30 PM" });
    }

    return {
      day: dayInfo.day,
      date: dayInfo.date,
      meals,
    };
  });
}

// Mock monthly average for grocery spending
export const MOCK_MONTHLY_AVERAGE = 342.0;

// Service functions
export const mockDataService = {
  getPantryItems: (): PantryItem[] => mockPantryItems,
  getRecipes: (): Recipe[] => mockRecipes,
  getGroceryItems: (): GroceryItem[] => mockGroceryItems,
  getMealSchedules: (): MealSchedule[] => getMockMealSchedules(),
  getMonthlyAverage: (): number => MOCK_MONTHLY_AVERAGE,
};

