/**
 * PantryScreen.tsx
 *
 * Displays the user's pantry inventory with:
 *   - Checkbox selection on each item for bulk operations
 *   - Tap card → select / deselect item
 *   - Select-all icon button above the list (toggle selects / deselects all)
 *   - Long-press card → navigate directly to EditPantryItem
 *   - When items are selected: bottom action bar with "Match Recipes" and "Delete" buttons
 *   - Search bar with inline + (add) and filter buttons
 *   - DEV-only Seed button to populate test data
 */

import { useState } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput, ActivityIndicator, Alert } from "react-native"
import Icon from "react-native-vector-icons/Feather"
import { useNavigation } from "@react-navigation/native"
import { usePantry } from "../hooks/usePantry"
import { formatExpiry, formatQuantity } from "../utils/calculations"
import { APIService } from "../services/api"

/**
 * Test items used by the dev "Seed" button.
 * Covers multiple categories so recipe generation has variety to work with.
 */
const DEV_TEST_ITEMS = [
  { ingredient_name: "Eggs", quantity: 12, unit: "count", category: "dairy" },
  { ingredient_name: "Whole Milk", quantity: 1, unit: "litre", category: "dairy" },
  { ingredient_name: "Butter", quantity: 200, unit: "grams", category: "dairy" },
  { ingredient_name: "Chicken Breast", quantity: 500, unit: "grams", category: "meat" },
  { ingredient_name: "Garlic", quantity: 6, unit: "cloves", category: "produce" },
  { ingredient_name: "All-Purpose Flour", quantity: 500, unit: "grams", category: "pantry" },
  { ingredient_name: "Olive Oil", quantity: 500, unit: "ml", category: "pantry" },
  { ingredient_name: "Tomatoes", quantity: 4, unit: "count", category: "produce" },
]

