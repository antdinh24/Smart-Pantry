import { useState } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput, ActivityIndicator, Alert } from "react-native"
import Icon from "react-native-vector-icons/Feather"
import { useNavigation } from "@react-navigation/native"
import { usePantry } from "../hooks/usePantry"
import { formatExpiry, formatQuantity } from "../utils/calculations"

export default function PantryScreen() {
  const navigation = useNavigation()
  const [searchQuery, setSearchQuery] = useState("")
  const { stats, loading, error, getFilteredItems, deleteItem } = usePantry()

  /**
   * handleItemLongPress
   *
   * Called when the user holds down on a pantry item card.
   * Shows an action sheet with Edit and Delete options.
   *
   * WHY long-press instead of swipe-to-delete?
   *   Swipe-to-delete requires react-native-gesture-handler's Swipeable component
   *   and extra gesture config. Long-press + Alert achieves the same outcome with
   *   no additional dependencies — simpler to maintain.
   *
   * @param itemId   - UUID of the item that was long-pressed
   * @param itemName - Display name shown in the confirmation dialogs
   */
  const handleItemLongPress = (itemId: string, itemName: string) => {
    Alert.alert(itemName, "What would you like to do?", [
      {
        text: "Edit",
        onPress: () => navigation.navigate("EditPantryItem" as never, { itemId } as never),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => confirmDelete(itemId, itemName),
      },
      { text: "Cancel", style: "cancel" },
    ])
  }

  /**
   * confirmDelete
   *
   * Shows a second Alert to confirm deletion before making the API call.
   * A two-step confirmation prevents accidental deletions from a misfire.
   *
   * @param itemId   - UUID of the item to delete
   * @param itemName - Name shown in the confirmation message
   */
  const confirmDelete = (itemId: string, itemName: string) => {
    Alert.alert(
      "Delete Item",
      `Remove "${itemName}" from your pantry? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteItem(itemId)
            } catch {
              Alert.alert("Error", "Failed to delete item. Please try again.")
            }
          },
        },
      ]
    )
  }

  const filteredItems = getFilteredItems(undefined, searchQuery)

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Icon name="arrow-left" size={20} color="#f8fafc" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Pantry</Text>
          <TouchableOpacity 
            style={[styles.iconButton, styles.primaryButton]}
            onPress={() => navigation.navigate("AddIngredients" as never)}
          >
            <Icon name="plus" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search and Filter */}
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
        <TouchableOpacity style={styles.filterButton}>
          <Icon name="filter" size={16} color="#f8fafc" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Stats */}
        <View style={styles.statsContainer}>
          <View>
            <Text style={styles.statsNumber}>{stats.totalItems} {stats.totalItems === 1 ? 'item' : 'items'}</Text>
            <Text style={styles.statsLabel}>Across {stats.categoriesCount} {stats.categoriesCount === 1 ? 'category' : 'categories'}</Text>
          </View>
          {stats.expiringSoonCount > 0 && (
            <View style={styles.urgentBadge}>
              <Icon name="alert-circle" size={16} color="#ef4444" />
              <Text style={styles.urgentText}>{stats.expiringSoonCount} expiring soon</Text>
            </View>
          )}
        </View>

        {/* Items List */}
        <View style={styles.itemsList}>
          {/* Loading state — shown while the initial API fetch is in progress */}
          {loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color="#10b981" />
              <Text style={styles.emptyText}>Loading pantry...</Text>
            </View>
          ) : error ? (
            /* Error state — shown if the API call failed */
            <View style={styles.emptyState}>
              <Icon name="alert-circle" size={48} color="#ef4444" />
              <Text style={styles.emptyText}>{error}</Text>
            </View>
          ) : filteredItems.length === 0 ? (
            /* Empty state — no items or no search results */
            <View style={styles.emptyState}>
              <Icon name="package" size={48} color="#94a3b8" />
              <Text style={styles.emptyText}>No items found</Text>
            </View>
          ) : (
            filteredItems.map((item) => (
              /*
               * TouchableOpacity instead of View so the card responds to long-press.
               * activeOpacity=1 keeps the card from dimming on a regular tap (there's
               * no tap action — only long-press triggers the action menu).
               */
              <TouchableOpacity
                key={item.id}
                style={[styles.itemCard, item.urgent && styles.itemCardUrgent]}
                onLongPress={() => handleItemLongPress(item.id, item.ingredient_name)}
                delayLongPress={400}
                activeOpacity={0.85}
              >
                <View style={styles.itemContent}>
                  <View style={[styles.itemIcon, item.urgent && styles.itemIconUrgent]}>
                    <Icon name="package" size={24} color={item.urgent ? "#ef4444" : "#10b981"} />
                  </View>
                  <View style={styles.itemInfo}>
                    <View style={styles.itemHeader}>
                      {/* ingredient_name replaces the old "name" field */}
                      <Text style={styles.itemName}>{item.ingredient_name}</Text>
                      {item.urgent && <Icon name="alert-circle" size={16} color="#ef4444" />}
                    </View>
                    <View style={styles.itemMeta}>
                      <Text style={styles.itemMetaText}>{item.category ?? 'Uncategorized'}</Text>
                      <Text style={styles.itemMetaText}>•</Text>
                      {/* formatQuantity combines the numeric quantity + unit into "1.5 gallon" */}
                      <Text style={styles.itemMetaText}>{formatQuantity(item.quantity, item.unit)}</Text>
                    </View>
                  </View>
                  <View style={styles.itemExpiry}>
                    {/* formatExpiry converts ISO date to "2 days", "Today", "No expiry", etc. */}
                    <Text style={[styles.expiryText, item.urgent && styles.expiryTextUrgent]}>
                      {formatExpiry(item.expiration_date)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

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
  primaryButton: {
    backgroundColor: "#10b981",
    borderRadius: 8,
  },
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
    gap: 12,
  },
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
  itemContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  itemIcon: {
    width: 48,
    height: 48,
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
})
