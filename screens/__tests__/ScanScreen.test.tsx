/**
 * ScanScreen.test.tsx
 *
 * Tests for the Scan screen: mode toggle (Receipt / Barcode tabs),
 * the "Start Camera" button, gallery picker, camera permission flow,
 * and the guest gate that blocks receipt scanning for anonymous users.
 *
 * Default mode is "receipt" — tests that previously assumed "barcode" as the
 * default have been updated accordingly.
 *
 * Camera lifecycle note:
 *   In tests, CameraView is mocked as a plain View (see jest-setup.ts).
 *   takePictureAsync is not on the mock, so we only test guard logic —
 *   not the actual photo capture.
 *   CameraView.scanFromURLAsync IS mocked (static method on the mock component)
 *   so gallery barcode tests can control its return value.
 *
 * Mocking strategy:
 *   - useCameraPermissions — starts denied; mockRequestPermission → granted
 *   - useAuth — controls isGuest flag
 *   - APIService — prevents real network calls
 *   - expo-image-picker — default: { canceled: true } (from jest-setup.ts)
 *   - CameraView.scanFromURLAsync — default: [] (from jest-setup.ts)
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
import { useCameraPermissions, CameraView } from 'expo-camera'
import { launchImageLibraryAsync } from 'expo-image-picker'
import { APIService } from '../../services/api'

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
const mockRequestPermission = jest.fn()

// Shorthand references to static mocks added in jest-setup.ts.
// Cast via any: TypeScript types for expo-camera v17 don't expose
// scanFromURLAsync on the CameraView class, but the method exists at runtime
// (added in jest-setup.ts as a static property on the mock component).
const mockScanFromURLAsync = (CameraView as any).scanFromURLAsync as jest.Mock
const mockLaunchImageLibrary = launchImageLibraryAsync as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()

  // Default: permission not yet granted; requestPermission succeeds
  mockRequestPermission.mockResolvedValue({ granted: true });
  (useCameraPermissions as jest.Mock).mockReturnValue([
    { granted: false, status: 'undetermined' },
    mockRequestPermission,
  ]);

  (useAuth as jest.Mock).mockReturnValue({ isGuest: false, signOut: mockSignOut })

  // Default gallery picker: user cancels (no side effects)
  mockLaunchImageLibrary.mockResolvedValue({ canceled: true })

  // Default barcode scan from image: no barcode found
  mockScanFromURLAsync.mockResolvedValue([])

  // Default API responses
  ;(APIService.scanReceipt as jest.Mock).mockResolvedValue({
    receipt_id: 'r-1',
    line_items: [],
    merchant_name: 'Test Store',
    total_amount: 10.00,
  });
  (APIService.lookupBarcode as jest.Mock).mockResolvedValue({ name: 'Test Product' })
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
    expect(getByText('Receipt')).toBeTruthy()
    expect(getByText('Barcode')).toBeTruthy()
  })

  it('shows the "Start Camera" button', async () => {
    const { getByText } = await render(<ScanScreen />)
    expect(getByText('Start Camera')).toBeTruthy()
  })

  it('shows the "Choose from Gallery" button', async () => {
    const { getByText } = await render(<ScanScreen />)
    expect(getByText('Choose from Gallery')).toBeTruthy()
  })

  it('defaults to receipt mode instructions', async () => {
    const { getByText } = await render(<ScanScreen />)
    expect(getByText('Position receipt in frame')).toBeTruthy()
    expect(getByText('Receipt Tips')).toBeTruthy()
  })

  it('shows the "8 free scans per month" usage note by default (receipt mode)', async () => {
    const { getByText } = await render(<ScanScreen />)
    expect(getByText('8 free scans per month')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Mode toggle
// ─────────────────────────────────────────────────────────────────────────────

describe('ScanScreen mode toggle', () => {
  it('switches to barcode mode instructions when Barcode tab is tapped', async () => {
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Barcode'))
    expect(getByText('Position barcode in frame')).toBeTruthy()
  })

  it('shows Scanning Tips in barcode mode', async () => {
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Barcode'))
    expect(getByText('Scanning Tips')).toBeTruthy()
  })

  it('does not show the usage note in barcode mode', async () => {
    const { getByText, queryByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Barcode'))
    expect(queryByText('8 free scans per month')).toBeNull()
  })

  it('switches back to receipt mode when Receipt tab is tapped', async () => {
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Barcode'))
    await fireEvent.press(getByText('Receipt'))
    expect(getByText('Receipt Tips')).toBeTruthy()
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
    // Default mode is receipt → camera header shows "Scan Receipt"
    await waitFor(() => expect(getByText('Scan Receipt')).toBeTruthy())
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
    expect(queryByText('Scan Receipt')).toBeNull()
  })

  it('activates without requesting permission when already granted', async () => {
    ;(useCameraPermissions as jest.Mock).mockReturnValue([
      { granted: true, status: 'granted' },
      mockRequestPermission,
    ])
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() => expect(getByText('Scan Receipt')).toBeTruthy())
    expect(mockRequestPermission).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Camera active state
// ─────────────────────────────────────────────────────────────────────────────

describe('ScanScreen camera active state', () => {
  it('shows "Scan Receipt" header when started in receipt mode (default)', async () => {
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() => expect(getByText('Scan Receipt')).toBeTruthy())
  })

  it('shows "Scan Barcode" header when started in barcode mode', async () => {
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Barcode'))
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() => expect(getByText('Scan Barcode')).toBeTruthy())
  })

  it('returns to idle state when the close button is tapped', async () => {
    const { getByText, getByTestId } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() => expect(getByText('Scan Receipt')).toBeTruthy())
    await fireEvent.press(getByTestId('icon-x'))
    await waitFor(() => expect(getByText('Start Camera')).toBeTruthy())
  })

  it('shows a gallery icon button in the camera header', async () => {
    const { getByText, getByTestId } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() => expect(getByText('Scan Receipt')).toBeTruthy())
    expect(getByTestId('icon-image')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Guest gate — receipt mode shutter
// ─────────────────────────────────────────────────────────────────────────────

describe('ScanScreen guest gate for receipt scanning', () => {
  it('shows "Account Required" alert when a guest taps the shutter in receipt mode', async () => {
    (useAuth as jest.Mock).mockReturnValue({ isGuest: true, signOut: mockSignOut })

    const { getByText, getByTestId } = await render(<ScanScreen />)
    // Receipt is already the default mode
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() => expect(getByText('Scan Receipt')).toBeTruthy())
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
    ;(useAuth as jest.Mock).mockReturnValue({ isGuest: true, signOut: mockSignOut })

    const { getByText, getByTestId } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Start Camera'))
    await waitFor(() => expect(getByText('Scan Receipt')).toBeTruthy())
    await fireEvent.press(getByTestId('icon-camera'))
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled())

    expect(APIService.scanReceipt).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Gallery picker — idle state button
// ─────────────────────────────────────────────────────────────────────────────

describe('ScanScreen gallery picker', () => {
  it('calls launchImageLibraryAsync when "Choose from Gallery" is tapped', async () => {
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Choose from Gallery'))
    await waitFor(() => expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(1))
  })

  it('does nothing when the gallery picker is canceled', async () => {
    mockLaunchImageLibrary.mockResolvedValue({ canceled: true })
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Choose from Gallery'))
    await waitFor(() => expect(mockLaunchImageLibrary).toHaveBeenCalled())
    expect(APIService.scanReceipt).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('requests base64 in receipt mode and calls scanReceipt with it', async () => {
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://receipt.jpg', base64: 'abc123' }],
    })
    const { getByText } = await render(<ScanScreen />)
    // Default mode is receipt
    await fireEvent.press(getByText('Choose from Gallery'))
    await waitFor(() =>
      expect(APIService.scanReceipt).toHaveBeenCalledWith('abc123')
    )
  })

  it('navigates to ReceiptConfirm after a successful receipt gallery scan', async () => {
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://receipt.jpg', base64: 'abc123' }],
    })
    ;(APIService.scanReceipt as jest.Mock).mockResolvedValue({
      receipt_id: 'r-1',
      line_items: [{ name: 'Milk', price: 2.50 }],
      merchant_name: 'Tesco',
      total_amount: 2.50,
    })

    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Choose from Gallery'))
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('ReceiptConfirm', expect.objectContaining({
        receiptId: 'r-1',
        merchant: 'Tesco',
      }))
    )
  })

  it('adds selected:true to every line item from a gallery receipt scan', async () => {
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://receipt.jpg', base64: 'abc123' }],
    })
    ;(APIService.scanReceipt as jest.Mock).mockResolvedValue({
      receipt_id: 'r-1',
      line_items: [{ name: 'Milk', price: 2.50 }, { name: 'Eggs', price: 3.00 }],
      merchant_name: null,
      total_amount: 5.50,
    })

    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Choose from Gallery'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled())

    const items = mockNavigate.mock.calls[0][1].items
    expect(items.every((item: any) => item.selected === true)).toBe(true)
  })

  it('shows "Account Required" alert when a guest taps gallery in receipt mode', async () => {
    ;(useAuth as jest.Mock).mockReturnValue({ isGuest: true, signOut: mockSignOut })
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Choose from Gallery'))
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Account Required',
        expect.stringContaining('free account'),
        expect.any(Array)
      )
    )
    expect(mockLaunchImageLibrary).not.toHaveBeenCalled()
  })

  it('does not call scanReceipt when the guest gate blocks gallery pick', async () => {
    ;(useAuth as jest.Mock).mockReturnValue({ isGuest: true, signOut: mockSignOut })
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Choose from Gallery'))
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled())
    expect(APIService.scanReceipt).not.toHaveBeenCalled()
  })

  it('calls CameraView.scanFromURLAsync with the image URI in barcode mode', async () => {
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://product.jpg' }],
    })
    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Barcode'))
    await fireEvent.press(getByText('Choose from Gallery'))
    await waitFor(() =>
      expect(mockScanFromURLAsync).toHaveBeenCalledWith(
        'file://product.jpg',
        expect.arrayContaining(['ean13', 'upc_a'])
      )
    )
  })

  it('navigates to BarcodeResult when a barcode is found in the gallery image', async () => {
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://product.jpg' }],
    })
    mockScanFromURLAsync.mockResolvedValue([{ type: 'ean13', data: '5000112637922' }])

    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Barcode'))
    await fireEvent.press(getByText('Choose from Gallery'))
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('BarcodeResult', expect.objectContaining({
        barcode: '5000112637922',
      }))
    )
  })

  it('shows "No Barcode Found" alert when the gallery image contains no barcode', async () => {
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://product.jpg' }],
    })
    mockScanFromURLAsync.mockResolvedValue([]) // no barcodes detected

    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Barcode'))
    await fireEvent.press(getByText('Choose from Gallery'))
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'No Barcode Found',
        expect.any(String),
        expect.any(Array)
      )
    )
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows "Monthly Limit Reached" alert when receipt gallery scan returns 429', async () => {
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://receipt.jpg', base64: 'abc123' }],
    })
    const err: any = new Error('Rate limited')
    err.response = { status: 429 }
    ;(APIService.scanReceipt as jest.Mock).mockRejectedValue(err)

    const { getByText } = await render(<ScanScreen />)
    await fireEvent.press(getByText('Choose from Gallery'))
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Monthly Limit Reached',
        expect.any(String),
        expect.any(Array)
      )
    )
  })
})
