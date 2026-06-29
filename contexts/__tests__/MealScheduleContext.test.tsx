/**
 * contexts/__tests__/MealScheduleContext.test.tsx
 *
 * Tests for MealScheduleProvider and the useMealSchedule() hook.
 *
 * STRATEGY:
 *   MealScheduleContext has no async API calls — it initialises from
 *   getMockMealSchedules() (a function from services/mockDataService).
 *   We mock that module so getMockMealSchedules returns a controlled
 *   three-day fixture, giving deterministic results on every test run
 *   regardless of the real date.
 *
 *   The schedule data is defined INSIDE the mock factory to avoid babel-jest
 *   hoisting issues (module-level variables are undefined when the factory runs).
 *   The mock function uses a lazy implementation `jest.fn(() => ...)` so the
 *   data is evaluated at call time, not factory registration time.
 *
 *   IMPORTANT: All state mutations MUST use `await act(async () => { ... })`.
 *   In React 19 / RNTL v14, act() always returns a Promise. Calling it without
 *   await means state updates are not committed before assertions run, causing
 *   stale results and null result.current errors in subsequent tests.
 *
 * WHAT IS TESTED:
 *   - Initial schedules come from getMockMealSchedules()
 *   - getMealsForDay returns the correct meal list for a day with meals
 *   - getMealsForDay returns [] for a day with no meals
 *   - getMealsForDay returns [] for an unknown day (not in the schedule)
 *   - addMeal appends the new meal to the correct day with ID = max+1
 *   - addMeal assigns ID=1 when the target day has no existing meals
 *   - addMeal does not affect other days
 *   - removeMeal removes the correct meal from the correct day
 *   - removeMeal does not affect other days
 *   - updateMeal patches only the specified fields on the correct meal
 *   - updateMeal does not affect other days
 *   - useMealSchedule() outside the provider throws a descriptive error
 */

import React, { ReactNode } from 'react'
import { renderHook, act } from '@testing-library/react-native'
import { MealScheduleProvider, useMealSchedule } from '../MealScheduleContext'

// ── Mock mockDataService ──────────────────────────────────────────────────────
//
// MealScheduleContext calls getMockMealSchedules() inside useState() to
// seed the initial schedule. We define the fixture INSIDE the factory so
// it is in scope when the factory runs (babel-jest hoists jest.mock() before
// module-level const declarations). The jest.fn() implementation is evaluated
// lazily (at call time), so TEST_SCHEDULES would be fine either way, but
// keeping everything in the factory removes any ambiguity.
//
// The factory returns a deep clone on every call so mutations in one test
// cannot bleed into another test's initial state.

jest.mock('../../services/mockDataService', () => {
  // Three-day fixture: Monday has 2 meals, Tuesday is empty, Wednesday has 1
  const makeSchedules = () => [
    {
      day: 'Monday',
      date: 'Jun 23',
      meals: [
        { id: 1, name: 'Chicken Pasta', recipeId: 1, time: '6:00 PM' },
        { id: 2, name: 'Greek Salad',   recipeId: 2, time: '1:00 PM' },
      ],
    },
    {
      day: 'Tuesday',
      date: 'Jun 24',
      meals: [],  // intentionally empty
    },
    {
      day: 'Wednesday',
      date: 'Jun 25',
      meals: [
        { id: 3, name: 'Beef Bowl', recipeId: 4, time: '7:00 PM' },
      ],
    },
  ]

  return {
    // Return a fresh deep clone each call so tests don't share mutable state
    getMockMealSchedules: jest.fn(() =>
      makeSchedules().map(s => ({ ...s, meals: s.meals.map(m => ({ ...m })) }))
    ),
    // Other exports used by unrelated modules
    mockGroceryItems: [],
    MOCK_MONTHLY_AVERAGE: 0,
  }
})

// ── Provider wrapper ──────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: ReactNode }) => (
  <MealScheduleProvider>{children}</MealScheduleProvider>
)

// ── Shared setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

// =============================================================================
// Initial state
// =============================================================================

describe('MealScheduleContext — initial state', () => {
  it('initialises schedules from getMockMealSchedules()', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })

    expect(result.current.schedules).toHaveLength(3)
    expect(result.current.schedules[0].day).toBe('Monday')
    expect(result.current.schedules[1].day).toBe('Tuesday')
    expect(result.current.schedules[2].day).toBe('Wednesday')
  })
})

// =============================================================================
// getMealsForDay
// =============================================================================

describe('MealScheduleContext — getMealsForDay', () => {
  it('returns the correct meals for a day that has meals', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })

    const meals = result.current.getMealsForDay('Monday')
    expect(meals).toHaveLength(2)
    expect(meals[0].name).toBe('Chicken Pasta')
    expect(meals[1].name).toBe('Greek Salad')
  })

  it('returns an empty array for a day with no meals', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })

    expect(result.current.getMealsForDay('Tuesday')).toEqual([])
  })

  it('returns an empty array for a day not present in the schedule', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })

    expect(result.current.getMealsForDay('Sunday')).toEqual([])
  })
})

// =============================================================================
// addMeal
// =============================================================================

