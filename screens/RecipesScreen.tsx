import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from "react-native"
import Icon from "react-native-vector-icons/Feather"
import { useNavigation } from "@react-navigation/native"
import { useRecipes } from "../hooks/useRecipes"

export default function RecipesScreen() {
  const navigation = useNavigation()
  const { getFilteredRecipes } = useRecipes()
  const recipes = getFilteredRecipes('match')

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Icon name="arrow-left" size={20} color="#f8fafc" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Recipes</Text>
          <View style={styles.iconButton} />
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* AI Generate Card */}
        <View style={styles.aiCard}>
          <View style={styles.aiHeader}>
            <View style={styles.aiIcon}>
              <Icon name="zap" size={24} color="#ffffff" />
            </View>
            <View>
              <Text style={styles.aiTitle}>Generate New Recipe</Text>
              <Text style={styles.aiSubtitle}>Based on your pantry items</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.aiButton}>
            <Icon name="zap" size={16} color="#10b981" />
            <Text style={styles.aiButtonText}>Create Recipe</Text>
          </TouchableOpacity>
        </View>

        {/* Suggested Recipes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Suggested for You</Text>
          <Text style={styles.sectionSubtitle}>Based on available ingredients</Text>
        </View>

        <View style={styles.recipesList}>
          {recipes.map((recipe) => (
            <View key={recipe.id} style={styles.recipeCard}>
              {/* Recipe Image Placeholder */}
              <View style={styles.recipeImage}>
                <Icon name="coffee" size={64} color="rgba(16, 185, 129, 0.3)" />
                <View style={styles.matchBadge}>
                  <Text style={styles.matchBadgeText}>{recipe.matchScore}% Match</Text>
                </View>
              </View>

              {/* Recipe Info */}
              <View style={styles.recipeInfo}>
                <Text style={styles.recipeName}>{recipe.name}</Text>
                <View style={styles.recipeMeta}>
                  <View style={styles.metaItem}>
                    <Icon name="clock" size={16} color="#94a3b8" />
                    <Text style={styles.metaText}>{recipe.time}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Icon name="users" size={16} color="#94a3b8" />
                    <Text style={styles.metaText}>{recipe.servings} servings</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Icon name="coffee" size={16} color="#94a3b8" />
                    <Text style={styles.metaText}>{recipe.ingredients} ingredients</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.viewButton}>
                  <Text style={styles.viewButtonText}>View Recipe</Text>
                </TouchableOpacity>
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
  scrollView: {
    flex: 1,
  },
  aiCard: {
    margin: 16,
    backgroundColor: "#10b981",
    borderRadius: 12,
    padding: 24,
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  aiIcon: {
    width: 48,
    height: 48,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  aiTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  aiSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
    marginTop: 2,
  },
  aiButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    paddingVertical: 12,
    borderRadius: 8,
  },
  aiButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#10b981",
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#f8fafc",
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    marginTop: 4,
  },
  recipesList: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 16,
  },
  recipeCard: {
    backgroundColor: "#1a1f2e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden",
    marginBottom: 16,
  },
  recipeImage: {
    height: 160,
    backgroundColor: "rgba(16, 185, 129, 0.05)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  matchBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "#10b981",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  matchBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },
  recipeInfo: {
    padding: 16,
  },
  recipeName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#f8fafc",
    marginBottom: 12,
  },
  recipeMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 14,
    color: "#94a3b8",
  },
  viewButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  viewButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f8fafc",
  },
})
