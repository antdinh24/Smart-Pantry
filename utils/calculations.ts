import { PantryItem, GroceryItem } from '../types';

/**
 * Parse expiry string and return number of days until expiry
 * Supports formats like "2 days", "1 week", "3 months", or date strings
 */
export function getDaysUntilExpiry(expiry: string): number {
  // If it's a date string (YYYY-MM-DD)
  const dateMatch = expiry.match(/^\d{4}-\d{2}-\d{2}$/);
  if (dateMatch) {
    const expiryDate = new Date(expiry);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiryDate.setHours(0, 0, 0, 0);
    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  // Parse relative time strings
  const numberMatch = expiry.match(/^(\d+)\s*(day|days|week|weeks|month|months)$/i);
  if (numberMatch) {
    const value = parseInt(numberMatch[1], 10);
    const unit = numberMatch[2].toLowerCase();

    if (unit === 'day' || unit === 'days') {
      return value;
    } else if (unit === 'week' || unit === 'weeks') {
      return value * 7;
    } else if (unit === 'month' || unit === 'months') {
      return value * 30; // Approximate
    }
  }

  // Default to a large number if can't parse
  return 365;
}

/**
 * Check if an item is urgent (expiring within 3 days)
 */
export function isUrgent(item: PantryItem): boolean {
  const daysUntil = getDaysUntilExpiry(item.expiry);
  return daysUntil <= 3;
}

/**
 * Get items expiring soon (within threshold days)
 */
export function getExpiringItems(items: PantryItem[], thresholdDays: number = 3): PantryItem[] {
  return items.filter(item => {
    const daysUntil = getDaysUntilExpiry(item.expiry);
    return daysUntil <= thresholdDays && daysUntil >= 0;
  });
}

/**
 * Calculate total price of unchecked grocery items
 */
export function calculateGroceryTotal(items: GroceryItem[]): number {
  return items
    .filter(item => !item.checked)
    .reduce((sum, item) => sum + item.price, 0);
}

/**
 * Calculate monthly average from historical data
 * For now, returns a default value, but can be extended to use actual data
 */
export function calculateMonthlyAverage(historicalData: number[]): number {
  if (historicalData.length === 0) return 0;
  const sum = historicalData.reduce((acc, val) => acc + val, 0);
  return sum / historicalData.length;
}

/**
 * Get unique categories from pantry items
 */
export function getCategories(items: PantryItem[]): string[] {
  const categories = new Set(items.map(item => item.category));
  return Array.from(categories).sort();
}

/**
 * Filter items by category
 */
export function filterByCategory(items: PantryItem[], category: string): PantryItem[] {
  if (!category) return items;
  return items.filter(item => item.category === category);
}

/**
 * Search items by name (case-insensitive)
 */
export function searchItems(items: PantryItem[], query: string): PantryItem[] {
  if (!query.trim()) return items;
  const lowerQuery = query.toLowerCase();
  return items.filter(item => item.name.toLowerCase().includes(lowerQuery));
}

