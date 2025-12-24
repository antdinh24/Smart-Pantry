import { useEffect, useState } from "react"
import { NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { StatusBar, View, Text, ActivityIndicator } from "react-native"
import { AppProvider } from "./contexts/AppContext"
import { AuthProvider } from "./contexts/AuthContext"
import HomeScreen from "./screens/HomeScreen"
import PantryScreen from "./screens/PantryScreen"
import RecipesScreen from "./screens/RecipesScreen"
import ScheduleScreen from "./screens/ScheduleScreen"
import AddIngredientsScreen from "./screens/AddIngredientsScreen"
import GroceryScreen from "./screens/GroceryScreen"
import ScanScreen from "./screens/ScanScreen"
import { RootStackParamList } from "./types/navigation"
import DatabaseService from "./services/database"
import StorageService from "./services/storage"

const Stack = createNativeStackNavigator<RootStackParamList>()

export default function App() {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    initializeApp()
  }, [])

  const initializeApp = async () => {
    try {
      console.log("🚀 Initializing Smart Pantry...")

      // Initialize SQLite database
      await DatabaseService.initialize()

      // Track app launches
      const launchCount = StorageService.incrementLaunchCount()
      console.log(`📱 App launch #${launchCount}`)

      // Mark as ready
      setIsReady(true)
      console.log("✅ App initialized successfully")
    } catch (error) {
      console.error("❌ Failed to initialize app:", error)
      // Show error screen or retry
      setIsReady(true) // Continue anyway
    }
  }

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f1419" }}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={{ color: "#ffffff", marginTop: 16 }}>Loading Smart Pantry...</Text>
      </View>
    )
  }

  return (
    <AuthProvider>
      <AppProvider>
        <StatusBar barStyle="light-content" backgroundColor="#0f1419" />
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "#0f1419" },
            }}
          >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Pantry" component={PantryScreen} />
            <Stack.Screen name="Recipes" component={RecipesScreen} />
            <Stack.Screen name="Schedule" component={ScheduleScreen} />
            <Stack.Screen name="AddIngredients" component={AddIngredientsScreen} />
            <Stack.Screen name="Grocery" component={GroceryScreen} />
            <Stack.Screen name="Scan" component={ScanScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </AppProvider>
    </AuthProvider>
  )
}
