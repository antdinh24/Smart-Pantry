"use client"

import { useState } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput } from "react-native"
import Icon from "react-native-vector-icons/Feather"
import { useNavigation } from "@react-navigation/native"

const pantryItems = [
  { id: 1, name: "Whole Milk", category: "Dairy", quantity: "1 gallon", expiry: "2 days", urgent: true },
  { id: 2, name: "Greek Yogurt", category: "Dairy", quantity: "3 cups", expiry: "3 days", urgent: true },
  { id: 3, name: "Cheddar Cheese", category: "Dairy", quantity: "8 oz", expiry: "2 weeks", urgent: false },
  { id: 4, name: "Chicken Breast", category: "Meat", quantity: "2 lbs", expiry: "4 days", urgent: false },
  { id: 5, name: "Romaine Lettuce", category: "Produce", quantity: "1 head", expiry: "1 day", urgent: true },
  { id: 6, name: "Tomatoes", category: "Produce", quantity: "6 units", expiry: "5 days", urgent: false },
  { id: 7, name: "Pasta", category: "Pantry", quantity: "1 lb", expiry: "6 months", urgent: false },
  { id: 8, name: "Olive Oil", category: "Pantry", quantity: "750 ml", expiry: "1 year", urgent: false },
]

export default function PantryScreen() {
  const navigation = useNavigation()
  const [searchQuery, setSearchQuery] = useState("")

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Icon name="arrow-left" size={20} color="#f8fafc" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Pantry</Text>
          <TouchableOpacity style={[styles.iconButton, styles.primaryButton]}>
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
            <Text style={styles.statsNumber}>47 items</Text>
            <Text style={styles.statsLabel}>Across 8 categories</Text>
          </View>
          <View style={styles.urgentBadge}>
            <Icon name="alert-circle" size={16} color="#ef4444" />
            <Text style={styles.urgentText}>3 expiring soon</Text>
          </View>
        </View>

        {/* Items List */}
        <View style={styles.itemsList}>
          {pantryItems.map((item) => (
            <View key={item.id} style={[styles.itemCard, item.urgent && styles.itemCardUrgent]}>
              <View style={styles.itemContent}>
                <View style={[styles.itemIcon, item.urgent && styles.itemIconUrgent]}>
                  <Icon name="package" size={24} color={item.urgent ? "#ef4444" : "#10b981"} />
                </View>
                <View style={styles.itemInfo}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.urgent && <Icon name="alert-circle" size={16} color="#ef4444" />}
                  </View>
                  <View style={styles.itemMeta}>
                    <Text style={styles.itemMetaText}>{item.category}</Text>
                    <Text style={styles.itemMetaText}>•</Text>
                    <Text style={styles.itemMetaText}>{item.quantity}</Text>
                  </View>
                </View>
                <View style={styles.itemExpiry}>
                  <Text style={[styles.expiryText, item.urgent && styles.expiryTextUrgent]}>{item.expiry}</Text>
                </View>
              </View>
            </View>
          ))}
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
})
