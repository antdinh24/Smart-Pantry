/**
 * navigation.ts
 *
 * PURPOSE:
 *   Defines TypeScript types for every screen in the app and the parameters
 *   each screen expects to receive when navigated to.
 *
 * WHY TWO SEPARATE PARAM LISTS?
 *   The app has two distinct navigation stacks:
 *
 *   1. AuthStackParamList — shown when NO user is logged in.
 *      Contains: Login, Register.
 *      App.tsx renders this stack when AuthContext.user is null.
 *
 *   2. RootStackParamList — shown when a user IS logged in.
 *      Contains: Home, Pantry, Scan, etc.
 *      App.tsx renders this stack when AuthContext.user is set.
 *
 *   Keeping them separate means TypeScript can enforce that screens like
 *   "Login" can only navigate to "Register" (both in AuthStack), and
 *   screens like "Pantry" can only navigate to "Scan" (both in RootStack).
 *   Mixing them in one list would allow invalid navigation paths.
 *
 * HOW TO ADD A NEW SCREEN:
 *   1. Add it to the correct param list below (AuthStack or RootStack).
 *   2. If it needs params, define them: { myParam: string }.
 *      If it needs no params, use: undefined.
 *   3. Register it in App.tsx's matching Stack.Navigator.
 */

import { PantryItem, ParsedReceiptItem } from './index';

// ─────────────────────────────────────────────────────────────────────────────
// AUTH STACK
// Screens accessible before the user logs in.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AuthStackParamList
 *
 * Screens in this list are only shown when no user is logged in.
 * Neither screen needs params — they stand alone.
 */
export type AuthStackParamList = {
  /** Email/password login form */
  Login: undefined;
  /** New account registration form */
  Register: undefined;
};

// ─────────────────────────────────────────────────────────────────────────────
// ROOT (MAIN APP) STACK
// Screens accessible after the user logs in.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BarcodeProduct
 *
 * The shape of data returned by GET /api/v1/pantry/barcode/{barcode}.
 * Passed as a navigation param from ScanScreen to BarcodeResultScreen.
 *
 * All fields can be null because OpenFoodFacts products are user-submitted
 * and may be missing any field.
 */
export type BarcodeProduct = {
  product_name: string | null;
  brands: string | null;
  quantity: string | null;
  categories: string | null;
  image_url: string | null;
  suggested_category: string | null;
  suggested_unit?: string | null;
  barcode: string;
};

/**
 * RootStackParamList
 *
 * Screens in this list are only shown after the user has logged in.
 *
 * Each entry is:
 *   ScreenName: undefined          — screen needs no params
 *   ScreenName: { key: Type }      — screen needs these params passed to it
 */
export type RootStackParamList = {
  /** Main dashboard */
  Home: undefined;
  /** Pantry item list */
  Pantry: undefined;
  /** Recipe suggestions */
  Recipes: undefined;
  /** Weekly meal schedule */
  Schedule: undefined;
  /** Manual ingredient entry */
  AddIngredients: undefined;
  /** Grocery shopping list */
  Grocery: undefined;
  /** Barcode scanner camera view */
  Scan: undefined;
  /**
   * Barcode scan result — shows product info and lets user add to pantry.
   * product is null when the barcode wasn't found in OpenFoodFacts.
   */
  BarcodeResult: { product: BarcodeProduct | null; barcode: string };
  /**
   * Full recipe detail view.
   *
   * recipeId — UUID used to fetch GET /recipes/:id on mount.
   * title    — shown in the header immediately, before the fetch completes,
   *             so the user sees a label rather than a blank bar.
   */
  RecipeDetail: { recipeId: string; title: string };
  /**
   * Receipt confirmation screen — shown after a receipt is scanned.
   * User can toggle/edit items before adding them to the pantry.
   *
   * receiptId  — UUID of the pending Receipt record in the database.
   *              Passed to POST /receipts/confirm when the user taps "Add to Pantry".
   * items      — Pre-parsed line items from the scan. Displayed as a checklist.
   * merchant   — Store name shown in the screen header (e.g. "Whole Foods").
   *              Null if the parser couldn't detect the merchant.
   * total      — Receipt total shown as a summary (e.g. 47.23).
   */
  ReceiptConfirm: {
    receiptId: string;
    items: ParsedReceiptItem[];
    merchant: string | null;
    total: number;
  };
  /**
   * Edit an existing pantry item.
   * We pass only the itemId (not the full item) so the screen reads the
   * latest data from PantryContext — prevents stale data if the item
   * was recently modified.
   */
  EditPantryItem: { itemId: string };
  /** Single pantry item detail */
  PantryItemDetail: { item: PantryItem };
};

/**
 * Global type augmentation for React Navigation.
 *
 * This tells React Navigation's TypeScript types about our RootStackParamList
 * so that useNavigation() is typed correctly throughout the app without
 * needing to pass the type explicitly every time.
 *
 * NOTE: We use RootStackParamList here (not AuthStackParamList) because
 * it's the primary/larger stack. Auth screens use explicit typing via
 * NativeStackNavigationProp<AuthStackParamList>.
 */
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
