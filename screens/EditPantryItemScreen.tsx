/**
 * EditPantryItemScreen.tsx
 *
 * PURPOSE:
 *   Lets the user edit the details of an existing pantry item, or delete it.
 *   Reached by long-pressing an item card on PantryScreen and tapping "Edit".
 *
 * HOW IT WORKS:
 *   1. Gets the item ID from navigation route params.
 *   2. Looks up the live item from PantryContext using getItemById(itemId).
 *   3. Pre-fills all form fields with the item's current values.
 *   4. On "Save Changes", calls PantryContext.updateItem() → PUT /pantry/:id.
 *   5. On "Delete Item", asks for confirmation then calls PantryContext.deleteItem()
 *      → DELETE /pantry/:id.
 *   6. Both success paths navigate back to PantryScreen.
 *
 * WHY pass only itemId (not the full item) in route params?
 *   If the user edits an item, then immediately comes back to edit again,
 *   passing the full item object would show stale data. Passing just the ID
 *   and reading from context always gives the current value.
 *
 * FIELDS:
 *   - Ingredient name (required)
 *   - Quantity (required numeric)
 *   - Unit (horizontal chip selector)
 *   - Category (grid chip selector)
 *   - Expiration date (optional, YYYY-MM-DD)
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
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { usePantry } from "../hooks/usePantry"
import { RootStackParamList } from "../types/navigation"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"

/** Route prop type so TypeScript knows exactly which params this screen receives */
type EditPantryItemRouteProp = RouteProp<RootStackParamList, "EditPantryItem">

/**
 * Navigation prop type — typed to RootStackParamList so we can call
 * navigation.pop(2), which is not available on the untyped useNavigation() return.
 * pop(n) removes n screens from the stack at once. We need this after deletion
 * to jump past EditPantryItemScreen back to PantryScreen in one step.
 */
type EditPantryItemNavProp = NativeStackNavigationProp<RootStackParamList, "EditPantryItem">

/**
 * CATEGORIES — same set as AddIngredientsScreen.
 * Must stay in sync with the backend's PantryService.categorize_ingredient() values.
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
 * UNITS — same set as AddIngredientsScreen.
 * "count" covers whole items; the rest cover weight and volume.
 */
const UNITS = ["count", "g", "kg", "mL", "L", "oz", "lb", "package"]

