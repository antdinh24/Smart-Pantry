/**
 * BarcodeResultScreen.tsx
 *
 * PURPOSE:
 *   Shown after a barcode is scanned. Displays product information retrieved
 *   from OpenFoodFacts (via the backend) and lets the user edit the details
 *   before adding the item to their pantry.
 *
 * TWO SCENARIOS this screen handles:
 *   1. Product FOUND — pre-fills name, category, and other details from the API.
 *      The user can correct anything before saving.
 *   2. Product NOT FOUND — shows an amber warning banner. All fields are blank
 *      so the user can type the details manually. The barcode is still saved
 *      with the pantry item for future reference.
 *
 * NAVIGATION:
 *   - Receives params from ScanScreen: { product, barcode }
 *   - "Add to Pantry" → calls POST /api/v1/pantry → navigates to PantryScreen
 *   - "Scan Again" → navigates back to ScanScreen
 *
 * DATA FLOW:
 *   ScanScreen scans barcode
 *     → calls GET /api/v1/pantry/barcode/{barcode} (backend → OpenFoodFacts)
 *     → navigates here with product data (or null)
 *       → user edits fields
 *         → taps "Add to Pantry"
 *           → calls POST /api/v1/pantry with the edited data
 *             → navigates to PantryScreen
 */

import { useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native"
import Icon from "react-native-vector-icons/Feather"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { RootStackParamList } from "../types/navigation"
import { usePantry } from "../hooks/usePantry"

/** Navigation type — tells TypeScript we're on BarcodeResult and can navigate to other screens */
type Nav = NativeStackNavigationProp<RootStackParamList, "BarcodeResult">

/** Route type — gives us typed access to the params passed from ScanScreen */
type Route = RouteProp<RootStackParamList, "BarcodeResult">

/**
 * CATEGORIES — the list of pantry categories the user can pick from.
 * These match the categories used in the backend's PantryService.categorize_ingredient().
 * Keep this list in sync with the backend if categories are ever added or renamed.
 */
const CATEGORIES = ["pantry", "produce", "dairy", "protein", "grains", "condiments", "beverages", "snacks"]

/**
 * UNITS — measurement units for pantry items.
 * "package" and "count" cover most scanned products (boxed, canned, bagged).
 * g/kg/mL/L/oz/lb are for items sold by weight or volume.
 */
const UNITS = ["count", "g", "kg", "mL", "L", "oz", "lb", "package"]

export default function BarcodeResultScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()

  /**
   * addItem comes from PantryContext — it calls POST /pantry AND updates the
   * in-memory item list. Using it here (instead of APIService directly) means
   * PantryScreen will show the new item immediately without needing a refresh.
   */
  const { addItem } = usePantry()

  /**
   * Destructure the params passed by ScanScreen.
   *   product — the OpenFoodFacts data (or null if not found)
   *   barcode — the raw barcode string (e.g. "012345678901")
   *
   * We always receive barcode even when product is null because we want to
   * store the barcode on the pantry item for potential future lookups.
   */
  const { product, barcode } = route.params

  /**
   * EDITABLE FIELD STATE
   *
   * Each field is initialized from the product data if available,
   * or a sensible default if product is null.
   *
   * WHY store quantity as a string?
   *   TextInput works with strings. If we stored it as a number, we'd have to
   *   convert it to string every render and back to number on save. Keeping it
   *   as a string until the moment we submit avoids that round-tripping.
   *   We parse it to float in handleAddToPantry just before sending to the API.
   */
  const [name, setName] = useState(product?.product_name ?? "")
  const [quantity, setQuantity] = useState("1")
  const [unit, setUnit] = useState(product?.suggested_unit ?? "package")
  const [category, setCategory] = useState(product?.suggested_category ?? "pantry")

  /** True while the POST /pantry API call is in flight — disables the button and shows a spinner */
  const [saving, setSaving] = useState(false)

  /**
   * handleAddToPantry
   *
   * Validates the form fields, then sends the item to the backend.
   * On success, shows a confirmation alert and navigates to the Pantry screen.
   * On failure, shows an error alert and keeps the user on this screen.
   *
   * VALIDATION:
   *   - Name must not be blank (a pantry item needs a name)
   *   - Quantity must be a positive number (parseFloat handles "1.5", rejects "abc")
   */
  const handleAddToPantry = async () => {
    // Guard: name is required
    if (!name.trim()) {
      Alert.alert("Name Required", "Please enter a name for this item.")
      return
    }

    // Guard: quantity must be a valid positive number
    const qty = parseFloat(quantity)
    if (isNaN(qty) || qty <= 0) {
      Alert.alert("Invalid Quantity", "Please enter a valid quantity greater than 0.")
      return
    }

    setSaving(true)
    try {
      /**
       * Call the backend to add the item to the user's pantry.
       * The backend expects: ingredient_name, quantity (number), unit, category, barcode.
       *
       * name.trim() removes accidental leading/trailing spaces.
       * qty is the parsed float version of the quantity string.
       * barcode is passed through so it's stored on the pantry item.
       */
      /**
       * Use PantryContext's addItem instead of APIService directly.
       * addItem calls POST /pantry AND updates the in-memory list, so
       * PantryScreen shows the new item immediately without a refresh.
       */
      await addItem({
        ingredient_name: name.trim(),
        quantity: qty,
        unit,
        category,
        barcode,
      })

      // Success — tell the user and navigate to the Pantry screen
      Alert.alert("Added!", `${name.trim()} has been added to your pantry.`, [
        { text: "OK", onPress: () => navigation.navigate("Pantry") },
      ])
    } catch {
      // Something went wrong on the backend — keep user on this screen so they can retry
      Alert.alert("Error", "Failed to add item. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  /**
   * handleScanAgain
   *
   * Navigates back to ScanScreen so the user can scan another barcode.
   * Uses navigate() instead of goBack() because the user might have arrived
   * here from a different part of the app in the future.
   */
  const handleScanAgain = () => {
    navigation.navigate("Scan")
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Icon name="arrow-left" size={20} color="#f8fafc" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Product Found</Text>
        {/* Spacer keeps title centered */}
        <View style={styles.iconButton} />
      </View>

      {/*
       * ScrollView wraps everything so the content doesn't get cut off on
       * smaller screens when the keyboard is open.
       * keyboardShouldPersistTaps="handled" ensures taps on buttons still
       * work while the keyboard is visible (without this, tapping a button
       * while the keyboard is open just dismisses the keyboard first).
       */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Product status banner ── */}
        {/*
         * Green banner: product was found in OpenFoodFacts.
         * Amber banner: product not found — user needs to fill in manually.
         *
         * The banner uses ternary expressions to swap colors and icon between the two states.
         */}
        <View style={product ? styles.foundBanner : styles.notFoundBanner}>
          <Icon
            name={product ? "check-circle" : "alert-circle"}
            size={20}
            color={product ? "#10b981" : "#f59e0b"}
          />
          <Text style={product ? styles.foundText : styles.notFoundText}>
            {product
              ? `Found: ${product.brands ? `${product.brands} — ` : ""}${product.product_name ?? "Unknown product"}`
              : "Product not found — fill in the details manually"}
          </Text>
        </View>

        {/* ── Product metadata (shown only when product was found) ── */}

        {/* OpenFoodFacts categories string, e.g. "Dairy products, Milk" */}
        {product?.categories && (
          <View style={styles.metaRow}>
            <Icon name="tag" size={14} color="#64748b" />
            <Text style={styles.metaText}>{product.categories}</Text>
          </View>
        )}

        {/* Quantity from the packaging, e.g. "1 gallon" or "500g" */}
        {product?.quantity && (
          <View style={styles.metaRow}>
            <Icon name="package" size={14} color="#64748b" />
            <Text style={styles.metaText}>{product.quantity}</Text>
          </View>
        )}

        {/* Always show the raw barcode number for transparency */}
        <View style={styles.barcodeRow}>
          <Icon name="bar-chart-2" size={14} color="#64748b" />
          <Text style={styles.metaText}>{barcode}</Text>
        </View>

        {/* ── Editable item details card ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Item Details</Text>

          {/* Name field — pre-filled from OpenFoodFacts or blank for manual entry */}
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Whole Milk"
            placeholderTextColor="#475569"
            returnKeyType="done"
          />

          {/* Quantity and Unit on the same row to save vertical space */}
          <View style={styles.row}>
            {/* Quantity — numeric input, stored as string (see comment on useState above) */}
            <View style={styles.halfField}>
              <Text style={styles.label}>Quantity</Text>
              <TextInput
                style={styles.input}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad" /* shows numeric keyboard with decimal point */
                returnKeyType="done"
                placeholderTextColor="#475569"
              />
            </View>

            {/* Unit — horizontal scrollable chip row */}
            <View style={styles.halfField}>
              <Text style={styles.label}>Unit</Text>
              {/*
               * Horizontal ScrollView so all unit chips are accessible without
               * wrapping to a new line. This keeps the layout compact.
               */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.chip, unit === u && styles.chipSelected]}
                    onPress={() => setUnit(u)}
                  >
                    <Text style={[styles.chipText, unit === u && styles.chipTextSelected]}>
                      {u}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Category — wrapping grid of chips */}
          <Text style={styles.label}>Category</Text>
          {/*
           * flexWrap: "wrap" lets chips flow onto multiple lines automatically.
           * This is simpler than a fixed grid and adapts to any screen width.
           */}
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, category === cat && styles.categoryChipSelected]}
                onPress={() => setCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    category === cat && styles.categoryChipTextSelected,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* ── Footer action buttons ── */}
      {/*
       * Two buttons side-by-side:
       *   - "Scan Again" (flex: 1, smaller) — secondary action
       *   - "Add to Pantry" (flex: 2, larger) — primary action
       *
       * flex values make "Add to Pantry" twice as wide as "Scan Again",
       * which gives visual emphasis to the most important action.
       */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleScanAgain}>
          <Icon name="camera" size={18} color="#f8fafc" />
          <Text style={styles.secondaryButtonText}>Scan Again</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
          onPress={handleAddToPantry}
          disabled={saving} /* prevents double-tap while saving */
        >
          {/* Show spinner while API call is in flight, button label otherwise */}
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Icon name="plus" size={18} color="#ffffff" />
              <Text style={styles.primaryButtonText}>Add to Pantry</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
//
// Color palette (same as ScanScreen — keep consistent across the app):
//   #0f1419  — page background (darkest)
//   #1a1f2e  — card/header background
//   #334155  — border color
//   #f8fafc  — primary text (near white)
//   #94a3b8  — secondary/hint text
//   #64748b  — metadata text (dimmer than secondary)
//   #475569  — placeholder text
//   #10b981  — brand green (success, selection highlight)
//   #f59e0b  — amber (warning — used for "not found" state)
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f1419",
  },
  header: {
    backgroundColor: "#1a1f2e",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#f8fafc",
  },

  /** Fixed 40×40 hit target for icon buttons (accessibility standard) */
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    paddingBottom: 32, /* extra bottom padding so content isn't hidden behind the footer */
  },

  /** Green banner — product was found */
  foundBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },

  /** Amber banner — product not found */
  notFoundBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  foundText: {
    flex: 1,
    fontSize: 14,
    color: "#10b981",
    lineHeight: 20,
  },
  notFoundText: {
    flex: 1,
    fontSize: 14,
    color: "#f59e0b",
    lineHeight: 20,
  },

  /** Row for a small icon + metadata text (categories, quantity, barcode) */
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  barcodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
  },
  metaText: {
    fontSize: 13,
    color: "#64748b",
  },

  /** Card that wraps all the editable fields */
  section: {
    backgroundColor: "#1a1f2e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f8fafc",
    marginBottom: 16,
  },

  /** Label above each input field */
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: "#94a3b8",
    marginBottom: 6,
    marginTop: 12,
  },

  /** Text input field — dark background to match the card */
  input: {
    backgroundColor: "#0f1419",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#f8fafc",
  },

  /** Puts Quantity and Unit side-by-side */
  row: {
    flexDirection: "row",
    gap: 12,
  },

  /** Each column in the row takes equal space */
  halfField: {
    flex: 1,
  },
  chipScroll: {
    marginTop: 2,
  },

  /** Default (unselected) unit chip */
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    marginRight: 6,
    backgroundColor: "#0f1419",
  },

  /** Selected unit chip — green border and tinted background */
  chipSelected: {
    borderColor: "#10b981",
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  chipText: {
    fontSize: 13,
    color: "#94a3b8",
  },
  chipTextSelected: {
    color: "#10b981",
    fontWeight: "600",
  },

  /** Category chips wrap across multiple lines */
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },

  /** Default (unselected) category chip */
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0f1419",
  },

  /** Selected category chip */
  categoryChipSelected: {
    borderColor: "#10b981",
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  categoryChipText: {
    fontSize: 13,
    color: "#94a3b8",
    textTransform: "capitalize", /* "produce" → "Produce" without storing capitalized string */
  },
  categoryChipTextSelected: {
    color: "#10b981",
    fontWeight: "600",
  },

  /** Sticky footer holding the two action buttons */
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    backgroundColor: "#1a1f2e",
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },

  /** "Scan Again" — secondary, narrower (flex: 1) */
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#f8fafc",
  },

  /** "Add to Pantry" — primary, wider (flex: 2) */
  primaryButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#10b981",
  },

  /** Dimmed state when the API call is in flight */
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
})
