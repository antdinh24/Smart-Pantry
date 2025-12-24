import { useState } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from "react-native"
import Icon from "react-native-vector-icons/Feather"
import { useNavigation } from "@react-navigation/native"
import { usePantry } from "../hooks/usePantry"

export default function AddIngredientsScreen() {
  const navigation = useNavigation()
  const { items } = usePantry()
  const [selectedItems, setSelectedItems] = useState<number[]>([])

  const toggleSelection = (id: number) => {
    setSelectedItems(prev => 
      prev.includes(id) 
        ? prev.filter(itemId => itemId !== id)
        : [...prev, id]
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-left" size={24} color="#f8fafc" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Ingredients</Text>
        <TouchableOpacity 
          style={styles.doneButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.infoCard}>
          <Icon name="info" size={20} color="#10b981" />
          <Text style={styles.infoText}>Select ingredients from your pantry to add to your meal schedule</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available in Pantry</Text>

          {items.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="package" size={48} color="#94a3b8" />
              <Text style={styles.emptyText}>No items in pantry</Text>
            </View>
          ) : (
            items.map((item) => {
              const isSelected = selectedItems.includes(item.id)
              return (
                <TouchableOpacity 
                  key={item.id} 
                  style={styles.ingredientCard} 
                  activeOpacity={0.7}
                  onPress={() => toggleSelection(item.id)}
                >
                  <View style={styles.ingredientInfo}>
                    <View style={styles.checkbox}>
                      {isSelected ? (
                        <Icon name="check-square" size={20} color="#10b981" />
                      ) : (
                        <Icon name="square" size={20} color="#334155" />
                      )}
                    </View>
                    <View style={styles.ingredientDetails}>
                      <Text style={styles.ingredientName}>{item.name}</Text>
                      <View style={styles.ingredientMeta}>
                        <Text style={styles.ingredientAmount}>{item.quantity}</Text>
                        <View style={styles.dot} />
                        <Text style={styles.ingredientCategory}>{item.category}</Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              )
            })
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#1a1f2e",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#f8fafc",
  },
  doneButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#10b981",
    borderRadius: 8,
  },
  doneButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  scrollView: {
    flex: 1,
  },
  infoCard: {
    margin: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    borderRadius: 12,
    padding: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 20,
  },
  section: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f8fafc",
    marginBottom: 16,
  },
  ingredientCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1a1f2e",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  ingredientInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  ingredientDetails: {
    flex: 1,
  },
  ingredientName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#f8fafc",
    marginBottom: 4,
  },
  ingredientMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ingredientAmount: {
    fontSize: 14,
    color: "#94a3b8",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#94a3b8",
  },
  ingredientCategory: {
    fontSize: 14,
    color: "#94a3b8",
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
