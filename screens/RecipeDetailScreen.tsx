/**
 * RecipeDetailScreen.tsx
 *
 * PURPOSE:
 *   Shows the full detail of a single recipe — ingredients, step-by-step
 *   instructions, timings, difficulty, match percentage, and nutrition.
 *
 * WHY THIS SCREEN FETCHES ITS OWN DATA (Option B):
 *   We deliberately do NOT pass the full Recipe object as a navigation param.
 *   Instead, RecipesScreen passes only `recipeId` (+ `title` for the header)
 *   and THIS screen calls GET /api/v1/recipes/:id on mount.
 *
 *   Reason: when we add offline support (Phase 2), there will be ONE place to
 *   add the SQLite cache layer — this screen — rather than having to update
 *   both RecipesScreen and any other screen that could navigate here.
 *   See spec.md §20 for the full offline-support plan.
 *
 * STATES:
 *   Loading  — spinner shown while the fetch is in progress
 *   Error    — shown if the API call fails, with a "Try Again" button
 *   Loaded   — full recipe detail rendered in a scroll view
 *
 * NAVIGATION:
 *   - Receives params: { recipeId: string, title: string }
 *   - title is rendered in the header immediately (before fetch completes)
 *     so the user always sees a label rather than a blank header bar
 *   - Back button returns to RecipesScreen
 */

import { useState, useEffect, useCallback } from "react"
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
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { RootStackParamList } from "../types/navigation"
import { RecipeDetail } from "../types"
import APIService from "../services/api"

// ─── Navigation types ────────────────────────────────────────────────────────

/** Typed navigation so TypeScript knows which screens we can navigate to */
type Nav = NativeStackNavigationProp<RootStackParamList, "RecipeDetail">

/** Typed route so TypeScript enforces the expected params for this screen */
type Route = RouteProp<RootStackParamList, "RecipeDetail">

// ─── Colour constants ─────────────────────────────────────────────────────────
// Centralised here so edits only need to happen in one place.

/** Green accent used for match %, badges, and section headings */
const COLOR_GREEN = "#10b981"
/** Amber used for medium difficulty */
const COLOR_AMBER = "#f59e0b"
/** Red used for hard difficulty */
const COLOR_RED = "#ef4444"
/** Muted text — labels, metadata, secondary info */
const COLOR_MUTED = "#94a3b8"
/** Card background */
const COLOR_CARD = "#1a1f2e"
/** Screen background */
const COLOR_BG = "#0f1419"
/** Divider / border colour */
const COLOR_BORDER = "#334155"
/** Primary text */
const COLOR_TEXT = "#f1f5f9"

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * difficultyColor
 *
 * Returns a colour string for the difficulty badge.
 * Easy → green, medium → amber, hard → red, unknown → muted.
 *
 * @param difficulty - "easy" | "medium" | "hard" | null
 */
function difficultyColor(difficulty: string | null): string {
  switch (difficulty?.toLowerCase()) {
    case "easy":   return COLOR_GREEN
    case "medium": return COLOR_AMBER
    case "hard":   return COLOR_RED
    default:       return COLOR_MUTED
  }
}

/**
 * formatTime
 *
 * Converts a raw minutes number into a human-readable string.
 * Returns "—" when the value is null (backend didn't know the time).
 *
 * Examples:
 *   30  → "30 min"
 *   90  → "1 hr 30 min"
 *   null → "—"
 *
 * @param minutes - Total minutes (prep or cook), or null
 */
