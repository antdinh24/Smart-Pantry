/**
 * ScanScreen.tsx
 *
 * PURPOSE:
 *   Two-mode scan screen: barcode scanning and receipt scanning.
 *
 *   BARCODE MODE (existing):
 *     Opens a live camera feed. When a product barcode enters the frame,
 *     the app looks it up in OpenFoodFacts via the backend and navigates
 *     to BarcodeResultScreen so the user can add it to their pantry.
 *
 *   RECEIPT MODE (new):
 *     Opens the camera for a still photo capture. After the shutter is
 *     tapped, the image is base64-encoded and sent to POST /receipts/scan,
 *     which uses GPT-4o vision to extract line items. The result navigates
 *     to ReceiptConfirmScreen where the user can check/uncheck items before
 *     adding them all to their pantry in one tap.
 *
 * MODE TOGGLE:
 *   Two tabs in the idle state ("Barcode" / "Receipt") let the user switch.
 *   The camera header also shows the current mode as its title.
 *
 * CAMERA LIFECYCLE:
 *   Camera is only active when the user taps "Start Camera". When inactive,
 *   a static placeholder is shown. This conserves battery and avoids holding
 *   the camera hardware lock when the user isn't scanning.
 *
 * USAGE LIMIT (receipt mode only):
 *   Free users get 8 receipt scans per month. When the backend returns HTTP 429,
 *   we show an upgrade prompt Alert instead of navigating to ReceiptConfirmScreen.
 *
 * LIBRARIES USED:
 *   - expo-camera: CameraView (live feed + still capture), useCameraPermissions
 *   - react-navigation: navigation between screens
 *   - APIService: axios wrapper for FastAPI backend calls
 */

import { useState, useRef } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from "react-native"
import { CameraView, useCameraPermissions } from "expo-camera"
import Icon from "react-native-vector-icons/Feather"
import { useNavigation } from "@react-navigation/native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { RootStackParamList } from "../types/navigation"
import { APIService } from "../services/api"

/** Type alias so TypeScript knows which screen we're on and what we can navigate to. */
type ScanNav = NativeStackNavigationProp<RootStackParamList, "Scan">

/**
 * ScanMode
 *
 * Controls how the camera behaves when active:
 *   "barcode" — live barcode detection via onBarcodeScanned (existing flow)
 *   "receipt" — still-photo capture via takePictureAsync (new flow)
 */
type ScanMode = "barcode" | "receipt"

