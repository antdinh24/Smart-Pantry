import { NavigatorScreenParams } from '@react-navigation/native';
import { PantryItem, Recipe, GroceryItem, MealSchedule } from './index';

export type RootStackParamList = {
  Home: undefined;
  Pantry: undefined;
  Recipes: undefined;
  Schedule: undefined;
  AddIngredients: undefined;
  Grocery: undefined;
  Scan: undefined;
  RecipeDetail: { recipe: Recipe };
  PantryItemDetail: { item: PantryItem };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

