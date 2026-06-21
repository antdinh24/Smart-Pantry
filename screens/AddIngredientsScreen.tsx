/**
 * AddIngredientsScreen.tsx
 *
 * PURPOSE:
 *   A form screen for manually adding a new item to the pantry.
 *   Reached by tapping the "+" button on PantryScreen.
 *
 * WHAT CHANGED FROM THE OLD VERSION:
 *   The old screen showed a list of existing pantry items with checkboxes —
 *   which didn't make sense for "adding" items. This rewrite is a proper
 *   input form with fields matching the backend's PantryItem schema.
 *
 * FIELDS:
 *   - Ingredient name (required text input)
 *   - Quantity (required numeric input)
 *   - Unit (horizontal chip selector — e.g. "count", "g", "L")
 *   - Category (grid chip selector — e.g. "produce", "dairy")
 *   - Expiration date (optional text input, accepts "YYYY-MM-DD" or blank)
 *
 * DATA FLOW:
 *   User fills form → taps "Add to Pantry"
 *     → calls PantryContext.addItem() (POST /pantry + updates local state)
 *       → navigates back to PantryScreen
 *
 * WHY use PantryContext.addItem() instead of APIService directly?
 *   PantryContext keeps an in-memory list of all pantry items. Calling addItem()
 *   updates that list immediately, so PantryScreen shows the new item as soon
 *   as the user returns — no refresh needed.
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
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import Icon from "react-native-vector-icons/Feather"
import { useNavigation } from "@react-navigation/native"
import { usePantry } from "../hooks/usePantry"

/**
 * CATEGORIES — matches the backend's PantryService.categorize_ingredient() values.
 * If the backend adds or renames categories, update this list to match.
 */
const CATEGORIES = [
  "pantry",
  "produce",
  "dairy",
  "protein",
  "grains",
  "condiments",
  "beverages",
  "snacks",
]

/**
 * UNITS — common measurement units for pantry items.
 * "count" is the default for whole items (apples, cans, eggs).
 * The rest cover weight and volume.
 */
const UNITS = ["count", "g", "kg", "mL", "L", "oz", "lb", "package"]