export default function ScanScreen() {
  const navigation = useNavigation<ScanNav>()

  /**
   * useCameraPermissions() returns:
   *   - permission: the current permission status (null = not yet asked, granted/denied = decided)
   *   - requestPermission: a function to show the OS permission dialog
   *
   * We use this hook instead of manually calling Permissions API because expo-camera
   * handles the cross-platform differences between Android and iOS for us.
   */
  const [permission, requestPermission] = useCameraPermissions()

  /** Controls whether the live camera feed is visible (true) or the idle placeholder is shown (false). */
  const [cameraActive, setCameraActive] = useState(false)

  /** Shows a loading spinner and hint text while the API call is in progress. */
  const [loading, setLoading] = useState(false)

  /**
   * Tracks whether the user wants barcode scanning or receipt photo capture.
   * Defaults to "barcode" (existing behavior) so existing users see no change.
   */
  const [mode, setMode] = useState<ScanMode>("barcode")

  /**
   * Ref to the CameraView so we can call takePictureAsync() in receipt mode.
   *
   * WHY useRef instead of useState?
   *   We never need to trigger a re-render when the camera ref changes — we
   *   just need the imperative handle to call takePictureAsync(). useState
   *   would cause unnecessary re-renders.
   */
  const cameraRef = useRef<CameraView>(null)

  /**
   * WHY useRef for the scan lock?
   *
   * CameraView fires onBarcodeScanned very rapidly — multiple times per second
   * while a barcode is in frame. If we used useState(false) as a lock, React
   * batches state updates and the flag might not flip fast enough to prevent
   * a second API call from firing before the first one finishes.
   *
   * useRef gives us a value that:
   *   - Updates *synchronously* (no batching delay)
   *   - Does NOT cause a re-render (we only use it as an internal guard)
   *
   * Result: the first scan event acquires the lock immediately, and every
   * subsequent event sees `scanLocked.current === true` and exits early.
   */
  const scanLocked = useRef(false)

  // ─────────────────────────────────────────────────────────────────────────
  // BARCODE MODE HANDLER
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * handleBarcodeScan
   *
   * Called by CameraView every time it detects a barcode in the camera frame.
   * This can fire dozens of times per second, so the first thing we do is check
   * the lock to prevent duplicate API calls.
   *
   * @param data  - The raw barcode string (e.g. "012345678901")
   * @param type  - The barcode format (e.g. "ean13", "qr") — received but unused
   *
   * FLOW:
   *   1. Check lock — exit immediately if already processing
   *   2. Acquire lock + show loading spinner
   *   3. Call backend: GET /api/v1/pantry/barcode/{data}
   *   4. Navigate to BarcodeResultScreen with product info (or null if not found)
   *   5. Release lock after 2 seconds to allow re-scanning if user comes back
   */
  const handleBarcodeScan = async ({ data }: { type: string; data: string }) => {
    // Guard: only run in barcode mode; exit if already processing
    if (mode !== "barcode" || scanLocked.current || loading) return

    // Acquire the lock synchronously so the next event sees it immediately
    scanLocked.current = true
    setLoading(true)

    try {
      // Look up the barcode in OpenFoodFacts via our backend
      const product = await APIService.lookupBarcode(data)

      // Navigate to the result screen with full product info
      navigation.navigate("BarcodeResult", { product, barcode: data })
    } catch {
      /**
       * Barcode not found in OpenFoodFacts, or the API call failed.
       * We still navigate to BarcodeResultScreen with product=null so the user
       * can manually type the product name instead of getting stuck on this screen.
       */
      navigation.navigate("BarcodeResult", { product: null, barcode: data })
    } finally {
      setLoading(false)

      /**
       * Release the lock after 2 seconds.
       * We delay rather than releasing immediately so that if the user presses
       * "Scan Again" and comes back to this screen, there's a brief cooldown
       * before the camera can trigger another lookup.
       */
      setTimeout(() => {
        scanLocked.current = false
      }, 2000)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RECEIPT MODE HANDLER
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * handleTakePicture
   *
   * Called when the user taps the shutter button in receipt mode.
   * Captures a still photo, base64-encodes it, and sends it to the backend
   * for GPT-4o vision processing.
   *
   * FLOW:
   *   1. Guard against double-taps (loading flag)
   *   2. takePictureAsync({ base64: true, quality: 0.7 }) — 70% quality
   *      balances image clarity against upload size (~200-400 KB)
   *   3. POST /receipts/scan with base64 image
   *   4a. On success → navigate to ReceiptConfirmScreen
   *   4b. On HTTP 429 → show upgrade prompt Alert
   *   4c. On other error → show generic retry Alert
   *
   * WHY quality: 0.7?
   *   GPT-4o can read receipts at medium quality. Higher quality (1.0) triples
   *   the image size with no meaningful accuracy gain for printed text.
   */
  const handleTakePicture = async () => {
    if (!cameraRef.current || loading) return

    setLoading(true)

    try {
      // Capture still photo with base64 encoding included
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7,
      })

      if (!photo?.base64) {
        throw new Error("Camera did not return image data")
      }

      // Send to backend — GPT-4o vision extracts and structures the line items
      const result = await APIService.scanReceipt(photo.base64)

      /**
       * Add `selected: true` to every line item.
       * The backend returns items without this field — it's frontend-only for
       * driving the checkboxes on ReceiptConfirmScreen. All items default to
       * selected so the user just needs to uncheck what they don't want.
       */
      const itemsWithSelection = (result.line_items ?? []).map((item: any) => ({
        ...item,
        selected: true,
      }))

      navigation.navigate("ReceiptConfirm", {
        receiptId: result.receipt_id,
        items: itemsWithSelection,
        merchant: result.merchant_name ?? null,
        total: result.total_amount ?? 0,
      })
    } catch (error: any) {
      if (error?.response?.status === 429) {
        // Free tier limit hit — show upgrade prompt instead of error
        Alert.alert(
          "Monthly Limit Reached",
          "You've used all 8 free receipt scans this month. Upgrade to Premium for unlimited scans.",
          [{ text: "Got It" }]
        )
      } else {
        Alert.alert(
          "Scan Failed",
          "Could not process the receipt. Make sure the receipt is well-lit and fully in frame, then try again.",
          [{ text: "OK" }]
        )
      }
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED CAMERA HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * handleStartCamera
   *
   * Called when the user taps "Start Camera" on the idle screen.
   * Checks if camera permission has been granted. If not, requests it.
   * If the user denies, shows an alert explaining what to do.
   * If granted, switches to the active camera view.
   */
  const handleStartCamera = async () => {
    if (!permission?.granted) {
      const result = await requestPermission()

      if (!result.granted) {
        Alert.alert(
          "Camera Permission Required",
          "Please allow camera access in your device settings to scan items.",
          [{ text: "OK" }]
        )
        return
      }
    }

    // Permission is granted — show the live camera feed
    setCameraActive(true)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: CAMERA ACTIVE STATE
  // Shown when the user has tapped "Start Camera" and permission is granted.
  // The UI differs by mode: barcode mode shows a scan frame; receipt mode
  // shows a shutter button.
  // ─────────────────────────────────────────────────────────────────────────
  if (cameraActive) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.cameraContainer}>
          {/*
           * CameraView fills the entire screen using absoluteFillObject.
           *
           * BARCODE MODE: onBarcodeScanned fires our handler on detection.
           *   barcodeScannerSettings limits which formats to look for.
           *
           * RECEIPT MODE: onBarcodeScanned is omitted — we wait for the
           *   user to tap the shutter button instead.
           */}
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={mode === "barcode" ? handleBarcodeScan : undefined}
            barcodeScannerSettings={
              mode === "barcode"
                ? { barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "qr", "code128", "code39"] }
                : undefined
            }
          />

          {/* Semi-transparent header overlay so the user can close the camera */}
          <View style={styles.cameraHeader}>
            <TouchableOpacity
              onPress={() => setCameraActive(false)}
              style={styles.iconButton}
            >
              <Icon name="x" size={24} color="#f8fafc" />
            </TouchableOpacity>
            <Text style={styles.cameraHeaderTitle}>
              {mode === "barcode" ? "Scan Barcode" : "Scan Receipt"}
            </Text>
            {/* Empty view on the right to keep the title visually centered */}
            <View style={styles.iconButton} />
          </View>

          {/* ── BARCODE MODE: scan frame with corner brackets ── */}
          {mode === "barcode" && (
            <View style={styles.frameContainer}>
              <View style={styles.scannerFrame}>
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
              </View>
              <Text style={styles.scanHint}>
                {loading ? "Looking up product..." : "Align barcode within the frame"}
              </Text>
            </View>
          )}

          {/* ── RECEIPT MODE: large scan frame + shutter button at the bottom ── */}
          {mode === "receipt" && (
            <>
              {/* Larger frame to fit the whole receipt */}
              <View style={styles.receiptFrameContainer}>
                <View style={styles.receiptScannerFrame}>
                  <View style={[styles.corner, styles.cornerTopLeft]} />
                  <View style={[styles.corner, styles.cornerTopRight]} />
                  <View style={[styles.corner, styles.cornerBottomLeft]} />
                  <View style={[styles.corner, styles.cornerBottomRight]} />
                </View>
                <Text style={styles.scanHint}>
                  {loading ? "Processing receipt..." : "Fit the entire receipt in frame"}
                </Text>
              </View>

              {/* Shutter button pinned to the bottom of the screen */}
              <View style={styles.shutterContainer}>
                <TouchableOpacity
                  style={[styles.shutterButton, loading && styles.shutterButtonDisabled]}
                  onPress={handleTakePicture}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Icon name="camera" size={28} color="#ffffff" />
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Full-screen dimming overlay + spinner shown during API call */}
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#10b981" />
              <Text style={styles.loadingText}>
                {mode === "receipt" ? "Analyzing receipt..." : "Looking up product..."}
              </Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: IDLE STATE
  // Shown before the user starts the camera. Contains the mode toggle tabs,
  // a static preview placeholder, and the "Start Camera" button.
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Top navigation bar */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Icon name="arrow-left" size={20} color="#f8fafc" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Item</Text>
          {/* Spacer to keep the title centered */}
          <View style={styles.iconButton} />
        </View>

        {/*
         * Mode toggle — two tabs below the header title.
         * Switching the mode does NOT start the camera; it just changes what
         * the camera will do once the user taps "Start Camera".
         */}
        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[styles.modeTab, mode === "barcode" && styles.modeTabActive]}
            onPress={() => setMode("barcode")}
          >
            <Icon
              name="package"
              size={14}
              color={mode === "barcode" ? "#10b981" : "#94a3b8"}
            />
            <Text style={[styles.modeTabText, mode === "barcode" && styles.modeTabTextActive]}>
              Barcode
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeTab, mode === "receipt" && styles.modeTabActive]}
            onPress={() => setMode("receipt")}
          >
            <Icon
              name="file-text"
              size={14}
              color={mode === "receipt" ? "#10b981" : "#94a3b8"}
            />
            <Text style={[styles.modeTabText, mode === "receipt" && styles.modeTabTextActive]}>
              Receipt
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.idleContent}>
        {/* Static camera preview placeholder showing the scan frame design */}
        <View style={styles.cameraCard}>
          <View style={styles.cameraPreview}>
            <View style={mode === "barcode" ? styles.scannerFrame : styles.receiptScannerFrameIdle}>
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />
              {/* Faint icon in the center as a visual cue */}
              <Icon
                name={mode === "barcode" ? "maximize" : "file-text"}
                size={48}
                color="rgba(16, 185, 129, 0.3)"
              />
            </View>
          </View>
        </View>

        {/* Instructions change by mode */}
        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>
            {mode === "barcode" ? "Position barcode in frame" : "Position receipt in frame"}
          </Text>
          <Text style={styles.instructionsSubtitle}>
            {mode === "barcode"
              ? "Align the barcode within the scanning area"
              : "Capture the full receipt — items are extracted automatically"}
          </Text>
          {mode === "receipt" && (
            <View style={styles.usageNote}>
              <Icon name="info" size={12} color="#94a3b8" />
              <Text style={styles.usageNoteText}>8 free scans per month</Text>
            </View>
          )}
        </View>

        {/* Primary action — starts the camera flow (permission check + camera view) */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleStartCamera}>
            <Icon name="camera" size={20} color="#ffffff" />
            <Text style={styles.primaryButtonText}>Start Camera</Text>
          </TouchableOpacity>
        </View>

        {/* Tips card — content changes by mode */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>
            {mode === "barcode" ? "Scanning Tips" : "Receipt Tips"}
          </Text>
          <View style={styles.tipsList}>
            {(mode === "barcode"
              ? [
                  "Ensure good lighting for best results",
                  "Hold your device steady while scanning",
                  "Keep barcode flat and within the frame",
                ]
              : [
                  "Lay receipt flat on a dark surface",
                  "Ensure the full receipt is visible",
                  "Good lighting improves accuracy",
                ]
            ).map((tip, i) => (
              <View key={i} style={styles.tipItem}>
                {/* Numbered circle badge */}
                <View style={styles.tipNumber}>
                  <Text style={styles.tipNumberText}>{i + 1}</Text>
                </View>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
//
// Color palette used across the app:
//   #0f1419  — darkest background (page background)
//   #1a1f2e  — card/header background (slightly lighter)
//   #334155  — border color
//   #f8fafc  — primary text (near white)
//   #94a3b8  — secondary/hint text (muted)
//   #10b981  — accent/brand green (buttons, highlights)
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f1419",
  },

  // ── Camera active styles ──────────────────────────────────────────────────

  /** Fills the full screen when the camera is active */
  cameraContainer: {
    flex: 1,
  },

  /**
   * Positioned absolutely at the top of the camera view.
   * Semi-transparent background so camera footage shows through.
   */
  cameraHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  cameraHeaderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#f8fafc",
  },

  /** Centers the barcode scanner frame and hint text vertically/horizontally */
  frameContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  /** Centers the receipt frame — positioned higher to leave room for shutter button */
  receiptFrameContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 120,
  },

  /** Text shown below the scanner frame — pill shape with dark background for readability */
  scanHint: {
    marginTop: 24,
    fontSize: 14,
    color: "#f8fafc",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: "hidden",
  },

  /** Shutter button container — pinned to the bottom of the screen in receipt mode */
  shutterContainer: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },

  /** Circular shutter button with green accent */
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.3)",
  },

  /** Dimmed state while the API call is in progress */
  shutterButtonDisabled: {
    backgroundColor: "#334155",
  },

  /**
   * Full-screen semi-transparent overlay shown while the API call is running.
   * Prevents the user from interacting with the camera during the lookup.
   */
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },

  loadingText: {
    fontSize: 16,
    color: "#f8fafc",
    fontWeight: "500",
  },

  // ── Idle state styles ─────────────────────────────────────────────────────

  header: {
    backgroundColor: "#1a1f2e",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: "#f8fafc",
    marginLeft: 16,
  },

  /** Fixed 40×40 hit target for icon buttons (accessibility standard minimum) */
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  /** Row of two tab buttons shown below the header title in the idle state */
  modeTabs: {
    flexDirection: "row",
    marginTop: 12,
    backgroundColor: "#0f1419",
    borderRadius: 8,
    padding: 4,
    gap: 4,
  },

  /** Single tab button — takes up half the row width */
  modeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 6,
  },

  /** Highlighted state for the currently selected tab */
  modeTabActive: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },

  modeTabText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#94a3b8",
  },

  modeTabTextActive: {
    color: "#10b981",
  },

  idleContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 24,
  },

  /** Card container for the static camera preview placeholder */
  cameraCard: {
    backgroundColor: "#1a1f2e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden",
    marginBottom: 24,
  },

  /** Square preview area — aspectRatio: 1 makes height = width automatically */
  cameraPreview: {
    aspectRatio: 1,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },

  /** The 256×256 box that the corner brackets attach to (barcode mode) */
  scannerFrame: {
    width: 256,
    height: 256,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },

  /** Taller frame for receipt mode in the idle preview */
  receiptScannerFrameIdle: {
    width: 200,
    height: 280,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },

  /** Taller frame for receipt mode in the active camera view */
  receiptScannerFrame: {
    width: 300,
    height: 420,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },

  /**
   * Base style for all four corner brackets.
   * Each corner removes two of the four borders to create an "L" shape.
   */
  corner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderColor: "#10b981",
    borderWidth: 4,
  },
  /** Top-left L: keep top + left borders, remove right + bottom */
  cornerTopLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  /** Top-right L: keep top + right borders, remove left + bottom */
  cornerTopRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  /** Bottom-left L: keep bottom + left borders, remove right + top */
  cornerBottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  /** Bottom-right L: keep bottom + right borders, remove left + top */
  cornerBottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },

  instructions: {
    alignItems: "center",
    marginBottom: 24,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#f8fafc",
    marginBottom: 8,
  },
  instructionsSubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
  },

  /** Small "8 free scans per month" note shown below receipt mode subtitle */
  usageNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  usageNoteText: {
    fontSize: 12,
    color: "#94a3b8",
  },

  actions: {
    marginBottom: 24,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 16,
    borderRadius: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  tipsCard: {
    backgroundColor: "rgba(51, 65, 85, 0.3)",
    borderRadius: 12,
    padding: 16,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f8fafc",
    marginBottom: 16,
  },
  tipsList: { gap: 12 },
  tipItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  /** Small circular badge containing the step number */
  tipNumber: {
    width: 20,
    height: 20,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  tipNumberText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#10b981",
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 20,
  },
})
