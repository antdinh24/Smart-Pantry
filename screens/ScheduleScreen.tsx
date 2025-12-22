import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from "react-native"
import Icon from "react-native-vector-icons/Feather"
import { useNavigation } from "@react-navigation/native"

export default function ScheduleScreen() {
  const navigation = useNavigation()

  const daysOfWeek = [
    { day: "Monday", date: "Jan 20" },
    { day: "Tuesday", date: "Jan 21" },
    { day: "Wednesday", date: "Jan 22" },
    { day: "Thursday", date: "Jan 23" },
    { day: "Friday", date: "Jan 24" },
    { day: "Saturday", date: "Jan 25" },
    { day: "Sunday", date: "Jan 26" },
  ]

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-left" size={24} color="#f8fafc" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meal Schedule</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Add Ingredients CTA */}
        <TouchableOpacity
          style={styles.addIngredientsButton}
          onPress={() => navigation.navigate("AddIngredients")}
          activeOpacity={0.7}
        >
          <Icon name="plus-circle" size={24} color="#ffffff" />
          <Text style={styles.addIngredientsText}>Add Ingredients from Pantry</Text>
        </TouchableOpacity>

        {/* Days of Week */}
        {daysOfWeek.map((item, index) => (
          <View key={index} style={styles.dayCard}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayName}>{item.day}</Text>
              <Text style={styles.dayDate}>{item.date}</Text>
            </View>

            <View style={styles.mealsContainer}>
              <Text style={styles.mealsLabel}>Meals</Text>
              <View style={styles.mealButtons}>
                <TouchableOpacity style={styles.mealButton} activeOpacity={0.7}>
                  <Icon name="plus" size={16} color="#10b981" />
                  <Text style={styles.mealButtonText}>Add Meal 1</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mealButton} activeOpacity={0.7}>
                  <Icon name="plus" size={16} color="#10b981" />
                  <Text style={styles.mealButtonText}>Add Meal 2</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mealButton} activeOpacity={0.7}>
                  <Icon name="plus" size={16} color="#10b981" />
                  <Text style={styles.mealButtonText}>Add Meal 3</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate("Home")}>
          <Icon name="package" size={20} color="#94a3b8" />
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Icon name="calendar" size={20} color="#10b981" />
          <Text style={[styles.navText, styles.navTextActive]}>Schedule</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate("Recipes")}>
          <Icon name="coffee" size={20} color="#94a3b8" />
          <Text style={styles.navText}>Recipes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate("Grocery")}>
          <Icon name="shopping-cart" size={20} color="#94a3b8" />
          <Text style={styles.navText}>List</Text>
        </TouchableOpacity>
      </View>
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
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  addIngredientsButton: {
    margin: 16,
    backgroundColor: "#10b981",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  addIngredientsText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  dayCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#1a1f2e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 16,
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  dayName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#f8fafc",
  },
  dayDate: {
    fontSize: 14,
    color: "#94a3b8",
  },
  mealsContainer: {
    gap: 12,
  },
  mealsLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#94a3b8",
    marginBottom: 4,
  },
  mealButtons: {
    gap: 8,
  },
  mealButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderStyle: "dashed",
  },
  mealButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#10b981",
  },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#1a1f2e",
    borderTopWidth: 1,
    borderTopColor: "#334155",
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: "space-around",
  },
  navItem: {
    alignItems: "center",
    gap: 4,
  },
  navText: {
    fontSize: 12,
    color: "#94a3b8",
  },
  navTextActive: {
    color: "#10b981",
  },
})
