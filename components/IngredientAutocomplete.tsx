/**
 * IngredientAutocomplete.tsx
 *
 * PURPOSE:
 *   A controlled TextInput with a real-time ingredient suggestion list.
 *   Drop-in replacement for the plain ingredient name TextInput in
 *   AddIngredientsScreen and EditPantryItemScreen.
 *
 * HOW IT WORKS:
 *   1. User types in the input.
 *   2. After 300ms of no typing (debounce), a state update fires that commits
 *      the search query (`searchQuery` state).
 *   3. A useEffect reacts to `searchQuery` changes and calls
 *      GET /api/v1/ingredients/search.
 *   4. Up to 5 matching ingredients appear in a list directly below the input.
 *   5. Tapping a suggestion:
 *        - Fills the input (calls onChangeText with the ingredient name)
 *        - Calls onSelect so the parent can auto-fill related fields (e.g. category)
 *        - Fires POST /api/v1/ingredients/{id}/select (fire-and-forget) to
 *          increment the popularity counter so frequent picks rank higher.
 *
 * WHY two-phase debounce (setTimeout → state, then useEffect → API call)?
 *   The original design called an async function directly inside the setTimeout
 *   callback. React's test `act()` utility can flush useEffect hooks and their
 *   resulting Promises, but it cannot track async work that starts from inside a
 *   raw setTimeout callback. By having the timer only commit a state update
 *   (`setSearchQuery`), the API call moves into a useEffect where `act()` CAN
 *   flush the entire async chain — making tests deterministic without needing
 *   real-time 300ms waits.
 *
 * WHY inline suggestions (not an overlay)?
 *   React Native's ScrollView does not clip child views the way a web browser
 *   does, but getting z-index right inside a ScrollView can be fragile across
 *   Android and iOS. Rendering suggestions inline (pushing content down) is
 *   simpler and always works correctly.
 *
 * PROPS:
 *   value          — controlled input value (same semantics as TextInput.value)
 *   onChangeText   — called on every keystroke; parent must update value
 *   onSelect       — called when the user taps a suggestion; receives the full
 *                    IngredientSearchResult so the parent can auto-fill category
 *   placeholder    — forwarded to the inner TextInput (optional)
 */

import { useState, useRef, useEffect } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native"
import Icon from "react-native-vector-icons/Feather"
import { APIService, IngredientSearchResult } from "../services/api"

interface Props {
  /** Controlled value — parent must keep this in sync via onChangeText */
  value: string
  /** Called on every keystroke, same as TextInput.onChangeText */
  onChangeText: (text: string) => void
  /**
   * Called when the user taps a suggestion.
   * Receives the full search result so the parent can auto-fill category etc.
   */
  onSelect: (result: IngredientSearchResult) => void
  /** Placeholder forwarded to the inner TextInput */
  placeholder?: string
}

