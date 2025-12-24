import { useState } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput } from "react-native"
import Icon from "react-native-vector-icons/Feather"
import { useNavigation } from "@react-navigation/native"
import { useGrocery } from "../hooks/useGrocery"

export default function GroceryScreen() {
  const navigation = useNavigation()
  const { items, stats, toggleItem, addItem, clearCompleted } = useGrocery()
  const [showAddForm, setShowAddForm] = useState(false)
  const [newItemName, setNewItemName] = useState("")
  const [newItemQuantity, setNewItemQuantity] = useState("")
  const [newItemPrice, setNewItemPrice] = useState("")

  const handleAddItem = () => {
    if (newItemName.trim()) {
      addItem({
        name: newItemName.trim(),
        quantity: newItemQuantity.trim() || "1",
        price: parseFloat(newItemPrice) || 0,
        checked: false,
      })
      setNewItemName("")
      setNewItemQuantity("")
      setNewItemPrice("")
      setShowAddForm(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Icon name="arrow-left" size={20} color="#f8fafc" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Grocery List</Text>
          <TouchableOpacity style={styles.iconButton} onPress={() => setShowAddForm(!showAddForm)}>
            <Icon name={showAddForm ? "x" : "plus"} size={20} color="#f8fafc" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Budget Summary */}
        <View style={styles.budgetCard}>
          <View style={styles.budgetContent}>
            <View>
              <Text style={styles.budgetLabel}>Estimated Total</Text>
              <Text style={styles.budgetAmount}>${stats.totalPrice.toFixed(2)}</Text>
            </View>
            <View style={styles.budgetIcon}>
              <Icon name="dollar-sign" size={32} color="#ffffff" />
            </View>
          </View>
          <View style={styles.budgetFooter}>
            <Text style={styles.budgetFooterText}>{stats.remainingCount} {stats.remainingCount === 1 ? 'item' : 'items'} remaining</Text>
            <Text style={styles.budgetFooterText}>{stats.checkedCount} completed</Text>
          </View>
        </View>

        {/* Monthly Average Card */}
        <View style={styles.averageCard}>
          <View style={styles.averageIcon}>
            <Icon name="trending-up" size={24} color="#10b981" />
          </View>
          <View style={styles.averageContent}>
            <Text style={styles.averageLabel}>Monthly Average</Text>
            <Text style={styles.averageAmount}>${stats.monthlyAverage.toFixed(2)}</Text>
          </View>
          <View style={styles.averageComparison}>
            <Text style={styles.comparisonLabel}>This trip</Text>
            <Text
              style={[
                styles.comparisonAmount,
                stats.totalPrice > stats.monthlyAverage ? styles.comparisonOver : styles.comparisonUnder,
              ]}
            >
              {stats.totalPrice > stats.monthlyAverage ? "+" : ""}${Math.abs(stats.totalPrice - stats.monthlyAverage).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Add Item Form */}
        {showAddForm && (
          <View style={styles.addForm}>
            <Text style={styles.addFormTitle}>Add Item</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Item name" 
              placeholderTextColor="#94a3b8"
              value={newItemName}
              onChangeText={setNewItemName}
            />
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, styles.inputHalf]}
                placeholder="Quantity"
                placeholderTextColor="#94a3b8"
                value={newItemQuantity}
                onChangeText={setNewItemQuantity}
              />
              <TextInput
                style={[styles.input, styles.inputHalf]}
                placeholder="Price"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={newItemPrice}
                onChangeText={setNewItemPrice}
              />
            </View>
            <TouchableOpacity style={styles.addButton} onPress={handleAddItem}>
              <Text style={styles.addButtonText}>Add to List</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Shopping List Header */}
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Shopping List</Text>
          {stats.checkedCount > 0 && (
            <TouchableOpacity onPress={clearCompleted}>
              <Text style={styles.clearText}>Clear completed</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Items List */}
        <View style={styles.itemsList}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.itemCard, item.checked && styles.itemCardChecked]}
              onPress={() => toggleItem(item.id)}
              activeOpacity={0.7}
            >
              <View style={styles.checkbox}>{item.checked && <Icon name="check" size={16} color="#10b981" />}</View>
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>{item.name}</Text>
                <Text style={styles.itemQuantity}>{item.quantity}</Text>
              </View>
              <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
            </TouchableOpacity>
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
  scrollView: {
    flex: 1,
  },
  budgetCard: {
    margin: 16,
    backgroundColor: "#10b981",
    borderRadius: 12,
    padding: 16,
  },
  budgetContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  budgetLabel: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
  },
  budgetAmount: {
    fontSize: 32,
    fontWeight: "700",
    color: "#ffffff",
    marginTop: 4,
  },
  budgetIcon: {
    width: 64,
    height: 64,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  budgetFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  budgetFooterText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
  },
  averageCard: {
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: "rgba(16, 185, 129, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.2)",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  averageIcon: {
    width: 48,
    height: 48,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  averageContent: {
    flex: 1,
  },
  averageLabel: {
    fontSize: 14,
    color: "#94a3b8",
  },
  averageAmount: {
    fontSize: 24,
    fontWeight: "700",
    color: "#f8fafc",
    marginTop: 2,
  },
  averageComparison: {
    alignItems: "flex-end",
  },
  comparisonLabel: {
    fontSize: 12,
    color: "#94a3b8",
  },
  comparisonAmount: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
  },
  comparisonOver: {
    color: "#ef4444",
  },
  comparisonUnder: {
    color: "#10b981",
  },
  addForm: {
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: "#1a1f2e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 16,
  },
  addFormTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f8fafc",
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#0f1419",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: "#f8fafc",
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
  },
  inputHalf: {
    flex: 1,
  },
  addButton: {
    backgroundColor: "#10b981",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#f8fafc",
  },
  clearText: {
    fontSize: 14,
    color: "#94a3b8",
  },
  itemsList: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 8,
  },
  itemCard: {
    backgroundColor: "#1a1f2e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  itemCardChecked: {
    backgroundColor: "rgba(51, 65, 85, 0.3)",
    opacity: 0.6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: "#10b981",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f8fafc",
  },
  itemNameChecked: {
    textDecorationLine: "line-through",
  },
  itemQuantity: {
    fontSize: 14,
    color: "#94a3b8",
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 18,
    fontWeight: "600",
    color: "#f8fafc",
    fontFamily: "monospace",
  },
})
