/**
 * calculations.ts
 *
 * PURPOSE:
 *   Pure utility functions for computing derived data from pantry items and
 *   grocery lists. "Pure" means these functions take inputs and return outputs
 *   without touching any external state, API, or database — easy to test.
 *
 * WHY KEEP THESE SEPARATE FROM PantryContext?
 *   PantryContext manages state and API calls. Keeping calculation logic here
 *   means it can be reused across different contexts or screens without pulling
 *   in React state management.
 */

import { PantryItem, GroceryItem } from '../types';

/**
 * getDaysUntilExpiry
 *
 * Converts a nullable ISO date string into a number of days from today.
 *
 * @param expirationDate - ISO date string "YYYY-MM-DD", or null if no expiry set
 * @returns Number of days until expiry. Negative = already expired.
 *          Returns 9999 when expirationDate is null (treat as "never expires").
 *
 * WHY 9999 for null?
 *   Returning a huge number means null-expiry items are never flagged as urgent
 *   and never appear in "expiring soon" lists, which is the correct behavior
 *   for items that don't have an expiry date.
 *
 * Examples:
 *   "2024-12-31" (tomorrow) → 1
 *   "2024-12-29" (yesterday) → -1
 *   null → 9999
 */
export function getDaysUntilExpiry(expirationDate: string | null): number {
  // No expiry date set — treat as never expiring
  if (!expirationDate) return 9999;

  const expiryDate = new Date(expirationDate);
  const today = new Date();

  // Zero out the time portion so we compare calendar days, not exact timestamps
  today.setHours(0, 0, 0, 0);
  expiryDate.setHours(0, 0, 0, 0);

  const diffTime = expiryDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * isUrgent
 *
 * Returns true if an item is expiring within 3 days (or already expired).
 * Used to show red highlighting on pantry item cards.
 *
 * @param item - A PantryItem from the backend
 * @returns true if expiration_date is within 3 days from today
 */
export function isUrgent(item: PantryItem): boolean {
  const daysUntil = getDaysUntilExpiry(item.expiration_date);
  return daysUntil <= 3;
}

/**
 * formatExpiry
 *
 * Converts an ISO expiration_date into a human-readable string for display.
 * Returns a relative label when the date is close, or the date itself when far.
 *
 * @param expirationDate - ISO date string or null
 * @returns A display string like "Today", "1 day", "3 days", "Dec 31", or "No expiry"
 *
 * WHY this helper?
 *   The backend stores raw ISO dates. The UI needs friendly labels. Centralizing
 *   this formatting means all screens show the same wording.
 */
export function formatExpiry(expirationDate: string | null): string {
  if (!expirationDate) return 'No expiry';

  const days = getDaysUntilExpiry(expirationDate);

  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  if (days <= 7) return `${days} days`;
  if (days <= 30) return `${Math.ceil(days / 7)} week${Math.ceil(days / 7) === 1 ? '' : 's'}`;

  // For dates further away, show the actual date (e.g. "Jun 15")
  return new Date(expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * getExpiringItems
 *
 * Filters a list of pantry items to those expiring within a given number of days.
 * Items with no expiration_date are never included.
 *
 * @param items         - Full list of pantry items
 * @param thresholdDays - How many days ahead to look (default: 3)
 * @returns Items where 0 <= daysUntilExpiry <= thresholdDays
 */
export function getExpiringItems(items: PantryItem[], thresholdDays: number = 3): PantryItem[] {
  return items.filter(item => {
    const daysUntil = getDaysUntilExpiry(item.expiration_date);
    // Only include items that are expiring soon but haven't already expired (daysUntil >= 0)
    return daysUntil <= thresholdDays && daysUntil >= 0;
  });
}

/**
 * formatQuantity
 *
 * Combines the numeric quantity and optional unit into a display string.
 *
 * @param quantity - Numeric quantity from the backend, e.g. 1.5
 * @param unit     - Unit string or null, e.g. "gallon", "g", null
 * @returns Display string like "1.5 gallon", "500 g", or "2"
 *
 * WHY this helper?
 *   The backend separates quantity (number) and unit (string). Every screen
 *   that needs to display them together can call this instead of repeating
 *   the template string logic.
 */
export function formatQuantity(quantity: number, unit: string | null): string {
  // Remove trailing zeros for display (1.0 → "1", 1.5 → "1.5")
  const qtyStr = Number.isInteger(quantity) ? quantity.toString() : quantity.toFixed(1).replace(/\.0$/, '');
  return unit ? `${qtyStr} ${unit}` : qtyStr;
}

/**
 * calculateGroceryTotal
 *
 * Sums the price of all unchecked grocery items.
 *
 * @param items - List of grocery items
 * @returns Total price of unchecked items
 */
export function calculateGroceryTotal(items: GroceryItem[]): number {
  return items
    .filter(item => !item.checked)
    .reduce((sum, item) => sum + item.price, 0);
}

/**
 * calculateMonthlyAverage
 *
 * Averages a list of historical spend numbers.
 *
 * @param historicalData - Array of monthly spend amounts
 * @returns Average, or 0 if the array is empty
 */
export function calculateMonthlyAverage(historicalData: number[]): number {
  if (historicalData.length === 0) return 0;
  const sum = historicalData.reduce((acc, val) => acc + val, 0);
  return sum / historicalData.length;
}

/**
 * getCategories
 *
 * Extracts the unique non-null categories from a list of pantry items.
 *
 * @param items - List of pantry items
 * @returns Sorted array of unique category strings
 */
export function getCategories(items: PantryItem[]): string[] {
  // Filter out null categories before adding to the Set
  const categories = new Set(items.map(item => item.category).filter(Boolean) as string[]);
  return Array.from(categories).sort();
}

/**
 * filterByCategory
 *
 * Returns only items belonging to the given category.
 * Returns all items if category is an empty string.
 *
 * @param items    - List of pantry items
 * @param category - Category to filter by (e.g. "dairy")
 */
export function filterByCategory(items: PantryItem[], category: string): PantryItem[] {
  if (!category) return items;
  return items.filter(item => item.category === category);
}

/**
 * searchItems
 *
 * Case-insensitive search across ingredient_name.
 *
 * @param items - List of pantry items
 * @param query - Search string
 * @returns Items whose ingredient_name contains the query
 */
export function searchItems(items: PantryItem[], query: string): PantryItem[] {
  if (!query.trim()) return items;
  const lowerQuery = query.toLowerCase();
  return items.filter(item => item.ingredient_name.toLowerCase().includes(lowerQuery));
}