export default function IngredientAutocomplete({
  value,
  onChangeText,
  onSelect,
  placeholder,
}: Props) {
  /** Suggestion list — hidden when empty */
  const [suggestions, setSuggestions] = useState<IngredientSearchResult[]>([])

  /** True while the search request is in flight */
  const [loading, setLoading] = useState(false)

  /**
   * The committed search query. The debounce timer only updates this state;
   * the actual API call lives in the useEffect below, which React's act() can
   * properly flush during tests.
   */
  const [searchQuery, setSearchQuery] = useState("")

  /**
   * Ref for the pending debounce timer.
   * Using a ref (not state) so clearing the timer does not cause a re-render.
   */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Clears the debounce timer when the component unmounts */
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  /**
   * Reacts to committed search query changes.
   *
   * Living in a useEffect means React's act() utility can flush the entire
   * async chain (API call → state update) in one step during tests.
   *
   * The `cancelled` flag prevents stale setState calls when a newer search
   * starts before this one completes, or when the component unmounts.
   */
  useEffect(() => {
    if (!searchQuery) {
      // Query was cleared — reset loading so a stale spinner doesn't linger
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    APIService.searchIngredients(searchQuery, 10)
      .then((results) => {
        if (!cancelled) setSuggestions(results.slice(0, 5))
      })
      .catch(() => {
        if (!cancelled) setSuggestions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    // If searchQuery changes again before this resolves, mark the in-flight
    // request as cancelled so its setState calls are skipped.
    return () => {
      cancelled = true
    }
  }, [searchQuery])

  /**
   * handleTextChange
   *
   * Called on every keystroke:
   *   1. Notifies the parent so it can update the controlled value.
   *   2. Clears any pending debounce timer.
   *   3. If text is < 2 chars, clears suggestions and resets search immediately.
   *   4. Otherwise, starts a new 300ms debounce that will commit the query
   *      to `searchQuery` state, which triggers the useEffect above.
   *
   * @param text - The current input string after this keystroke.
   */
  const handleTextChange = (text: string) => {
    onChangeText(text)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (text.length < 2) {
      setSearchQuery("")
      setSuggestions([])
      return
    }

    // Only a synchronous state update inside the timer callback — no async work.
    // This lets act() flush the resulting useEffect cleanly during tests.
    debounceRef.current = setTimeout(() => {
      setSearchQuery(text)
    }, 300)
  }

  /**
   * handleSelectSuggestion
   *
   * Called when the user taps a suggestion row:
   *   1. Cancels any pending debounce so a stale search doesn't fire afterwards.
   *   2. Clears searchQuery so the useEffect won't initiate another API call.
   *   3. Updates the parent's name field with the selected ingredient name.
   *   4. Calls onSelect so the parent can auto-fill category.
   *   5. Hides the suggestion list.
   *   6. Fires selectIngredient() fire-and-forget to track popularity ranking.
   *
   * @param result - The tapped suggestion from the search results.
   */
  const handleSelectSuggestion = (result: IngredientSearchResult) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    // Clear the committed query so the useEffect won't fire a new search.
    setSearchQuery("")

    onChangeText(result.ingredient_name)
    onSelect(result)
    setSuggestions([])

    // Track the selection for popularity ranking — fire-and-forget, skip if no id
    if (result.id) {
      APIService.selectIngredient(result.id)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View>
      {/* ── Input row (icon + text field + loading spinner) ── */}
      <View style={styles.inputRow}>
        <Icon name="package" size={16} color="#64748b" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleTextChange}
          placeholder={placeholder}
          placeholderTextColor="#475569"
          returnKeyType="next"
          autoCorrect={false}
        />
        {loading && (
          <ActivityIndicator
            size="small"
            color="#64748b"
            style={styles.loadingSpinner}
          />
        )}
      </View>

      {/* ── Suggestion list — only rendered when there are results ── */}
      {suggestions.length > 0 && (
        <View style={styles.suggestionList}>
          {suggestions.map((result, index) => (
            <TouchableOpacity
              key={result.id ?? result.normalized_name}
              style={[
                styles.suggestionRow,
                index < suggestions.length - 1 && styles.suggestionRowBorder,
              ]}
              onPress={() => handleSelectSuggestion(result)}
              activeOpacity={0.7}
            >
              {/*
               * Ingredient name on the left, category badge on the right.
               * The category badge auto-fills the Category selector when tapped,
               * so showing it here helps the user confirm it's the right item.
               */}
              <Text style={styles.suggestionName}>{result.ingredient_name}</Text>
              {result.category && (
                <Text style={styles.suggestionCategory}>{result.category}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  /** Icon + TextInput row — matches the inputRow style in the parent screens */
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f1419",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  /** flex:1 fills the remaining width after the icon (and optional spinner) */
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: "#f8fafc",
  },
  loadingSpinner: {
    marginLeft: 8,
  },
  /** Container for the suggestion rows — sits directly below the input */
  suggestionList: {
    backgroundColor: "#1a1f2e",
    borderWidth: 1,
    borderColor: "#334155",
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    overflow: "hidden",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  /** Thin divider between suggestion rows (omitted on the last row) */
  suggestionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#0f1419",
  },
  suggestionName: {
    fontSize: 14,
    color: "#f1f5f9",
    flex: 1,
  },
  /** Small category label shown to the right of the ingredient name */
  suggestionCategory: {
    fontSize: 11,
    color: "#64748b",
    textTransform: "capitalize",
    marginLeft: 8,
  },
})