export default function PantryScreen() {
  const navigation = useNavigation()
  const [searchQuery, setSearchQuery] = useState("")
  const [seeding, setSeeding] = useState(false)
  /** Set of item IDs the user has ticked — drives the bulk action bar */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { stats, loading, error, getFilteredItems, deleteItem, refreshItems } = usePantry()

  const filteredItems = getFilteredItems(undefined, searchQuery)
  const hasSelection = selectedIds.size > 0
  const allSelected = filteredItems.length > 0 && selectedIds.size === filteredItems.length

  // ── Selection helpers ────────────────────────────────────────────────────

  /**
   * toggleSelection
   * Adds the item to the selection set if it's not there, removes it if it is.
   */
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  /**
   * toggleSelectAll
   * If every visible item is already selected, clears the selection.
   * Otherwise selects all visible items in one tap.
   */
  const toggleSelectAll = () => {
    if (allSelected) {
      clearSelection()
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)))
    }
  }

  // ── Bulk actions ─────────────────────────────────────────────────────────

  /**
   * handleDeleteSelected
   * Confirms then deletes every selected item in parallel.
   */
  const handleDeleteSelected = () => {
    const count = selectedIds.size
    Alert.alert(
      "Delete Items",
      `Remove ${count} item${count === 1 ? "" : "s"} from your pantry?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          onPress: async () => {
            try {
              await Promise.all([...selectedIds].map(id => deleteItem(id)))
              clearSelection()
            } catch {
              Alert.alert("Error", "Failed to delete some items. Please try again.")
            }
          },
        },
      ]
    )
  }

  /**
   * handleMatchRecipes
   * Navigates to the Recipes screen, which shows suggestions ranked by how
   * many pantry ingredients each recipe uses.
   */
  const handleMatchRecipes = () => {
    clearSelection()
    navigation.navigate("Recipes" as never)
  }

  // ── Individual item actions ───────────────────────────────────────────────

  /**
   * handleSeedTestData — DEV ONLY
   * Seeds 8 common items so recipe generation can be tested without manual entry.
   */
  const handleSeedTestData = async () => {
    setSeeding(true)
    try {
      await Promise.all(DEV_TEST_ITEMS.map(item => APIService.addPantryItem(item)))
      await refreshItems()
      Alert.alert("Test Data Loaded", `Added ${DEV_TEST_ITEMS.length} items to your pantry.`)
    } catch {
      Alert.alert("Seed Failed", "Could not add test items. Check that you are logged in and the backend is reachable.")
    } finally {
      setSeeding(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Icon name="arrow-left" size={20} color="#f8fafc" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Pantry</Text>
          {__DEV__ && (
            <TouchableOpacity
              style={styles.seedButton}
              onPress={handleSeedTestData}
              disabled={seeding}
            >
              {seeding
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.seedButtonText}>Seed</Text>
              }
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Search + Add + Filter ── */}
      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Icon name="search" size={16} color="#94a3b8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate("AddIngredients" as never)}
        >
          <Icon name="plus" size={18} color="#ffffff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterButton}>
          <Icon name="filter" size={16} color="#f8fafc" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        // Extra bottom padding so the last card isn't hidden behind the action bar
        contentContainerStyle={hasSelection ? { paddingBottom: 80 } : undefined}
      >
        {/* Stats row */}
        <View style={styles.statsContainer}>
          <View>
            <Text style={styles.statsNumber}>{stats.totalItems} {stats.totalItems === 1 ? "item" : "items"}</Text>
            <Text style={styles.statsLabel}>Across {stats.categoriesCount} {stats.categoriesCount === 1 ? "category" : "categories"}</Text>
          </View>
          {stats.expiringSoonCount > 0 && (
            <View style={styles.urgentBadge}>
              <Icon name="alert-circle" size={16} color="#ef4444" />
              <Text style={styles.urgentText}>{stats.expiringSoonCount} expiring soon</Text>
            </View>
          )}
        </View>

        {/* Items list */}
        <View style={styles.itemsList}>
          {loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color="#10b981" />
              <Text style={styles.emptyText}>Loading pantry...</Text>
            </View>
          ) : error ? (
            <View style={styles.emptyState}>
              <Icon name="alert-circle" size={48} color="#ef4444" />
              <Text style={styles.emptyText}>{error}</Text>
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="package" size={48} color="#94a3b8" />
              <Text style={styles.emptyText}>No items found</Text>
            </View>
          ) : (
            <>
              {/* Select-all toggle — icon-only row above the first item.
                  check-square = all selected, square = not all selected */}
              <TouchableOpacity
                style={styles.selectAllRow}
                onPress={toggleSelectAll}
                accessibilityLabel={allSelected ? "Deselect all" : "Select all"}
                testID="select-all-btn"
              >
                <Icon
                  name={allSelected ? "check-square" : "square"}
                  size={18}
                  color={allSelected ? "#10b981" : "#64748b"}
                />
              </TouchableOpacity>

              {filteredItems.map((item) => {
                const selected = selectedIds.has(item.id)
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.itemCard,
                      item.urgent && styles.itemCardUrgent,
                      selected && styles.itemCardSelected,
                    ]}
                    onPress={() => toggleSelection(item.id)}
                    onLongPress={() => navigation.navigate("EditPantryItem" as never, { itemId: item.id } as never)}
                    delayLongPress={400}
                    activeOpacity={0.85}
                  >
                    <View style={styles.itemContent}>
                      {/* Checkbox — tapping the card toggles this */}
                      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                        {selected && <Icon name="check" size={13} color="#ffffff" />}
                      </View>

                      <View style={[styles.itemIcon, item.urgent && styles.itemIconUrgent]}>
                        <Icon name="package" size={24} color={item.urgent ? "#ef4444" : "#10b981"} />
                      </View>

                      <View style={styles.itemInfo}>
                        <View style={styles.itemHeader}>
                          <Text style={styles.itemName}>{item.ingredient_name}</Text>
                          {item.urgent && <Icon name="alert-circle" size={16} color="#ef4444" />}
                        </View>
                        <View style={styles.itemMeta}>
                          <Text style={styles.itemMetaText}>{item.category ?? "Uncategorized"}</Text>
                          <Text style={styles.itemMetaText}>•</Text>
                          <Text style={styles.itemMetaText}>{formatQuantity(item.quantity, item.unit)}</Text>
                        </View>
                      </View>

                      <View style={styles.itemExpiry}>
                        <Text style={[styles.expiryText, item.urgent && styles.expiryTextUrgent]}>
                          {formatExpiry(item.expiration_date)}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </>
          )}
        </View>
      </ScrollView>

      {/* ── Bulk action bar — visible only when items are selected ── */}
      {hasSelection && (
        <View style={styles.actionBar}>
          <Text style={styles.actionBarCount}>{selectedIds.size} selected</Text>

          <TouchableOpacity style={styles.actionBarBtn} onPress={handleMatchRecipes}>
            <Icon name="book-open" size={16} color="#f8fafc" />
            <Text style={styles.actionBarBtnText}>Match Recipes</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBarBtn, styles.actionBarBtnDanger]} onPress={handleDeleteSelected}>
            <Icon name="trash-2" size={16} color="#ffffff" />
            <Text style={styles.actionBarBtnText}>Delete</Text>
          </TouchableOpacity>

          {/* Dismiss selection without taking action */}
          <TouchableOpacity onPress={clearSelection} style={styles.actionBarDismiss}>
            <Icon name="x" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f1419",
  },

  // ── Header ──
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
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  seedButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#7c3aed",
    borderRadius: 6,
    minWidth: 48,
    alignItems: "center",
  },
  seedButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },

  // ── Search row ──
  searchContainer: {
    backgroundColor: "#1a1f2e",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  searchWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f1419",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 14,
    color: "#f8fafc",
  },
  addButton: {
    width: 40,
    height: 40,
    backgroundColor: "#10b981",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  filterButton: {
    width: 40,
    height: 40,
    backgroundColor: "#0f1419",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── List ──
  scrollView: {
    flex: 1,
  },
  statsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  statsNumber: {
    fontSize: 24,
    fontWeight: "700",
    color: "#f8fafc",
  },
  statsLabel: {
    fontSize: 14,
    color: "#94a3b8",
    marginTop: 4,
  },
  urgentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  urgentText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ef4444",
  },
  itemsList: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },

  // ── Select-all row ──
  selectAllRow: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
    alignSelf: "flex-start",
  },

  // ── Item card ──
  itemCard: {
    backgroundColor: "#1a1f2e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 16,
    marginBottom: 12,
  },
  itemCardUrgent: {
    borderColor: "rgba(239, 68, 68, 0.3)",
    backgroundColor: "rgba(239, 68, 68, 0.05)",
  },
  itemCardSelected: {
    borderColor: "#10b981",
    backgroundColor: "rgba(16, 185, 129, 0.06)",
  },
  itemContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  // ── Checkbox ──
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: "#10b981",
    borderColor: "#10b981",
  },

  // ── Item content ──
  itemIcon: {
    width: 44,
    height: 44,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  itemIconUrgent: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  itemInfo: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f8fafc",
  },
  itemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemMetaText: {
    fontSize: 14,
    color: "#94a3b8",
  },
  itemExpiry: {
    alignItems: "flex-end",
  },
  expiryText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#94a3b8",
  },
  expiryTextUrgent: {
    color: "#ef4444",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: "#94a3b8",
    marginTop: 16,
  },

  // ── Bulk action bar ──
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#1a1f2e",
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
  actionBarCount: {
    color: "#f8fafc",
    fontWeight: "600",
    fontSize: 14,
    marginRight: 4,
  },
  actionBarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0f1419",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#334155",
  },
  actionBarBtnDanger: {
    backgroundColor: "#ef4444",
    borderColor: "#ef4444",
  },
  actionBarBtnText: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "600",
  },
  actionBarDismiss: {
    marginLeft: "auto",
    padding: 4,
  },
})
