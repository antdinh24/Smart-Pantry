/**
 * ScheduleScreen.test.tsx
 *
 * Tests for the meal schedule screen:
 *   - Renders without crashing
 *   - Shows a day card for each schedule entry
 *   - Day with no meals shows the "Add Meal" placeholder button
 *   - Day with meals shows the meal names instead
 *   - "Add Ingredients from Pantry" button navigates to AddIngredients
 *   - Bottom nav routes to Home, Recipes, and Grocery
 *   - Back button calls goBack
 *   - Empty schedules list renders without crashing
 */

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import ScheduleScreen from '../ScheduleScreen'
import { useMealSchedule } from '../../contexts/MealScheduleContext'

// ── Mock navigation ────────────────────────────────────────────────────────────

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}))

// ── Mock MealScheduleContext ───────────────────────────────────────────────────

jest.mock('../../contexts/MealScheduleContext', () => ({
  useMealSchedule: jest.fn(),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const EMPTY_SCHEDULE = {
  day: 'Monday',
  date: 'Jun 23',
  meals: [],
}

const SCHEDULE_WITH_MEAL = {
  day: 'Tuesday',
  date: 'Jun 24',
  meals: [{ id: 1, name: 'Pasta Carbonara', time: '7:00 PM' }],
}

beforeEach(() => {
  jest.clearAllMocks();
  (useMealSchedule as jest.Mock).mockReturnValue({ schedules: [EMPTY_SCHEDULE] })
})

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('ScheduleScreen rendering', () => {
  it('renders without crashing', async () => {
    const { getByText } = await render(<ScheduleScreen />)
    expect(getByText('Meal Schedule')).toBeTruthy()
  })

  it('shows the Add Ingredients from Pantry CTA', async () => {
    const { getByText } = await render(<ScheduleScreen />)
    expect(getByText('Add Ingredients from Pantry')).toBeTruthy()
  })

  it('renders a day card for each schedule entry', async () => {
    (useMealSchedule as jest.Mock).mockReturnValue({
      schedules: [EMPTY_SCHEDULE, SCHEDULE_WITH_MEAL],
    })
    const { getByText } = await render(<ScheduleScreen />)
    expect(getByText('Monday')).toBeTruthy()
    expect(getByText('Tuesday')).toBeTruthy()
  })

  it('shows the "Add Meal" button for a day with no meals', async () => {
    const { getByText } = await render(<ScheduleScreen />)
    expect(getByText('Add Meal')).toBeTruthy()
  })

  it('shows meal names for a day that has meals', async () => {
    (useMealSchedule as jest.Mock).mockReturnValue({
      schedules: [SCHEDULE_WITH_MEAL],
    })
    const { getByText } = await render(<ScheduleScreen />)
    expect(getByText('Pasta Carbonara')).toBeTruthy()
  })

  it('shows meal time when provided', async () => {
    (useMealSchedule as jest.Mock).mockReturnValue({
      schedules: [SCHEDULE_WITH_MEAL],
    })
    const { getByText } = await render(<ScheduleScreen />)
    expect(getByText('7:00 PM')).toBeTruthy()
  })

  it('renders without crashing when schedules list is empty', async () => {
    (useMealSchedule as jest.Mock).mockReturnValue({ schedules: [] })
    const { getByText } = await render(<ScheduleScreen />)
    expect(getByText('Meal Schedule')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

describe('ScheduleScreen navigation', () => {
  it('"Add Ingredients from Pantry" navigates to AddIngredients', async () => {
    const { getByText } = await render(<ScheduleScreen />)
    await fireEvent.press(getByText('Add Ingredients from Pantry'))
    expect(mockNavigate).toHaveBeenCalledWith('AddIngredients')
  })

  it('back button calls goBack', async () => {
    const { getByTestId } = await render(<ScheduleScreen />)
    await fireEvent.press(getByTestId('icon-arrow-left'))
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Bottom navigation
// ─────────────────────────────────────────────────────────────────────────────

describe('ScheduleScreen bottom navigation', () => {
  it('Home tab navigates to Home', async () => {
    const { getByText } = await render(<ScheduleScreen />)
    await fireEvent.press(getByText('Home'))
    expect(mockNavigate).toHaveBeenCalledWith('Home')
  })

  it('Recipes tab navigates to Recipes', async () => {
    const { getByText } = await render(<ScheduleScreen />)
    await fireEvent.press(getByText('Recipes'))
    expect(mockNavigate).toHaveBeenCalledWith('Recipes')
  })

  it('List tab navigates to Grocery', async () => {
    const { getByText } = await render(<ScheduleScreen />)
    await fireEvent.press(getByText('List'))
    expect(mockNavigate).toHaveBeenCalledWith('Grocery')
  })
})
