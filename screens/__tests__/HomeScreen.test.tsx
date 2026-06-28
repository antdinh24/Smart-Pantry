/**
 * HomeScreen.test.tsx
 *
 * Tests for the Home screen:
 *   - Renders the Quick Actions grid and CTA card
 *   - Expiry alert shown/hidden based on stats.expiringSoonCount
 *   - Every navigation button routes to the correct screen
 *   - Bottom navigation bar routes correctly
 */

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import HomeScreen from '../HomeScreen'
import { usePantry } from '../../hooks/usePantry'

// ── Mock navigation ────────────────────────────────────────────────────────────

const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}))

// ── Mock usePantry ─────────────────────────────────────────────────────────────

jest.mock('../../hooks/usePantry', () => ({ usePantry: jest.fn() }))

const DEFAULT_STATS = {
  totalItems: 0,
  categoriesCount: 0,
  expiringSoonCount: 0,
  expiringItems: [],
}

beforeEach(() => {
  jest.clearAllMocks();
  (usePantry as jest.Mock).mockReturnValue({ stats: DEFAULT_STATS })
})

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('HomeScreen rendering', () => {
  it('renders without crashing', async () => {
    const { getByText } = await render(<HomeScreen />)
    expect(getByText('Smart Pantry')).toBeTruthy()
  })

  it('shows Quick Actions section with all four action cards', async () => {
    const { getByText, getAllByText } = await render(<HomeScreen />)
    expect(getByText('Quick Actions')).toBeTruthy()
    expect(getByText('My Pantry')).toBeTruthy()
    // "Schedule" and "Recipes" also appear in the bottom nav, so use getAllByText
    expect(getAllByText('Schedule').length).toBeGreaterThanOrEqual(1)
    expect(getAllByText('Recipes').length).toBeGreaterThanOrEqual(1)
    expect(getByText('Grocery List')).toBeTruthy()
  })

  it('shows the Scan Your Receipt CTA', async () => {
    const { getByText } = await render(<HomeScreen />)
    expect(getByText('Scan Your Receipt')).toBeTruthy()
    expect(getByText('Scan')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Expiry alert
// ─────────────────────────────────────────────────────────────────────────────

describe('HomeScreen expiry alert', () => {
  it('hides the expiry alert when expiringSoonCount is 0', async () => {
    const { queryByText } = await render(<HomeScreen />)
    expect(queryByText(/expiring soon/i)).toBeNull()
  })

  it('shows the expiry alert when expiringSoonCount > 0', async () => {
    (usePantry as jest.Mock).mockReturnValue({
      stats: {
        ...DEFAULT_STATS,
        expiringSoonCount: 2,
        expiringItems: [
          { ingredient_name: 'Milk' },
          { ingredient_name: 'Eggs' },
        ],
      },
    })
    const { getByText } = await render(<HomeScreen />)
    expect(getByText('2 items expiring soon')).toBeTruthy()
  })

  it('shows singular "item" when expiringSoonCount is 1', async () => {
    (usePantry as jest.Mock).mockReturnValue({
      stats: {
        ...DEFAULT_STATS,
        expiringSoonCount: 1,
        expiringItems: [{ ingredient_name: 'Milk' }],
      },
    })
    const { getByText } = await render(<HomeScreen />)
    expect(getByText('1 item expiring soon')).toBeTruthy()
  })

  it('shows expiring item names in the alert subtitle', async () => {
    (usePantry as jest.Mock).mockReturnValue({
      stats: {
        ...DEFAULT_STATS,
        expiringSoonCount: 1,
        expiringItems: [{ ingredient_name: 'Milk' }],
      },
    })
    const { getByText } = await render(<HomeScreen />)
    expect(getByText('Milk')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Navigation — Quick Actions
// ─────────────────────────────────────────────────────────────────────────────

describe('HomeScreen navigation — quick actions', () => {
  it('My Pantry card navigates to Pantry', async () => {
    const { getByText } = await render(<HomeScreen />)
    await fireEvent.press(getByText('My Pantry'))
    expect(mockNavigate).toHaveBeenCalledWith('Pantry')
  })

  it('Schedule card navigates to Schedule', async () => {
    const { getByText } = await render(<HomeScreen />)
    // The "Schedule" text appears in both action card and bottom nav — take first
    await fireEvent.press(getByText('Plan meals'))
    expect(mockNavigate).toHaveBeenCalledWith('Schedule')
  })

  it('Recipes card navigates to Recipes', async () => {
    const { getByText } = await render(<HomeScreen />)
    await fireEvent.press(getByText('Generate ideas'))
    expect(mockNavigate).toHaveBeenCalledWith('Recipes')
  })

  it('Grocery List card navigates to Grocery', async () => {
    const { getByText } = await render(<HomeScreen />)
    await fireEvent.press(getByText('Plan shopping'))
    expect(mockNavigate).toHaveBeenCalledWith('Grocery')
  })

  it('Scan button navigates to Scan', async () => {
    const { getByText } = await render(<HomeScreen />)
    await fireEvent.press(getByText('Scan'))
    expect(mockNavigate).toHaveBeenCalledWith('Scan')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Navigation — bottom nav bar
// ─────────────────────────────────────────────────────────────────────────────

describe('HomeScreen navigation — bottom nav', () => {
  it('bottom nav Schedule tab navigates to Schedule', async () => {
    const { getAllByText } = await render(<HomeScreen />)
    // The bottom nav has a "Schedule" text item — it's the second occurrence
    const scheduleItems = getAllByText('Schedule')
    await fireEvent.press(scheduleItems[scheduleItems.length - 1])
    expect(mockNavigate).toHaveBeenCalledWith('Schedule')
  })

  it('bottom nav Recipes tab navigates to Recipes', async () => {
    const { getAllByText } = await render(<HomeScreen />)
    const recipesItems = getAllByText('Recipes')
    await fireEvent.press(recipesItems[recipesItems.length - 1])
    expect(mockNavigate).toHaveBeenCalledWith('Recipes')
  })

  it('bottom nav List tab navigates to Grocery', async () => {
    const { getByText } = await render(<HomeScreen />)
    await fireEvent.press(getByText('List'))
    expect(mockNavigate).toHaveBeenCalledWith('Grocery')
  })
})
