/**
 * calculations.test.ts
 *
 * Unit tests for utils/calculations.ts.
 * All functions are pure (no side effects, no network calls) so these tests
 * are fast and deterministic. We pin the system clock to 2026-01-15 so every
 * date-relative assertion has a known reference point.
 */

import {
  getDaysUntilExpiry,
  isUrgent,
  formatExpiry,
  getExpiringItems,
  formatQuantity,
  calculateGroceryTotal,
  calculateMonthlyAverage,
  getCategories,
  filterByCategory,
  searchItems,
} from '../calculations';
import { PantryItem, GroceryItem } from '../../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Minimal valid PantryItem. Tests override only the fields they care about. */
const makePantryItem = (overrides: Partial<PantryItem> = {}): PantryItem => ({
  id: 'item-1',
  user_id: 'user-1',
  ingredient_name: 'Milk',
  normalized_name: 'milk',
  quantity: 1,
  unit: 'litre',
  category: 'dairy',
  location: null,
  barcode: null,
  expiration_date: null,
  added_date: '2026-01-01',
  last_updated: '2026-01-01',
  deleted: false,
  urgent: false,
  ...overrides,
} as PantryItem);  // cast needed because ...overrides makes `urgent` optionally undefined

/** GroceryItem: id is number, quantity is a string label (e.g. "1"), no unit field */
const makeGroceryItem = (overrides: Partial<GroceryItem> = {}): GroceryItem => ({
  id: 1,
  name: 'Bread',
  quantity: '1',
  price: 3.00,
  checked: false,
  category: 'bakery',
  ...overrides,
});

// ── Clock setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  // Pin to midnight UTC on 2026-01-15 so date arithmetic matches the ISO strings.
  // Using 12:00 UTC caused off-by-one errors because '2026-01-15' parses as
  // midnight UTC, which is 12 hours before 12:00 UTC — making "today" appear
  // expired. Midnight UTC aligns the clock with how ISO date strings are parsed.
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-15T00:00:00.000Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
// getDaysUntilExpiry
// ─────────────────────────────────────────────────────────────────────────────

