/**
 * ReceiptConfirmScreen.tsx
 *
 * PURPOSE:
 *   Shows the list of items extracted from a scanned receipt and lets the user
 *   review them before adding to their pantry. This is the second step of the
 *   receipt scanning flow:
 *
 *     ScanScreen (photo capture)
 *       → backend GPT-4o processes image
 *       → ReceiptConfirmScreen (this file — review & confirm)
 *       → PantryScreen (items appear here after confirm)
 *
 * WHAT THE USER SEES:
 *   - A header with merchant name, total, and item count
 *   - A scrollable checklist — one row per line item from the receipt
 *   - Each row: checkbox, item name, category pill, price
 *   - A "Select All / Deselect All" toggle at the top of the list
 *   - An "Add X Items to Pantry" button that's disabled when 0 items are selected
 *
 * HOW CONFIRM WORKS:
 *   Tapping "Add to Pantry" calls POST /receipts/confirm on the backend, which:
 *     1. Marks the receipt as processed in the database
 *     2. Adds the selected line items to the user's backend pantry
 *   Then we call refreshItems() on PantryContext to pull the new items into
 *   the local state, and navigate back to PantryScreen.
 *
 * WHY refreshItems() instead of addItem() per item?
 *   The backend's /receipts/confirm endpoint adds all items in a single
 *   transaction. Calling addItem() N times from the frontend would make N
 *   API calls and could partially fail. One confirm call + one refresh is
 *   more reliable and faster.
 *
 * PARAMS (from navigation):
 *   receiptId — UUID of the pending Receipt record in the database
 *   items     — ParsedReceiptItem[] from the scan, all pre-selected
 *   merchant  — Store name (e.g. "Walmart") or null if not detected
 *   total     — Receipt total in dollars (e.g. 47.23)
 */

import { useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import Icon from "react-native-vector-icons/Feather"
import { RootStackParamList } from "../types/navigation"
import { ParsedReceiptItem } from "../types"
import { APIService } from "../services/api"
import { usePantry } from "../contexts/PantryContext"

/** Navigation type — we can pop back or go to Pantry from here */
type ConfirmNav = NativeStackNavigationProp<RootStackParamList, "ReceiptConfirm">

/** Route type — TypeScript knows the shape of our navigation params */
type ConfirmRoute = RouteProp<RootStackParamList, "ReceiptConfirm">

/**
 * CATEGORY_COLORS
 *
 * Maps category strings from the backend to a background/text color pair
 * used for the category pill on each row. "pantry" is the fallback when
 * the backend couldn't detect a specific category.
 */
const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  produce: { bg: "rgba(16, 185, 129, 0.15)", text: "#10b981" },
  dairy: { bg: "rgba(59, 130, 246, 0.15)", text: "#60a5fa" },
  meat: { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171" },
  bakery: { bg: "rgba(245, 158, 11, 0.15)", text: "#fbbf24" },
  frozen: { bg: "rgba(99, 102, 241, 0.15)", text: "#a78bfa" },
  beverages: { bg: "rgba(6, 182, 212, 0.15)", text: "#22d3ee" },
  snacks: { bg: "rgba(251, 146, 60, 0.15)", text: "#fb923c" },
  pantry: { bg: "rgba(148, 163, 184, 0.15)", text: "#94a3b8" },
}

/** Returns the color pair for a given category, defaulting to the "pantry" gray. */
const getCategoryColor = (category: string) =>
  CATEGORY_COLORS[category?.toLowerCase()] ?? CATEGORY_COLORS.pantry

export default function ReceiptConfirmScreen() {
  const navigation = useNavigation<ConfirmNav>()
  const route = useRoute<ConfirmRoute>()
  const { refreshItems } = usePantry()

  /** Destructure navigation params passed from ScanScreen */
  const { receiptId, items: initialItems, merchant, total } = route.params

  /**
   * Local copy of the items list with mutable `selected` flags.
   * We initialize from route.params (all items pre-selected = true).
   * The user can toggle individual items or use "Select All / Deselect All".
   *
   * WHY local state instead of mutating route.params?
   *   route.params is read-only. We need to manage checkbox state locally.
   */
  const [items, setItems] = useState<ParsedReceiptItem[]>(initialItems)

  /** True while the POST /receipts/confirm + refreshItems() calls are in flight */
  const [confirming, setConfirming] = useState(false)

  /** Count of currently selected items — used to drive the button label */
  const selectedCount = items.filter((item) => item.selected).length

  /** True when ALL items are currently checked */
  const allSelected = selectedCount === items.length

  // ─────────────────────────────────────────────────────────────────────────
  // INTERACTION HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * toggleItem
   *
   * Flips the `selected` flag for a single item by its index.
   * We use the index rather than a field like `item.item` (name) because
   * the same product could appear twice on a receipt (e.g. two bags of chips).
   *
   * @param index - Position of the item in the `items` array
   */
  const toggleItem = (index: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, selected: !item.selected } : item
      )
    )
  }

  /**
   * toggleAll
   *
   * If all items are currently selected → deselect all.
   * If any item is unselected → select all.
   *
   * This mirrors the common behavior in email clients and to-do apps
   * where "select all" checks everything, and checking again unchecks all.
   */
  const toggleAll = () => {
    const newSelected = !allSelected
    setItems((prev) => prev.map((item) => ({ ...item, selected: newSelected })))
  }

  /**
   * handleConfirm
   *
   * Sends the user-confirmed item selection to the backend and then
   * syncs the local pantry state.
   *
   * FLOW:
   *   1. Filter to selected items only (respects user's unchecks)
   *   2. POST /receipts/confirm — backend adds items to pantry + marks receipt done
   *   3. PantryContext.refreshItems() — pulls the new items into local state
   *   4. Navigate to Pantry so the user can see their new items
   *
   * ERROR HANDLING:
   *   If the API call fails, show an alert with a retry option.
   *   We do NOT navigate away on failure — the user can try again or go back.
   */
  const handleConfirm = async () => {
    if (selectedCount === 0) return

    setConfirming(true)

    try {
      // Only send items the user has checked — strip the `selected` field
      // since it's frontend-only and the backend doesn't expect it
      const selectedItems = items
        .filter((item) => item.selected)
        .map(({ selected, ...rest }) => rest)

      // Backend marks receipt as processed and adds items to pantry in one transaction
      await APIService.confirmReceipt(receiptId, selectedItems)

      // Re-fetch pantry from backend so the new items appear in PantryContext
      await refreshItems()

      // Go to Pantry — navigate replaces this screen so the user can't go back to confirm
      navigation.navigate("Pantry")
    } catch (error: any) {
      Alert.alert(
        "Failed to Add Items",
        "Something went wrong while adding your items. Please try again.",
        [{ text: "OK" }]
      )
    } finally {
      setConfirming(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.iconButton}
          >
            <Icon name="arrow-left" size={20} color="#f8fafc" />
          </TouchableOpacity>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle}>
              {merchant ?? "Receipt Items"}
            </Text>
            {merchant && (
              <Text style={styles.headerSubtitle}>Receipt Scan</Text>
            )}
          </View>
          {/* Total amount badge */}
          {total > 0 && (
            <View style={styles.totalBadge}>
              <Text style={styles.totalBadgeText}>${total.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* Summary row: item count + select all toggle */}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            {items.length} item{items.length !== 1 ? "s" : ""} found •{" "}
            <Text style={styles.summaryHighlight}>{selectedCount} selected</Text>
          </Text>
          <TouchableOpacity onPress={toggleAll}>
            <Text style={styles.toggleAllText}>
              {allSelected ? "Deselect All" : "Select All"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Item list ── */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item, index) => {
          const colorPair = getCategoryColor(item.category)
          return (
            <TouchableOpacity
              key={index}
              style={[styles.itemRow, item.selected && styles.itemRowSelected]}
              onPress={() => toggleItem(index)}
              activeOpacity={0.7}
            >
              {/* Checkbox — green check when selected, empty circle when not */}
              <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
                {item.selected && (
                  <Icon name="check" size={12} color="#ffffff" />
                )}
              </View>

              {/* Item details */}
              <View style={styles.itemDetails}>
                <Text
                  style={[styles.itemName, !item.selected && styles.itemNameDeselected]}
                  numberOfLines={2}
                >
                  {item.item}
                </Text>

                <View style={styles.itemMeta}>
                  {/* Category pill */}
                  <View style={[styles.categoryPill, { backgroundColor: colorPair.bg }]}>
                    <Text style={[styles.categoryPillText, { color: colorPair.text }]}>
                      {item.category}
                    </Text>
                  </View>

                  {/* Quantity if > 1 */}
                  {item.quantity > 1 && (
                    <Text style={styles.quantityText}>×{item.quantity}</Text>
                  )}
                </View>
              </View>

              {/* Price on the right */}
              <Text style={[styles.itemPrice, !item.selected && styles.itemPriceDeselected]}>
                ${item.price.toFixed(2)}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* ── Confirm button ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.confirmButton,
            (selectedCount === 0 || confirming) && styles.confirmButtonDisabled,
          ]}
          onPress={handleConfirm}
          disabled={selectedCount === 0 || confirming}
        >
          {confirming ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Icon name="plus" size={20} color="#ffffff" />
              <Text style={styles.confirmButtonText}>
                {selectedCount === 0
                  ? "No Items Selected"
                  : `Add ${selectedCount} Item${selectedCount !== 1 ? "s" : ""} to Pantry`}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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

  // ── Header ───────────────────────────────────────────────────────────────

  header: {
    backgroundColor: "#1a1f2e",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleBlock: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#f8fafc",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#94a3b8",
    marginTop: 2,
  },

  /** Green pill showing the receipt total */
  totalBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  totalBadgeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#10b981",
  },

  /** Row with "X items found" and "Select All / Deselect All" */
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryText: {
    fontSize: 13,
    color: "#94a3b8",
  },
  summaryHighlight: {
    color: "#f8fafc",
    fontWeight: "600",
  },
  toggleAllText: {
    fontSize: 13,
    color: "#10b981",
    fontWeight: "500",
  },

  // ── Item list ─────────────────────────────────────────────────────────────

  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 8,
  },

  /** Base card for each item row */
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1f2e",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 14,
    gap: 12,
  },

  /** Highlighted border when the item is checked */
  itemRowSelected: {
    borderColor: "rgba(16, 185, 129, 0.4)",
  },

  /** Empty checkbox circle */
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  /** Filled green checkbox when selected */
  checkboxSelected: {
    backgroundColor: "#10b981",
    borderColor: "#10b981",
  },

  /** Item name + category pill, takes up remaining space */
  itemDetails: {
    flex: 1,
    gap: 6,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#f8fafc",
    lineHeight: 20,
  },

  /** Dimmed when item is deselected */
  itemNameDeselected: {
    color: "#475569",
  },

  itemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  /** Rounded pill showing the category name */
  categoryPill: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  categoryPillText: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "capitalize",
  },

  quantityText: {
    fontSize: 12,
    color: "#94a3b8",
  },

  /** Price shown at the far right of the row */
  itemPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: "#f8fafc",
    flexShrink: 0,
  },
  itemPriceDeselected: {
    color: "#475569",
  },

  // ── Footer ────────────────────────────────────────────────────────────────

  footer: {
    padding: 16,
    backgroundColor: "#1a1f2e",
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },

  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 16,
    borderRadius: 10,
  },

  confirmButtonDisabled: {
    backgroundColor: "#334155",
  },

  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
})