function formatTime(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return "—"
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

/**
 * matchColor
 *
 * Returns a colour for the pantry-match percentage badge.
 *   ≥ 80% → green (you can basically make this right now)
 *   ≥ 50% → amber (you'd need a few things)
 *   < 50% → red (missing a lot)
 *
 * @param pct - Match percentage 0–100
 */
function matchColor(pct: number): string {
  if (pct >= 80) return COLOR_GREEN
  if (pct >= 50) return COLOR_AMBER
  return COLOR_RED
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RecipeDetailScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()

  /**
   * recipeId  — UUID passed from RecipesScreen; used in the GET /recipes/:id call.
   * title     — also passed from RecipesScreen so we can render the header label
   *             immediately, before the fetch completes.
   */
  const { recipeId, title } = route.params

  // ── State ────────────────────────────────────────────────────────────────

  /** The full recipe fetched from the backend. Null until load completes. */
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null)

  /** True while GET /recipes/:id is in flight */
  const [loading, setLoading] = useState(true)

  /** Human-readable error message, or null if no error */
  const [error, setError] = useState<string | null>(null)

  // ── Data fetching ─────────────────────────────────────────────────────────

  /**
   * loadRecipe
   *
   * Calls GET /api/v1/recipes/:id and stores the result in state.
   * Wrapped in useCallback so it can safely be passed as the "Try Again"
   * button handler without creating a new function reference on every render.
   *
   * Side effects:
   *   - Sets loading = true at the start (shows spinner)
   *   - Sets loading = false when done (whether success or error)
   *   - Sets error on failure
   *   - Sets recipe on success
   */
  const loadRecipe = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data: RecipeDetail = await APIService.getRecipe(recipeId)
      setRecipe(data)
    } catch (err: any) {
      // Show a friendly message — the full technical error goes to the console
      console.error("RecipeDetailScreen: failed to load recipe", err)
      const message =
        err?.response?.status === 404
          ? "This recipe could not be found."
          : "Failed to load recipe. Please check your connection and try again."
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [recipeId])

  // Fetch the recipe once when the screen first mounts
  useEffect(() => {
    loadRecipe()
  }, [loadRecipe])

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {/* Header with back button — always visible so the user isn't trapped */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="arrow-left" size={22} color={COLOR_TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {/* Spacer keeps the title centred */}
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.centred}>
          <ActivityIndicator size="large" color={COLOR_GREEN} />
          <Text style={styles.centredText}>Loading recipe…</Text>
        </View>
      </SafeAreaView>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (error || !recipe) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="arrow-left" size={22} color={COLOR_TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.centred}>
          <Icon name="alert-circle" size={48} color={COLOR_AMBER} />
          <Text style={styles.errorText}>{error ?? "Something went wrong."}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadRecipe}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── Loaded state ───────────────────────────────────────────────────────────

  /**
   * ingredient_list comes from the backend as an array of arbitrary dicts.
   * We expect each dict to have at minimum a `name` key. `quantity` and `unit`
   * may also be present. We fall back gracefully if they're missing.
   */
  const ingredients: Array<{ name: string; quantity?: any; unit?: any }> =
    Array.isArray(recipe.ingredient_list) ? recipe.ingredient_list : []

  /**
   * instructions is an array of dicts — each expected to have a `step` (number)
   * and `text` (string). They should arrive already sorted, but we sort by step
   * anyway as a safety net.
   */
  const steps: Array<{ step: number; text: string }> = Array.isArray(recipe.instructions)
    ? [...recipe.instructions].sort((a, b) => (a.step ?? 0) - (b.step ?? 0))
    : []

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-left" size={22} color={COLOR_TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{recipe.title}</Text>
        {/* Spacer keeps the title visually centred */}
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero section: title + description ── */}
        <View style={styles.hero}>
          <Text style={styles.recipeTitle}>{recipe.title}</Text>
          {recipe.description && (
            <Text style={styles.recipeDescription}>{recipe.description}</Text>
          )}
        </View>

        {/* ── Badge row: match %, difficulty, cuisine ── */}
        <View style={styles.badgeRow}>

          {/* Match percentage badge — shows how much of the recipe the user has */}
          <View style={[styles.badge, { borderColor: matchColor(recipe.match_percentage) }]}>
            <Icon name="check-circle" size={13} color={matchColor(recipe.match_percentage)} />
            <Text style={[styles.badgeText, { color: matchColor(recipe.match_percentage) }]}>
              {recipe.match_percentage}% match
            </Text>
          </View>

          {/* Difficulty badge — only shown when the backend provided a value */}
          {recipe.difficulty && (
            <View style={[styles.badge, { borderColor: difficultyColor(recipe.difficulty) }]}>
              <Icon name="bar-chart-2" size={13} color={difficultyColor(recipe.difficulty)} />
              <Text style={[styles.badgeText, { color: difficultyColor(recipe.difficulty) }]}>
                {recipe.difficulty}
              </Text>
            </View>
          )}

          {/* Cuisine badge */}
          {recipe.cuisine_type && (
            <View style={[styles.badge, { borderColor: COLOR_MUTED }]}>
              <Icon name="globe" size={13} color={COLOR_MUTED} />
              <Text style={[styles.badgeText, { color: COLOR_MUTED }]}>
                {recipe.cuisine_type}
              </Text>
            </View>
          )}
        </View>

        {/* ── Timing row: prep time + cook time + servings ── */}
        <View style={styles.timingRow}>
          <View style={styles.timingItem}>
            <Icon name="clock" size={16} color={COLOR_MUTED} />
            <View>
              <Text style={styles.timingLabel}>Prep</Text>
              <Text style={styles.timingValue}>{formatTime(recipe.prep_time_minutes)}</Text>
            </View>
          </View>

          <View style={styles.timingDivider} />

          <View style={styles.timingItem}>
            <Icon name="thermometer" size={16} color={COLOR_MUTED} />
            <View>
              <Text style={styles.timingLabel}>Cook</Text>
              <Text style={styles.timingValue}>{formatTime(recipe.cook_time_minutes)}</Text>
            </View>
          </View>

          <View style={styles.timingDivider} />

          <View style={styles.timingItem}>
            <Icon name="users" size={16} color={COLOR_MUTED} />
            <View>
              <Text style={styles.timingLabel}>Servings</Text>
              <Text style={styles.timingValue}>{recipe.servings ?? "—"}</Text>
            </View>
          </View>
        </View>

        {/* ── Ingredients ── */}
        {ingredients.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            {ingredients.map((ing, idx) => (
              <View key={idx} style={styles.ingredientRow}>
                {/* Green bullet */}
                <View style={styles.bullet} />
                <Text style={styles.ingredientText}>
                  {/* quantity + unit first (e.g. "2 cups"), then the name */}
                  {ing.quantity != null ? `${ing.quantity} ` : ""}
                  {ing.unit ? `${ing.unit} ` : ""}
                  {ing.name ?? "Unknown ingredient"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Instructions ── */}
        {steps.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            {steps.map((step, idx) => (
              <View key={idx} style={styles.stepRow}>
                {/* Step number circle */}
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{step.step ?? idx + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step.text}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Nutritional info — only shown when the backend provided it ── */}
        {recipe.nutritional_info && Object.keys(recipe.nutritional_info).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Nutrition (per serving)</Text>
            <View style={styles.nutritionGrid}>
              {Object.entries(recipe.nutritional_info).map(([key, val]) => (
                <View key={key} style={styles.nutritionItem}>
                  {/* Capitalise the key for display, e.g. "calories" → "Calories" */}
                  <Text style={styles.nutritionLabel}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </Text>
                  <Text style={styles.nutritionValue}>{String(val)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── AI-generated disclaimer ── */}
        {recipe.is_ai_generated && (
          <View style={styles.aiNote}>
            <Icon name="cpu" size={14} color={COLOR_MUTED} />
            <Text style={styles.aiNoteText}>AI-generated recipe · results may vary</Text>
          </View>
        )}

        {/* Bottom padding so the last section isn't clipped by the home bar */}
        <View style={{ height: 40 }} />
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
    backgroundColor: COLOR_BG,
  },

  // ── Header ──────────────────────────────────────────────────────────────

  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLOR_CARD,
    borderBottomWidth: 1,
    borderBottomColor: COLOR_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: COLOR_TEXT,
    textAlign: "center",
  },
  /**
   * Same width as the back button so the title is visually centred.
   * Without this, the back button on the left would push the title off-centre.
   */
  headerSpacer: {
    width: 30,
  },

  // ── Loading / error centre layout ────────────────────────────────────────

  centred: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 16,
  },
  centredText: {
    color: COLOR_MUTED,
    fontSize: 15,
  },
  errorText: {
    color: COLOR_TEXT,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: COLOR_GREEN,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },

  // ── Scroll / hero ─────────────────────────────────────────────────────────

  scroll: {
    flex: 1,
  },
  hero: {
    padding: 20,
    paddingBottom: 12,
  },
  recipeTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: COLOR_TEXT,
    marginBottom: 8,
  },
  recipeDescription: {
    fontSize: 15,
    color: COLOR_MUTED,
    lineHeight: 22,
  },

  // ── Badge row ─────────────────────────────────────────────────────────────

  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: COLOR_CARD,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "500",
  },

  // ── Timing row ────────────────────────────────────────────────────────────

  timingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLOR_CARD,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLOR_BORDER,
    padding: 16,
  },
  timingItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timingLabel: {
    fontSize: 12,
    color: COLOR_MUTED,
  },
  timingValue: {
    fontSize: 14,
    fontWeight: "600",
    color: COLOR_TEXT,
  },
  timingDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLOR_BORDER,
    marginHorizontal: 8,
  },

  // ── Section (ingredients / instructions / nutrition) ─────────────────────

  section: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLOR_GREEN,
    marginBottom: 12,
    letterSpacing: 0.3,
  },

  // ── Ingredients ───────────────────────────────────────────────────────────

  ingredientRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLOR_BORDER,
  },
  /** Small green filled circle bullet */
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLOR_GREEN,
    marginTop: 6,
  },
  ingredientText: {
    flex: 1,
    fontSize: 15,
    color: COLOR_TEXT,
    lineHeight: 22,
  },

  // ── Instructions ──────────────────────────────────────────────────────────

  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  /** Numbered circle for each instruction step */
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLOR_GREEN,
    justifyContent: "center",
    alignItems: "center",
    // Keep the number circle aligned with the first line of text
    marginTop: 1,
  },
  stepNumberText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    color: COLOR_TEXT,
    lineHeight: 23,
  },

  // ── Nutritional info grid ─────────────────────────────────────────────────

  nutritionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  nutritionItem: {
    backgroundColor: COLOR_CARD,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLOR_BORDER,
    padding: 10,
    minWidth: 80,
    alignItems: "center",
  },
  nutritionLabel: {
    fontSize: 11,
    color: COLOR_MUTED,
    marginBottom: 4,
  },
  nutritionValue: {
    fontSize: 14,
    fontWeight: "600",
    color: COLOR_TEXT,
  },

  // ── AI disclaimer ──────────────────────────────────────────────────────────

  aiNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  aiNoteText: {
    fontSize: 12,
    color: COLOR_MUTED,
    fontStyle: "italic",
  },
})