export default function AddIngredientsScreen() {
  const navigation = useNavigation()

  /**
   * addItem from PantryContext — calls POST /pantry AND updates the in-memory list.
   * We use this instead of APIService directly so PantryScreen stays in sync.
   */
  const { addItem } = usePantry()

  // ── Form field state ──────────────────────────────────────────────────────

  /** The ingredient name the user types, e.g. "Whole Milk" */
  const [name, setName] = useState("")

  /**
   * Quantity stored as a string because TextInput works with strings.
   * Parsed to a float in handleSubmit just before calling addItem().
   */
  const [quantity, setQuantity] = useState("1")

  /** Selected unit — defaults to "count" for most manually-entered items */
  const [unit, setUnit] = useState("count")

  /** Selected category — defaults to "pantry" (the catch-all category) */
  const [category, setCategory] = useState("pantry")

  /**
   * Expiration date — optional. User enters in YYYY-MM-DD format.
   * Left empty if the item doesn't expire (e.g. salt, spices).
   * The backend accepts null for expiration_date.
   */
  const [expirationDate, setExpirationDate] = useState("")

  /** True while the addItem() API call is in flight — disables button and shows spinner */
  const [saving, setSaving] = useState(false)

  /**
   * handleSubmit
   *
   * Validates the form, then calls PantryContext.addItem().
   * On success: navigates back to PantryScreen.
   * On failure: shows an error alert.
   *
   * VALIDATION:
   *   1. Name must not be blank
   *   2. Quantity must be a positive number
   *   3. Expiration date (if provided) must match YYYY-MM-DD format
   */
  const handleSubmit = async () => {
    // Guard: name is required
    if (!name.trim()) {
      Alert.alert("Name Required", "Please enter an ingredient name.")
      return
    }

    // Guard: quantity must be a valid positive number
    const qty = parseFloat(quantity)
    if (isNaN(qty) || qty <= 0) {
      Alert.alert("Invalid Quantity", "Please enter a quantity greater than 0.")
      return
    }

    // Guard: expiration date format (only if the user typed something)
    if (expirationDate && !/^\d{4}-\d{2}-\d{2}$/.test(expirationDate)) {
      Alert.alert("Invalid Date", "Please enter the date as YYYY-MM-DD (e.g. 2025-06-30).")
      return
    }

    setSaving(true)
    try {
      await addItem({
        ingredient_name: name.trim(),
        quantity: qty,
        unit,
        category,
        // Only pass expiration_date if the user entered something — otherwise omit it
        // so the backend stores null rather than an empty string
        ...(expirationDate ? { expiration_date: expirationDate } : {}),
      })

      // Success — navigate back so the user sees the updated pantry list
      navigation.goBack()
    } catch {
      Alert.alert("Error", "Failed to add item. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/*
       * KeyboardAvoidingView pushes the form up when the keyboard opens
       * so the bottom fields don't get hidden behind it.
       */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Icon name="arrow-left" size={24} color="#f8fafc" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Ingredient</Text>
          {/* Empty spacer keeps the title visually centered */}
          <View style={styles.iconButton} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Form card ── */}
          <View style={styles.card}>

            {/* Name input — required */}
            <Text style={styles.label}>
              Ingredient Name <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.inputRow}>
              <Icon name="package" size={16} color="#64748b" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Whole Milk"
                placeholderTextColor="#475569"
                returnKeyType="next"
                autoCorrect={false}
              />
            </View>

            {/* Quantity + Unit row */}
            <View style={styles.row}>
              {/* Quantity — numeric, required */}
              <View style={styles.quantityField}>
                <Text style={styles.label}>
                  Quantity <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.inputStandalone}
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  placeholderTextColor="#475569"
                />
              </View>

              {/* Unit — horizontal chip scroll */}
              <View style={styles.unitField}>
                <Text style={styles.label}>Unit</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.chipScroll}
                >
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

            {/* Category grid */}
            <Text style={styles.label}>Category</Text>
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

            {/* Expiration date — optional */}
            <Text style={styles.label}>
              Expiration Date{" "}
              <Text style={styles.optional}>(optional)</Text>
            </Text>
            <View style={styles.inputRow}>
              <Icon name="calendar" size={16} color="#64748b" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={expirationDate}
                onChangeText={setExpirationDate}
                placeholder="YYYY-MM-DD  e.g. 2025-12-31"
                placeholderTextColor="#475569"
                keyboardType="numbers-and-punctuation"
                returnKeyType="done"
                maxLength={10} /* YYYY-MM-DD is exactly 10 characters */
              />
            </View>

            {/* Submit button */}
            <TouchableOpacity
              style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
              onPress={handleSubmit}
              disabled={saving}
            >
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

          {/*
           * Tip card — helps users understand the expiry date format
           * and that most fields are optional.
           */}
          <View style={styles.tipCard}>
            <Icon name="info" size={16} color="#64748b" />
            <Text style={styles.tipText}>
              Only the name and quantity are required. You can also scan a
              barcode from the Pantry screen to auto-fill product details.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f1419",
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#1a1f2e",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#f8fafc",
  },
  /** Fixed 40×40 touch target for icon buttons */
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // ── Form card ─────────────────────────────────────────────────────────────

  card: {
    backgroundColor: "#1a1f2e",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 20,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: "#94a3b8",
    marginBottom: 8,
    marginTop: 16,
  },
  /** Red asterisk shown next to required field labels */
  required: {
    color: "#ef4444",
  },
  /** "(optional)" label shown next to optional field labels */
  optional: {
    color: "#475569",
    fontWeight: "400",
  },

  /** Input field with a leading icon */
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f1419",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  /**
   * flex: 1 makes the TextInput fill the remaining width after the icon.
   */
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: "#f8fafc",
  },

  /** Standalone input field without a leading icon (used for quantity) */
  inputStandalone: {
    backgroundColor: "#0f1419",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: "#f8fafc",
  },

  /** Side-by-side row for Quantity and Unit */
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  /** Quantity takes less width since it's just a number */
  quantityField: {
    width: 90,
  },
  /** Unit takes the remaining width */
  unitField: {
    flex: 1,
  },
  chipScroll: {
    marginTop: 2,
  },

  /** Unselected unit chip */
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    marginRight: 6,
    backgroundColor: "#0f1419",
  },
  /** Selected unit chip — green tint */
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
  /** Unselected category chip */
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
    textTransform: "capitalize",
  },
  categoryChipTextSelected: {
    color: "#10b981",
    fontWeight: "600",
  },

  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 24,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },

  // ── Tip card ──────────────────────────────────────────────────────────────

  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(51, 65, 85, 0.3)",
    borderRadius: 12,
    padding: 14,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: "#64748b",
    lineHeight: 18,
  },
})