describe('MealScheduleContext — addMeal', () => {
  it('appends the new meal to the correct day', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })

    await act(async () => {
      result.current.addMeal('Wednesday', { name: 'Omelette', recipeId: 5, time: '8:00 AM' })
    })

    const wednesdayMeals = result.current.getMealsForDay('Wednesday')
    expect(wednesdayMeals).toHaveLength(2)
    expect(wednesdayMeals[1].name).toBe('Omelette')
  })

  it('assigns ID = max(existing meal IDs in that day) + 1', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })
    // Monday meals have IDs [1, 2] → next ID is 3

    await act(async () => {
      result.current.addMeal('Monday', { name: 'Pancakes', time: '9:00 AM' })
    })

    const mondayMeals = result.current.getMealsForDay('Monday')
    const newMeal = mondayMeals[mondayMeals.length - 1]
    expect(newMeal.id).toBe(3)
  })

  it('assigns ID = 1 when the target day has no existing meals', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })
    // Tuesday starts empty → Math.max(...[], 0) + 1 = 1

    await act(async () => {
      result.current.addMeal('Tuesday', { name: 'Toast', time: '8:00 AM' })
    })

    const tuesdayMeals = result.current.getMealsForDay('Tuesday')
    expect(tuesdayMeals).toHaveLength(1)
    expect(tuesdayMeals[0].id).toBe(1)
    expect(tuesdayMeals[0].name).toBe('Toast')
  })

  it('does not modify meals for other days', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })
    const mondayCountBefore = result.current.getMealsForDay('Monday').length

    await act(async () => {
      result.current.addMeal('Wednesday', { name: 'Soup', time: '12:00 PM' })
    })

    expect(result.current.getMealsForDay('Monday')).toHaveLength(mondayCountBefore)
  })

  it('is a no-op for an unknown day', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })
    const countBefore = result.current.schedules.reduce((n, s) => n + s.meals.length, 0)

    await act(async () => {
      result.current.addMeal('Sunday', { name: 'Brunch', time: '11:00 AM' })
    })

    const countAfter = result.current.schedules.reduce((n, s) => n + s.meals.length, 0)
    expect(countAfter).toBe(countBefore)
  })
})

// =============================================================================
// removeMeal
// =============================================================================

describe('MealScheduleContext — removeMeal', () => {
  it('removes the meal with the given ID from the correct day', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })

    await act(async () => { result.current.removeMeal('Monday', 1) })  // remove Chicken Pasta

    const mondayMeals = result.current.getMealsForDay('Monday')
    expect(mondayMeals).toHaveLength(1)
    expect(mondayMeals.find(m => m.id === 1)).toBeUndefined()
    expect(mondayMeals[0].name).toBe('Greek Salad')
  })

  it('does not affect meals on other days', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })

    await act(async () => { result.current.removeMeal('Wednesday', 3) })

    // Monday should still have 2 meals
    expect(result.current.getMealsForDay('Monday')).toHaveLength(2)
  })

  it('is a no-op when the meal ID does not exist on that day', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })

    await act(async () => { result.current.removeMeal('Monday', 999) })

    expect(result.current.getMealsForDay('Monday')).toHaveLength(2)
  })
})

// =============================================================================
// updateMeal
// =============================================================================

describe('MealScheduleContext — updateMeal', () => {
  it('patches only the specified fields on the correct meal', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })

    await act(async () => { result.current.updateMeal('Monday', 1, { time: '7:30 PM' }) })

    const updated = result.current.getMealsForDay('Monday').find(m => m.id === 1)!
    expect(updated.time).toBe('7:30 PM')
    expect(updated.name).toBe('Chicken Pasta')  // unchanged
    expect(updated.recipeId).toBe(1)             // unchanged
  })

  it('can update the meal name', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })

    await act(async () => { result.current.updateMeal('Wednesday', 3, { name: 'Updated Bowl' }) })

    const updated = result.current.getMealsForDay('Wednesday').find(m => m.id === 3)!
    expect(updated.name).toBe('Updated Bowl')
  })

  it('does not affect meals on other days', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })

    await act(async () => { result.current.updateMeal('Monday', 1, { name: 'Changed' }) })

    // Wednesday meal should be untouched
    const wednesdayMeal = result.current.getMealsForDay('Wednesday')[0]
    expect(wednesdayMeal.name).toBe('Beef Bowl')
  })

  it('does not affect other meals on the same day', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })

    await act(async () => { result.current.updateMeal('Monday', 1, { time: '9:00 PM' }) })

    // Meal id=2 (Greek Salad) on Monday should be unchanged
    const other = result.current.getMealsForDay('Monday').find(m => m.id === 2)!
    expect(other.time).toBe('1:00 PM')
  })

  it('is a no-op when the meal ID does not exist on that day', async () => {
    const { result } = await renderHook(() => useMealSchedule(), { wrapper })
    const before = result.current.getMealsForDay('Monday').map(m => ({ ...m }))

    await act(async () => { result.current.updateMeal('Monday', 999, { name: 'Ghost' }) })

    expect(result.current.getMealsForDay('Monday')).toEqual(before)
  })
})

// =============================================================================
// Provider guard
// =============================================================================

describe('MealScheduleContext — provider guard', () => {
  it('throws a descriptive error when useMealSchedule is called outside MealScheduleProvider', async () => {
    await expect(renderHook(() => useMealSchedule())).rejects.toThrow(
      'useMealSchedule must be used within a MealScheduleProvider'
    )
  })
})
