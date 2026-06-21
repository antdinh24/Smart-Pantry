/**
 * App.tsx
 *
 * PURPOSE:
 *   The root of the entire application. Responsible for:
 *     1. Initializing the SQLite database and tracking app launches on startup.
 *     2. Wrapping the app in context providers (Auth, App state).
 *     3. Deciding which navigator to show based on whether a user is logged in.
 *
 * AUTH GATE — how it works:
 *   AuthContext checks for an existing Supabase session when the app opens.
 *   While that check is running, AuthContext sets `loading = true`.
 *   We show a spinner during this time so there's no "flash" of the wrong screen.
 *
 *   Once the check completes:
 *     - user is null  → show AuthNavigator (Login / Register screens)
 *     - user is set   → show AppNavigator  (Home / Pantry / etc.)
 *
 *   When the user logs in via LoginScreen, AuthContext.signIn() sets `user`.
 *   This component re-renders, sees user is now set, and switches to AppNavigator.
 *   No manual navigation.navigate() call is needed in the login screen.
 *
 * TWO NAVIGATORS:
 *   AuthNavigator — contains Login and Register only.
 *   AppNavigator  — contains all the main app screens.
 *   They are separate stacks so the back button can't take a logged-in user
 *   back to the login screen, and vice versa.
 */

import { useEffect, useState } from "react"
import { NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { StatusBar, View, Text, ActivityIndicator } from "react-native"
import { AppProvider } from "./contexts/AppContext"
import { AuthProvider, useAuth } from "./contexts/AuthContext"

// Screen imports — Auth stack
import LoginScreen from "./screens/LoginScreen"
import RegisterScreen from "./screens/RegisterScreen"

// Screen imports — Main app stack
import HomeScreen from "./screens/HomeScreen"
import PantryScreen from "./screens/PantryScreen"
import RecipesScreen from "./screens/RecipesScreen"
import ScheduleScreen from "./screens/ScheduleScreen"
import AddIngredientsScreen from "./screens/AddIngredientsScreen"
import GroceryScreen from "./screens/GroceryScreen"
import ScanScreen from "./screens/ScanScreen"
import BarcodeResultScreen from "./screens/BarcodeResultScreen"
import EditPantryItemScreen from "./screens/EditPantryItemScreen"
import ReceiptConfirmScreen from "./screens/ReceiptConfirmScreen"
import RecipeDetailScreen from "./screens/RecipeDetailScreen"

import { AuthStackParamList, RootStackParamList } from "./types/navigation"
import DatabaseService from "./services/database"
import StorageService from "./services/storage"

/** Stack navigator for screens shown before login */
const AuthStack = createNativeStackNavigator<AuthStackParamList>()

/** Stack navigator for screens shown after login */
const AppStack = createNativeStackNavigator<RootStackParamList>()

/**
 * AuthNavigator
 *
 * Renders the Login and Register screens.
 * This navigator is shown when no user is logged in.
 * Login is the initial screen (first one listed).
 */
function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,                      /* we draw our own headers */
        contentStyle: { backgroundColor: "#0f1419" },
      }}
    >
      {/* Login is the default screen for unauthenticated users */}
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  )
}

/**
 * AppNavigator
 *
 * Renders all main app screens.
 * This navigator is shown when a user is logged in.
 * Home is the default landing screen.
 */
function AppNavigator() {
  return (
    <AppStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0f1419" },
      }}
    >
      <AppStack.Screen name="Home" component={HomeScreen} />
      <AppStack.Screen name="Pantry" component={PantryScreen} />
      <AppStack.Screen name="Recipes" component={RecipesScreen} />
      <AppStack.Screen name="Schedule" component={ScheduleScreen} />
      <AppStack.Screen name="AddIngredients" component={AddIngredientsScreen} />
      <AppStack.Screen name="Grocery" component={GroceryScreen} />
      <AppStack.Screen name="Scan" component={ScanScreen} />
      <AppStack.Screen name="BarcodeResult" component={BarcodeResultScreen} />
      <AppStack.Screen name="EditPantryItem" component={EditPantryItemScreen} />
      {/*
       * ReceiptConfirm — navigated to from ScanScreen after a receipt is scanned.
       * Shows a checklist of extracted items; user confirms before adding to pantry.
       */}
      <AppStack.Screen name="ReceiptConfirm" component={ReceiptConfirmScreen} />
      {/*
       * RecipeDetail — navigated to from RecipesScreen when the user taps "View Recipe".
       * Fetches the full recipe (ingredients + instructions) via GET /recipes/:id on mount.
       */}
      <AppStack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
    </AppStack.Navigator>
  )
}

