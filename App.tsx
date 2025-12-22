import { NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { StatusBar } from "react-native"
import HomeScreen from "./screens/HomeScreen"
import PantryScreen from "./screens/PantryScreen"
import RecipesScreen from "./screens/RecipesScreen"
import ScheduleScreen from "./screens/ScheduleScreen"
import AddIngredientsScreen from "./screens/AddIngredientsScreen"
import GroceryScreen from "./screens/GroceryScreen"

const Stack = createNativeStackNavigator()

export default function App() {
  return (
    <>
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
        </Stack.Navigator>
      </NavigationContainer>
    </>
  )
}