export default function EditPantryItemScreen() {
  const navigation = useNavigation<EditPantryItemNavProp>()
  const route = useRoute<EditPantryItemRouteProp>()

  /**
   * itemId comes from PantryScreen via navigation.navigate("EditPantryItem", { itemId })
   * We use it to look up the live item from context below.
   */
  const { itemId } = route.params

  const { getItemById, updateItem, deleteItem } = usePantry()

  /**
   * item — the current data for this pantry entry.
   * We read it once here to populate the initial form state.
   *
   * If the item is not found (e.g. it was deleted before this screen opened),
   * we show an error and let the user go back.
   */
  const item = getItemById(itemId)

  // ── Form field state ──────────────────────────────────────────────────────
  // All initialised from the existing item's values.

  const [name, setName] = useState(item?.ingredient_name ?? "")

  /**
   * Quantity is stored as a string because TextInput works with strings.
   * We convert item.quantity (number) to string for initial display,
   * then parse it back to float in handleSave before calling updateItem.
   */
  const [quantity, setQuantity] = useState(String(item?.quantity ?? "1"))

  /** Default to "count" if the item has no unit set */
  const [unit, setUnit] = useState(item?.unit ?? "count")

  /** Default to "pantry" if the item has no category set */
  const [category, setCategory] = useState(item?.category ?? "pantry")

  /** Keep the existing expiry date, or blank if none was set */
  const [expirationDate, setExpirationDate] = useState(item?.expiration_date ?? "")

  /** True while the PUT /pantry/:id API call is in flight */
  const [saving, setSaving] = useState(false)

  /** True while the DELETE /pantry/:id API call is in flight */
  const [deleting, setDeleting] = useState(false)

  // ── Guard: item not found ─────────────────────────────────────────────────

  /**
   * If getItemById returned undefined, the item doesn't exist in context.
   * This can happen if:
   *   - The item was just deleted by another action before this screen loaded
   *   - The navigation params were incorrect
   * Show a simple error view instead of crashing.
   */
  if (!item) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Icon name="arrow-left" size={24} color="#f8fafc" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Item</Text>
          <View style={styles.iconButton} />
        </View>
        <View style={styles.notFound}>
          <Icon name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.notFoundText}>Item not found.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * handleSave
   *
   * Validates the form fields, then calls PantryContext.updateItem() which
   * sends PUT /pantry/:id to the backend and updates local state on success.
   * Navigates back to PantryScreen on success.
   *
   * VALIDATION:
   *   1. Name must not be blank
   *   2. Quantity must be a positive number
   *   3. Expiration date (if provided) must be in YYYY-MM-DD format
   */
  const handleSave = async () => {
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

    // Guard: expiration date format check (only if user filled it in)
    if (expirationDate && !/^\d{4}-\d{2}-\d{2}$/.test(expirationDate)) {
      Alert.alert("Invalid Date", "Please enter the date as YYYY-MM-DD (e.g. 2025-06-30).")
      return
    }

    setSaving(true)
    try {
      await updateItem(itemId, {
        ingredient_name: name.trim(),
        quantity: qty,
        unit,
        category,
        // Pass null when cleared to tell the backend to remove the expiry date.
        // An empty string would fail backend validation.
        expiration_date: expirationDate || null,
      })
      navigation.goBack()
    } catch {
      Alert.alert("Error", "Failed to save changes. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  /**
   * handleDelete
   *
   * Shows a confirmation dialog before deleting to prevent accidental removals.
   * On confirm: calls PantryContext.deleteItem() which sends DELETE /pantry/:id
   * and removes the item from the local list on success.
   *
   * WHY two navigations (goBack twice)?
   *   After deletion, going back once returns to EditPantryItemScreen (which
   *   would now show "Item not found"). We need to go back twice to reach
   *   PantryScreen. Using navigation.pop(2) handles this cleanly.
   */
  const handleDelete = () => {
    Alert.alert(
      "Delete Item",
      `Remove "${item.ingredient_name}" from your pantry?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true)
            try {
              await deleteItem(itemId)
              // pop(2) removes both EditPantryItemScreen AND the screen below
              // it (PantryScreen would remain with one goBack, but EditPantryItem
              // would show "Item not found"). We want to land on PantryScreen,
              // which is two levels up the stack.
              navigation.pop(2)
            } catch {
              Alert.alert("Error", "Failed to delete item. Please try again.")
            } finally {
              setDeleting(false)
            }
          },
        },
      ]
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Icon name="arrow-left" size={24} color="#f8fafc" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Item</Text>
          {/* Spacer to keep title centered */}
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

            {/* Name */}
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
              {/* Quantity */}
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

              {/* Unit chips */}
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

            {/* Expiration date */}
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
                maxLength={10}
              />
            </View>

            {/* Save button */}
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={saving || deleting}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Icon name="check" size={18} color="#ffffff" />
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Delete section ── */}
          <View style={styles.dangerCard}>
            <Text style={styles.dangerLabel}>Danger Zone</Text>
            <TouchableOpacity
              style={[styles.deleteButton, deleting && styles.buttonDisabled]}
              onPress={handleDelete}
              disabled={saving || deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <>
                  <Icon name="trash-2" size={16} color="#ef4444" />
                  <Text style={styles.deleteButtonText}>Delete Item</Text>
                </>
              )}
            </TouchableOpacity>
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
  required: {
    color: "#ef4444",
  },
  optional: {
    color: "#475569",
    fontWeight: "400",
  },
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
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: "#f8fafc",
  },
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
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  quantityField: {
    width: 90,
  },
  unitField: {
    flex: 1,
  },
  chipScroll: {
    marginTop: 2,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    marginRight: 6,
    backgroundColor: "#0f1419",
  },
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
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0f1419",
  },
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
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 24,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },

  // ── Danger card (delete) ──────────────────────────────────────────────────

  dangerCard: {
    backgroundColor: "#1a1f2e",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    padding: 20,
  },
  dangerLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#ef4444",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "rgba(239, 68, 68, 0.05)",
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ef4444",
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // ── Not-found fallback ────────────────────────────────────────────────────

  notFound: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  notFoundText: {
    fontSize: 16,
    color: "#94a3b8",
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#1a1f2e",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#f8fafc",
  },
})