/**
 * RootNavigator
 *
 * The auth gate. Reads user and loading from AuthContext and decides
 * which navigator to render.
 *
 * WHY is this a separate component (not inlined in App)?
 *   useAuth() can only be called inside a component that is a child of
 *   AuthProvider. App renders AuthProvider, so App itself can't call useAuth().
 *   By putting this logic in RootNavigator (which sits inside AuthProvider),
 *   the hook works correctly.
 *
 * LOADING STATE:
 *   When the app first opens, AuthContext checks SecureStore for a saved session.
 *   This takes a moment. During that time, `loading` is true and we show a
 *   spinner. Without this check, the app would flash the Login screen briefly
 *   even for users who are already logged in.
 */
function RootNavigator() {
  const { user, loading } = useAuth()

  /**
   * Show a loading spinner while AuthContext is checking the saved session.
   * This prevents the Login screen from flashing briefly on every app open
   * for users who are already authenticated.
   */
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f1419" }}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={{ color: "#94a3b8", marginTop: 16, fontSize: 14 }}>Loading...</Text>
      </View>
    )
  }

  /**
   * Auth gate:
   *   user === null → not logged in → show Login/Register
   *   user !== null → logged in     → show main app
   *
   * React Navigation automatically handles the transition between the two
   * stacks when `user` changes (e.g. after signIn or signOut).
   */
  return user ? <AppNavigator /> : <AuthNavigator />
}

/**
 * App (root component)
 *
 * Handles app initialization (database, launch tracking), then renders
 * the provider tree with RootNavigator inside.
 *
 * PROVIDER ORDER (outermost → innermost):
 *   AuthProvider   — must be outermost so all children can call useAuth()
 *   AppProvider    — app-wide state (pantry data, etc.)
 *   NavigationContainer — required wrapper for all React Navigation navigators
 *   RootNavigator  — reads auth state and picks the right stack
 */
export default function App() {
  /** True once the database has been initialized and we're ready to render screens */
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    initializeApp()
  }, [])

  /**
   * initializeApp
   *
   * Runs once on mount. Sets up the SQLite database schema and tracks
   * how many times the app has been launched (for analytics).
   *
   * Even if this fails, we set isReady=true so the app still opens.
   * The database failing is not fatal — screens that need it will show
   * their own errors.
   */
  const initializeApp = async () => {
    try {
      console.log("🚀 Initializing Smart Pantry...")

      // Set up SQLite tables (creates them if they don't exist yet)
      await DatabaseService.initialize()

      // Increment and log the launch counter (stored in SecureStore)
      const launchCount = await StorageService.incrementLaunchCount()
      console.log(`📱 App launch #${launchCount}`)

      console.log("✅ App initialized successfully")
    } catch (error) {
      console.error("❌ Failed to initialize app:", error)
      // Don't block the app from opening if initialization fails
    } finally {
      setIsReady(true)
    }
  }

  /**
   * Show a spinner while the database initializes.
   * This is usually very fast (<100ms) but we still guard against it
   * so screens never render before the database is ready.
   */
  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f1419" }}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={{ color: "#94a3b8", marginTop: 16, fontSize: 14 }}>Loading Smart Pantry...</Text>
      </View>
    )
  }

  return (
    <AuthProvider>
      <AppProvider>
        <StatusBar barStyle="light-content" backgroundColor="#0f1419" />
        <NavigationContainer>
          {/*
           * RootNavigator sits inside AuthProvider so it can call useAuth().
           * It decides whether to show AuthNavigator or AppNavigator
           * based on whether a user is logged in.
           */}
          <RootNavigator />
        </NavigationContainer>
      </AppProvider>
    </AuthProvider>
  )
}
