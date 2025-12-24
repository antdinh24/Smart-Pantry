import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from "react-native"
import Icon from "react-native-vector-icons/Feather"
import { useNavigation } from "@react-navigation/native"
import { usePantry } from "../hooks/usePantry"

export default function HomeScreen() {
  const navigation = useNavigation()
  const { stats } = usePantry()
  
  const expiringItemsNames = stats.expiringItems.slice(0, 3).map(item => item.name).join(", ")

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.logoContainer}>
            <View style={styles.logo}>
              <Icon name="package" size={24} color="#ffffff" />
            </View>
            <Text style={styles.logoText}>Smart Pantry</Text>
          </View>
          <TouchableOpacity style={styles.iconButton}>
            <Icon name="award" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate("Pantry")}
              activeOpacity={0.7}
            >
              <View style={styles.actionIcon}>
                <Icon name="package" size={24} color="#10b981" />
              </View>
              <Text style={styles.actionTitle}>My Pantry</Text>
              <Text style={styles.actionSubtitle}>View all items</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate("Schedule")}
              activeOpacity={0.7}
            >
              <View style={styles.actionIcon}>
                <Icon name="calendar" size={24} color="#10b981" />
              </View>
              <Text style={styles.actionTitle}>Schedule</Text>
              <Text style={styles.actionSubtitle}>Plan meals</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate("Recipes")}
              activeOpacity={0.7}
            >
              <View style={styles.actionIcon}>
                <Icon name="coffee" size={24} color="#10b981" />
              </View>
              <Text style={styles.actionTitle}>Recipes</Text>
              <Text style={styles.actionSubtitle}>Generate ideas</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate("Grocery")}
              activeOpacity={0.7}
            >
              <View style={styles.actionIcon}>
                <Icon name="shopping-cart" size={24} color="#10b981" />
              </View>
              <Text style={styles.actionTitle}>Grocery List</Text>
              <Text style={styles.actionSubtitle}>Plan shopping</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Expiring Soon Alert */}
        {stats.expiringSoonCount > 0 && (
          <View style={styles.alertCard}>
            <View style={styles.alertIcon}>
              <Icon name="package" size={20} color="#ef4444" />
            </View>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>{stats.expiringSoonCount} {stats.expiringSoonCount === 1 ? 'item' : 'items'} expiring soon</Text>
              <Text style={styles.alertSubtitle}>{expiringItemsNames || 'No items'}</Text>
            </View>
          </View>
        )}

        {/* Receipt Scanner CTA */}
        <View style={styles.ctaCard}>
          <Icon name="file-text" size={48} color="#ffffff" />
          <View style={styles.ctaContent}>
            <Text style={styles.ctaTitle}>Scan Your Receipt</Text>
            <Text style={styles.ctaSubtitle}>Automatically add items to your pantry</Text>
          </View>
          <TouchableOpacity 
            style={styles.ctaButton}
            onPress={() => navigation.navigate("Scan" as never)}
          >
            <Text style={styles.ctaButtonText}>Scan</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem}>
          <Icon name="package" size={20} color="#10b981" />
          <Text style={[styles.navText, styles.navTextActive]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate("Schedule")}>
          <Icon name="calendar" size={20} color="#94a3b8" />
          <Text style={styles.navText}>Schedule</Text>
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
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logo: {
    width: 40,
    height: 40,
    backgroundColor: "#10b981",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 20,
    fontWeight: "700",
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
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#f8fafc",
    marginBottom: 16,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  actionCard: {
    width: "47%",
    backgroundColor: "#1a1f2e",
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: "#334155",
  },
  actionIcon: {
    width: 48,
    height: 48,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f8fafc",
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 14,
    color: "#94a3b8",
  },
  alertCard: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: "rgba(239, 68, 68, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  alertIcon: {
    width: 40,
    height: 40,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f8fafc",
    marginBottom: 4,
  },
  alertSubtitle: {
    fontSize: 14,
    color: "#94a3b8",
  },
  ctaCard: {
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 24,
    backgroundColor: "#10b981",
    borderRadius: 12,
    padding: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  ctaContent: {
    flex: 1,
  },
  ctaTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
  },
  ctaSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
  },
  ctaButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  ctaButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
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
