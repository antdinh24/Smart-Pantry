/**
 * ScanScreen.test.tsx
 *
 * Tests for the Scan screen: mode toggle (Barcode / Receipt tabs),
 * the "Start Camera" button, camera permission flow, and the guest gate
 * that blocks receipt scanning for anonymous users.
 *
 * Camera lifecycle note:
 *   In tests, CameraView is mocked as a plain View (see jest-setup.ts).
 *   takePictureAsync is not on the mock, so we only test guard logic —
 *   not the actual photo capture.
 *
 * Mocking strategy:
 *   - useCameraPermissions — starts denied; mockRequestPermission → granted
 *   - useAuth — controls isGuest flag
 *   - APIService — prevents real network calls
 *
 * RNTL v14 quirks:
 *   - render() is async → must be awaited
 *   - fireEvent.press is async → must be awaited
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import ScanScreen from '../ScanScreen'
import { useAuth } from '../../contexts/AuthContext'
import { useCameraPermissions } from 'expo-camera'

// ── Mock navigation ───────────────────────────────────────────────────────────

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}))

// ── Mock auth ─────────────────────────────────────────────────────────────────

jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }))

// ── Mock API service ──────────────────────────────────────────────────────────

jest.mock('../../services/api', () => ({
  APIService: {
    lookupBarcode: jest.fn(),
    scanReceipt: jest.fn(),
  },
}))

// ─────────────────────────────────────────────────────────────────────────────

const mockSignOut = jest.fn()
// Shared request-permission mock so tests can assert it was called
const mockRequestPermission = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()

  // Default: permission not yet granted; requestPermission succeeds
  mockRequestPermission.mockResolvedValue({ granted: true });
  (useCameraPermissions as jest.Mock).mockReturnValue([
    { granted: false, status: 'undetermined' },
    mockRequestPermission,
  ]);

  (useAuth as jest.Mock).mockReturnValue({ isGuest: false, signOut: mockSignOut })
})

// ─────────────────────────────────────────────────────────────────────────────
// Initial render — idle state
// ─────────────────────────────────────────────────────────────────────────────

describe('ScanScreen initial render', () => {
  it('renders the screen title', async () => {
    const { getByText } = await render(<ScanScreen />)
    expect(getByText('Scan Item')).toBeTruthy()
  })

  it('shows both mode tabs', async () => {
    const { getByText } = await render(<ScanScreen />)
    expect(getByText('Barcode')).toBeTruthy()
    expect(getByText('Receipt')).toBeTruthy()
  })

  it('shows the "Start Camera" button', async () => {
    const { getByText } = await render(<ScanScreen />)
    expect(getByText('Start Camera')).toBeTruthy()
  })

  it('defaults to barcode mode instructions', async () => {
    const { getByText } = await render(<ScanScreen />)
    expect(getByText('Position barcode in frame')).toBeTruthy()
    expect(getByText('Scanning Tips')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Mode toggle
// ─────────────────────────────────────────────────────────────────────────────

describe('ScanScreen mode toggle', () => {
  it('switches to receipt mode instructions when Receipt tab is tapped', async () => {
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Receipt'))
    expect(getByText('Position receipt in frame')).toBeTruthy()
  })

  it('shows Receipt Tips in receipt mode', async () => {
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Receipt'))
    expect(getByText('Receipt Tips')).toBeTruthy()
  })

  it('shows "8 free scans per month" usage note in receipt mode', async () => {
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Receipt'))
    expect(getByText('8 free scans per month')).toBeTruthy()
  })

  it('does not show the usage note in barcode mode', async () => {
    const { queryByText } = await render(<ScanScreen />)
    expect(queryByText('8 free scans per month')).toBeNull()
  })

  it('switches back to barcode mode when Barcode tab is tapped', async () => {
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Receipt'))
    await fireEvent.press(getByText('Barcode'))
    expect(getByText('Scanning Tips')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Camera permission flow
// ─────────────────────────────────────────────────────────────────────────────

describe('ScanScreen camera permission', () => {
  it('calls requestPermission when Start Camera is tapped and permission is not granted', async () => {
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() => expect(mockRequestPermission).toHaveBeenCalledTimes(1))
  })

  it('shows the camera view after permission is granted', async () => {
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() => expect(getByText('Scan Barcode')).toBeTruthy())
  })

  it('shows a permission-required alert when the user denies camera access', async () => {
    mockRequestPermission.mockResolvedValue({ granted: false })
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Camera Permission Required',
        expect.any(String),
        expect.any(Array)
      )
    )
  })

  it('stays on the idle screen when permission is denied', async () => {
    mockRequestPermission.mockResolvedValue({ granted: false })
    const { getByText, queryByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled())
    expect(queryByText('Scan Barcode')).toBeNull()
  })

  it('activates without requesting permission when already granted', async () => {
    // Simulate camera already granted
    ;(useCameraPermissions as jest.Mock).mockReturnValue([
      { granted: true, status: 'granted' },
      mockRequestPermission,
    ])
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() => expect(getByText('Scan Barcode')).toBeTruthy())
    expect(mockRequestPermission).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Camera active state
// ─────────────────────────────────────────────────────────────────────────────

describe('ScanScreen camera active state', () => {
  it('shows "Scan Barcode" header in barcode mode', async () => {
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() => expect(getByText('Scan Barcode')).toBeTruthy())
  })

  it('shows "Scan Receipt" header when started in receipt mode', async () => {
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Receipt'))
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() => expect(getByText('Scan Receipt')).toBeTruthy())
  })

  it('returns to idle state when the close button is tapped', async () => {
    const { getByText, getByTestId } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() => expect(getByText('Scan Barcode')).toBeTruthy())

    // The X close button's icon mock renders with testID="icon-x"
    await fireEvent.press(getByTestId('icon-x'))
    await waitFor(() => expect(getByText('Start Camera')).toBeTruthy())
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Guest gate — receipt mode shutter
// ─────────────────────────────────────────────────────────────────────────────

describe('ScanScreen guest gate for receipt scanning', () => {
  it('shows "Account Required" alert when a guest taps the shutter in receipt mode', async () => {
    (useAuth as jest.Mock).mockReturnValue({ isGuest: true, signOut: mockSignOut })

    const { getByText, getByTestId } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Receipt'))
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() => expect(getByText('Scan Receipt')).toBeTruthy())

    // The shutter button contains a camera icon; the icon mock renders with testID="icon-camera"
    // fireEvent.press bubbles up from the Text to the TouchableOpacity
    await fireEvent.press(getByTestId('icon-camera'))

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Account Required',
        expect.stringContaining('free account'),
        expect.any(Array)
      )
    )
  })

  it('does not call scanReceipt when the guest gate blocks the shutter', async () => {
    const { APIService } = require('../../services/api')
    ;(useAuth as jest.Mock).mockReturnValue({ isGuest: true, signOut: mockSignOut })

    const { getByText, getByTestId } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Receipt'))
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() => expect(getByText('Scan Receipt')).toBeTruthy())

    await fireEvent.press(getByTestId('icon-camera'))
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled())

    expect(APIService.scanReceipt).not.toHaveBeenCalled()
  })
})
