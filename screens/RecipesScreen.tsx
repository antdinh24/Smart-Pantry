/**
 * RecipesScreen.tsx
 *
 * PURPOSE:
 *   Shows AI-powered recipe suggestions ranked by how well they match the user's
 *   current pantry. Also lets the user generate a brand-new recipe using their
 *   pantry ingredients.
 *
 * HOW IT WORKS:
 *   - Recipe suggestions come from RecipesContext, which fetches them from
 *     GET /api/v1/recipes/suggestions on app start.
 *   - The "Create Recipe" button calls RecipesContext.generateRecipe() with the
 *     names of items currently in the user's pantry (from PantryContext).
 *   - The backend checks its cache first — if a similar recipe was previously
 *     generated, it returns instantly for free. Otherwise it calls OpenAI.
 *
 * STATES:
 *   Loading   — shown while the initial suggestions fetch is in progress
 *   Error     — shown if the fetch failed (network down, server error, etc.)
 *   Empty     — shown if no suggestions exist yet (pantry is likely empty)
 *   Normal    — shows the recipe cards
 *   Generating — "Create Recipe" button shows a spinner while AI call is in flight
 *
 * DATA DEPENDENCIES:
 *   usePantry()  — to get the list of pantry ingredient names for generation
 *   useRecipes() — to get suggestions and trigger generation
 */

import { useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from "react-native"
import Icon from "react-native-vector-icons/Feather"
import { useNavigation } from "@react-navigation/native"
import { useRecipes } from "../hooks/useRecipes"
import { usePantry } from "../hooks/usePantry"

export default function RecipesScreen() {
  const navigation = useNavigation()

  /**
   * useRecipes — provides the recipe suggestion list and the generateRecipe action.
   * generating is true while a POST /recipes/generate call is in flight.
   */
  const { loading, error, generating, generateRecipe, getFilteredRecipes } = useRecipes()

  /**
   * usePantry — we need the pantry to extract ingredient names for generation.
   * The generate endpoint requires at least one ingredient, so we also check
   * whether the pantry is empty before allowing generation.
   */
  const { items: pantryItems } = usePantry()

  /**
   * sortBy — controls which ordering the recipe list uses.
   * Default is "match" (highest pantry match percentage first), which is the
   * most immediately useful view for the user.
   */
  const [sortBy, setSortBy] = useState<'match' | 'time' | 'name'>('match')

  const recipes = getFilteredRecipes(sortBy)

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * formatTotalTime
   *
   * Combines prep_time_minutes and cook_time_minutes into a human-readable
   * string. The backend sometimes returns null for one or both values.
   *
   * Examples:
   *   prep=10, cook=20 → "30 min"
   *   prep=null, cook=45 → "45 min"
   *   prep=null, cook=null → "? min"
   *
   * @param prep - Prep time in minutes, or null
   * @param cook - Cook time in minutes, or null
   */
  const formatTotalTime = (prep: number | null, cook: number | null): string => {
    const total = (prep ?? 0) + (cook ?? 0)
    return total > 0 ? `${total} min` : "? min"
  }

  /**
   * handleGenerate
   *
   * Called when the user taps "Create Recipe".
   *
   * Extracts ingredient names from the pantry, then asks the backend to
   * generate (or return a cached) recipe. The generated recipe is automatically
   * prepended to the suggestions list by RecipesContext — the user sees it
   * immediately at the top without any extra action.
   *
   * Guards:
   *   - Pantry must not be empty (backend requires ≥1 ingredient)
   *   - Only one generation can run at a time (generating flag)
   */
  const handleGenerate = async () => {
    // Guard: can't generate a recipe from nothing
    if (pantryItems.length === 0) {
      Alert.alert(
        "Empty Pantry",
        "Add some items to your pantry first, then come back to generate a recipe."
      )
      return
    }

    // Extract just the ingredient names — the backend doesn't need quantities or units
    const ingredientNames = pantryItems.map(item => item.ingredient_name)

    try {
      await generateRecipe(ingredientNames)
      // The context prepends the new recipe to the list automatically.
      // We switch the sort to "match" so the user sees their new recipe near the top.
      setSortBy('match')
    } catch {
      Alert.alert("Generation Failed", "Could not generate a recipe. Please try again.")
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Icon name="arrow-left" size={20} color="#f8fafc" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Recipes</Text>
          {/* Empty spacer keeps title visually centered */}
          <View style={styles.iconButton} />
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>

        {/* ── AI Generate Card ── */}
        <View style={styles.aiCard}>
          <View style={styles.aiHeader}>
            <View style={styles.aiIcon}>
              <Icon name="zap" size={24} color="#ffffff" />
            </View>
            <View style={styles.aiTextBlock}>
              <Text style={styles.aiTitle}>Generate New Recipe</Text>
              <Text style={styles.aiSubtitle}>
                {pantryItems.length > 0
                  ? `Using your ${pantryItems.length} pantry ${pantryItems.length === 1 ? 'item' : 'items'}`
                  : "Add pantry items first"}
              </Text>
            </View>
          </View>

          {/*
           * The button is disabled while:
           *   - generating is true (a call is already in flight)
           *   - the pantry is empty (nothing to generate from)
           */}
          <TouchableOpacity
            style={[
              styles.aiButton,
              (generating || pantryItems.length === 0) && styles.aiButtonDisabled,
            ]}
            onPress={handleGenerate}
            disabled={generating || pantryItems.length === 0}
          >
            {generating ? (
              <ActivityIndicator size="small" color="#10b981" />
            ) : (
              <Icon name="zap" size={16} color="#10b981" />
            )}
            <Text style={styles.aiButtonText}>
              {generating ? "Generating…" : "Create Recipe"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Section header + sort chips ── */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Suggested for You</Text>
            <Text style={styles.sectionSubtitle}>Sorted by pantry match</Text>
          </View>

          {/*
           * Sort chip row — lets the user reorder the list by match %, time, or name.
           * Only shown when there are recipes to sort.
           */}
          {recipes.length > 0 && (
            <View style={styles.sortRow}>
              {(["match", "time", "name"] as const).map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.sortChip, sortBy === mode && styles.sortChipActive]}
                  onPress={() => setSortBy(mode)}
                >
                  <Text style={[styles.sortChipText, sortBy === mode && styles.sortChipTextActive]}>
                    {mode === "match" ? "Match" : mode === "time" ? "Time" : "Name"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── Recipe list ── */}
        <View style={styles.recipesList}>

          {/* Loading state */}
          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color="#10b981" />
              <Text style={styles.centerStateText}>Loading recipes…</Text>
            </View>

          ) : error ? (
            /* Error state */
            <View style={styles.centerState}>
              <Icon name="alert-circle" size={48} color="#ef4444" />
              <Text style={styles.centerStateText}>{error}</Text>
            </View>

          ) : recipes.length === 0 ? (
            /* Empty state — no suggestions yet */
            <View style={styles.centerState}>
              <Icon name="coffee" size={48} color="#94a3b8" />
              <Text style={styles.centerStateText}>No recipes yet</Text>
              <Text style={styles.centerStateSubtext}>
                Add items to your pantry, then tap "Create Recipe" above.
              </Text>
            </View>

          ) : (
            recipes.map((recipe) => (
              <View key={recipe.id} style={styles.recipeCard}>

                {/* Image placeholder — no image in the API response yet */}
                <View style={styles.recipeImage}>
                  <Icon name="coffee" size={64} color="rgba(16, 185, 129, 0.3)" />

                  {/* Match badge — e.g. "87% Match" */}
                  <View style={styles.matchBadge}>
                    <Text style={styles.matchBadgeText}>
                      {Math.round(recipe.match_percentage)}% Match
                    </Text>
                  </View>

                  {/* Difficulty badge (only shown if provided) */}
                  {recipe.difficulty && (
                    <View style={styles.difficultyBadge}>
                      <Text style={styles.difficultyBadgeText}>{recipe.difficulty}</Text>
                    </View>
                  )}
                </View>

                {/* Card body */}
                <View style={styles.recipeInfo}>
                  {/* Title */}
                  <Text style={styles.recipeName}>{recipe.title}</Text>

                  {/* Description (only shown if the backend provided one) */}
                  {recipe.description && (
                    <Text style={styles.recipeDescription} numberOfLines={2}>
                      {recipe.description}
                    </Text>
                  )}

                  {/* Meta row: time + cuisine */}
                  <View style={styles.recipeMeta}>
                    <View style={styles.metaItem}>
                      <Icon name="clock" size={14} color="#94a3b8" />
                      <Text style={styles.metaText}>
                        {formatTotalTime(recipe.prep_time_minutes, recipe.cook_time_minutes)}
                      </Text>
                    </View>

                    {recipe.cuisine_type && (
                      <View style={styles.metaItem}>
                        <Icon name="globe" size={14} color="#94a3b8" />
                        <Text style={styles.metaText}>{recipe.cuisine_type}</Text>
                      </View>
                    )}
                  </View>

                  {/*
                   * "View Recipe" — navigates to RecipeDetailScreen.
                   * We pass recipeId (not the full recipe object) so RecipeDetailScreen
                   * fetches fresh data from GET /recipes/:id on mount.
                   * title is passed separately so the header renders immediately
                   * without waiting for the fetch.
                   */}
                  <TouchableOpacity
                    style={styles.viewButton}
                    onPress={() =>
                      navigation.navigate("RecipeDetail", {
                        recipeId: recipe.id,
                        title: recipe.title,
                      })
                    }
                  >
                    <Text style={styles.viewButtonText}>View Recipe</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
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

  // ── AI Card ───────────────────────────────────────────────────────────────

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
  aiTextBlock: {
    flex: 1,
  },
  aiTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  aiSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.85)",
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
  /** Dimmed when pantry is empty or generation is in progress */
  aiButtonDisabled: {
    opacity: 0.6,
  },
  aiButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#10b981",
  },

  // ── Section header + sort chips ───────────────────────────────────────────

  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
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
  sortRow: {
    flexDirection: "row",
    gap: 8,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0f1419",
  },
  sortChipActive: {
    borderColor: "#10b981",
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  sortChipText: {
    fontSize: 13,
    color: "#94a3b8",
  },
  sortChipTextActive: {
    color: "#10b981",
    fontWeight: "600",
  },

  // ── Recipe cards ──────────────────────────────────────────────────────────

  recipesList: {
    paddingHorizontal: 16,
    paddingBottom: 24,
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
    height: 140,
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  matchBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },
  difficultyBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  difficultyBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#f8fafc",
    textTransform: "capitalize",
  },
  recipeInfo: {
    padding: 16,
  },
  recipeName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#f8fafc",
    marginBottom: 6,
  },
  recipeDescription: {
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 20,
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
    fontSize: 13,
    color: "#94a3b8",
  },
  viewButton: {
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  viewButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#f8fafc",
  },

  // ── Center state (loading / error / empty) ────────────────────────────────

  centerState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  centerStateText: {
    fontSize: 16,
    color: "#94a3b8",
    textAlign: "center",
  },
  centerStateSubtext: {
    fontSize: 14,
    color: "#475569",
    textAlign: "center",
    paddingHorizontal: 32,
    lineHeight: 20,
  },
})