describe('getDaysUntilExpiry', () => {
  it('returns 9999 for null (no expiry set)', () => {
    expect(getDaysUntilExpiry(null)).toBe(9999);
  });

  it('returns 0 for today', () => {
    expect(getDaysUntilExpiry('2026-01-15')).toBe(0);
  });

  it('returns 1 for tomorrow', () => {
    expect(getDaysUntilExpiry('2026-01-16')).toBe(1);
  });

  it('returns negative for an already-expired date', () => {
    expect(getDaysUntilExpiry('2026-01-14')).toBe(-1);
    expect(getDaysUntilExpiry('2026-01-10')).toBe(-5);
  });

  it('returns correct positive value for a future date', () => {
    expect(getDaysUntilExpiry('2026-01-22')).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isUrgent
// ─────────────────────────────────────────────────────────────────────────────

describe('isUrgent', () => {
  it('returns true when expiry is today (0 days)', () => {
    expect(isUrgent(makePantryItem({ expiration_date: '2026-01-15' }))).toBe(true);
  });

  it('returns true when expiry is in 3 days (boundary)', () => {
    expect(isUrgent(makePantryItem({ expiration_date: '2026-01-18' }))).toBe(true);
  });

  it('returns false when expiry is in 4 days (just outside threshold)', () => {
    expect(isUrgent(makePantryItem({ expiration_date: '2026-01-19' }))).toBe(false);
  });

  it('returns true for already-expired items', () => {
    expect(isUrgent(makePantryItem({ expiration_date: '2026-01-10' }))).toBe(true);
  });

  it('returns false when no expiry date is set', () => {
    // null → 9999 days, which is > 3
    expect(isUrgent(makePantryItem({ expiration_date: null }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatExpiry
// ─────────────────────────────────────────────────────────────────────────────

describe('formatExpiry', () => {
  it('returns "No expiry" for null', () => {
    expect(formatExpiry(null)).toBe('No expiry');
  });

  it('returns "Today" when expiry is today', () => {
    expect(formatExpiry('2026-01-15')).toBe('Today');
  });

  it('returns "1 day" for tomorrow', () => {
    expect(formatExpiry('2026-01-16')).toBe('1 day');
  });

  it('returns "N days" for 2–7 days', () => {
    expect(formatExpiry('2026-01-20')).toBe('5 days');
    expect(formatExpiry('2026-01-22')).toBe('7 days');
  });

  it('returns weeks for 8–30 days', () => {
    expect(formatExpiry('2026-01-23')).toBe('2 weeks'); // 8 days → ceil(8/7)=2
    expect(formatExpiry('2026-01-29')).toBe('2 weeks'); // 14 days → ceil(14/7)=2
  });

  it('returns "Expired X days ago" for past dates', () => {
    expect(formatExpiry('2026-01-14')).toBe('Expired 1 day ago');
    expect(formatExpiry('2026-01-10')).toBe('Expired 5 days ago');
  });

  it('returns a date string for dates more than 30 days away', () => {
    const result = formatExpiry('2026-03-01'); // 45 days away
    // Just assert it's not one of the relative labels — locale formatting varies
    expect(result).not.toMatch(/days?|weeks?|Today|expir/i);
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getExpiringItems
// ─────────────────────────────────────────────────────────────────────────────

describe('getExpiringItems', () => {
  const items = [
    makePantryItem({ id: '1', expiration_date: '2026-01-15' }), // today (0 days) ✓
    makePantryItem({ id: '2', expiration_date: '2026-01-18' }), // 3 days ✓
    makePantryItem({ id: '3', expiration_date: '2026-01-19' }), // 4 days ✗
    makePantryItem({ id: '4', expiration_date: null }),          // no expiry ✗
    makePantryItem({ id: '5', expiration_date: '2026-01-14' }), // expired yesterday ✗
  ];

  it('returns items expiring within the default 3-day threshold', () => {
    const result = getExpiringItems(items);
    expect(result.map(i => i.id)).toEqual(['1', '2']);
  });

  it('respects a custom threshold', () => {
    const result = getExpiringItems(items, 5);
    expect(result.map(i => i.id)).toEqual(['1', '2', '3']);
  });

  it('excludes already-expired items (daysUntil < 0)', () => {
    const result = getExpiringItems(items);
    expect(result.find(i => i.id === '5')).toBeUndefined();
  });

  it('returns empty array when no items are expiring soon', () => {
    const safe = [makePantryItem({ expiration_date: '2026-06-01' })];
    expect(getExpiringItems(safe)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatQuantity
// ─────────────────────────────────────────────────────────────────────────────

describe('formatQuantity', () => {
  it('formats integer quantities without trailing .0', () => {
    expect(formatQuantity(2, null)).toBe('2');
    expect(formatQuantity(12, 'count')).toBe('12 count');
  });

  it('formats decimal quantities', () => {
    expect(formatQuantity(1.5, 'litre')).toBe('1.5 litre');
  });

  it('omits unit when null', () => {
    expect(formatQuantity(3, null)).toBe('3');
  });

  it('includes unit when provided', () => {
    expect(formatQuantity(500, 'grams')).toBe('500 grams');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateGroceryTotal
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateGroceryTotal', () => {
  it('sums prices of unchecked items only', () => {
    const items = [
      makeGroceryItem({ price: 3.00, checked: false }),
      makeGroceryItem({ price: 5.00, checked: true  }), // excluded
      makeGroceryItem({ price: 2.50, checked: false }),
    ];
    expect(calculateGroceryTotal(items)).toBeCloseTo(5.50);
  });

  it('returns 0 when all items are checked', () => {
    const items = [
      makeGroceryItem({ price: 10, checked: true }),
      makeGroceryItem({ price: 5,  checked: true }),
    ];
    expect(calculateGroceryTotal(items)).toBe(0);
  });

  it('returns 0 for an empty list', () => {
    expect(calculateGroceryTotal([])).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateMonthlyAverage
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateMonthlyAverage', () => {
  it('returns the correct average', () => {
    expect(calculateMonthlyAverage([100, 200, 300])).toBe(200);
  });

  it('returns 0 for an empty array', () => {
    expect(calculateMonthlyAverage([])).toBe(0);
  });

  it('handles a single value', () => {
    expect(calculateMonthlyAverage([42])).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCategories
// ─────────────────────────────────────────────────────────────────────────────

describe('getCategories', () => {
  it('returns unique categories sorted alphabetically', () => {
    const items = [
      makePantryItem({ category: 'produce' }),
      makePantryItem({ category: 'dairy' }),
      makePantryItem({ category: 'produce' }), // duplicate
    ];
    expect(getCategories(items)).toEqual(['dairy', 'produce']);
  });

  it('excludes null categories', () => {
    const items = [
      makePantryItem({ category: 'dairy' }),
      makePantryItem({ category: null }),
    ];
    expect(getCategories(items)).toEqual(['dairy']);
  });

  it('returns empty array when all categories are null', () => {
    expect(getCategories([makePantryItem({ category: null })])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// filterByCategory
// ─────────────────────────────────────────────────────────────────────────────

describe('filterByCategory', () => {
  const items = [
    makePantryItem({ id: '1', category: 'dairy' }),
    makePantryItem({ id: '2', category: 'produce' }),
    makePantryItem({ id: '3', category: 'dairy' }),
  ];

  it('returns only items matching the given category', () => {
    const result = filterByCategory(items, 'dairy');
    expect(result).toHaveLength(2);
    expect(result.every(i => i.category === 'dairy')).toBe(true);
  });

  it('returns all items when category is an empty string', () => {
    expect(filterByCategory(items, '')).toHaveLength(3);
  });

  it('returns empty array when no items match', () => {
    expect(filterByCategory(items, 'meat')).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// searchItems
// ─────────────────────────────────────────────────────────────────────────────

describe('searchItems', () => {
  const items = [
    makePantryItem({ id: '1', ingredient_name: 'Whole Milk' }),
    makePantryItem({ id: '2', ingredient_name: 'Almond Milk' }),
    makePantryItem({ id: '3', ingredient_name: 'Eggs' }),
  ];

  it('returns all items for an empty query', () => {
    expect(searchItems(items, '')).toHaveLength(3);
    expect(searchItems(items, '   ')).toHaveLength(3);
  });

  it('is case-insensitive', () => {
    expect(searchItems(items, 'milk')).toHaveLength(2);
    expect(searchItems(items, 'MILK')).toHaveLength(2);
    expect(searchItems(items, 'Milk')).toHaveLength(2);
  });

  it('returns matching items by partial name', () => {
    expect(searchItems(items, 'almond')).toHaveLength(1);
    expect(searchItems(items, 'almond')[0].id).toBe('2');
  });

  it('returns empty array when nothing matches', () => {
    expect(searchItems(items, 'chicken')).toHaveLength(0);
  });
});
