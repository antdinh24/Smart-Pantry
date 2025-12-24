# Smart Pantry - Quick Reference Card

## 🔥 Common Code Snippets

### **Get Current User**
```typescript
import { useAuth } from './contexts/AuthContext'

function MyComponent() {
  const { user, isPremium } = useAuth()

  if (!user) return <LoginScreen />

  return <Text>Hello {user.email}</Text>
}
```

### **Save to SQLite**
```typescript
import DatabaseService from './services/database'
import { v4 as uuid } from 'uuid'

const db = DatabaseService.getDatabase()

// Insert
await db.runAsync(
  'INSERT INTO pantry_items (id, user_id, ingredient_name, quantity) VALUES (?, ?, ?, ?)',
  [uuid(), userId, 'Tomato', 2]
)

// Query
const items = await db.getAllAsync('SELECT * FROM pantry_items WHERE user_id = ?', [userId])

// Update
await db.runAsync('UPDATE pantry_items SET quantity = ? WHERE id = ?', [5, itemId])

// Delete
await db.runAsync('DELETE FROM pantry_items WHERE id = ?', [itemId])
```

### **Save to MMKV**
```typescript
import StorageService from './services/storage'

// Save
StorageService.setTheme('dark')
StorageService.setMonthlyBudget(500)
StorageService.setPremiumUnlocked(true)

// Get
const theme = StorageService.getTheme()
const isPremium = StorageService.isPremiumUnlocked()
const budget = StorageService.getMonthlyBudget()
```

### **Call Backend API**
```typescript
import APIService from './services/api'

// Generate AI recipe
try {
  const recipe = await APIService.generateRecipe({
    cuisine: 'Italian',
    difficulty: 'easy'
  })
  console.log('Got recipe:', recipe)
} catch (error) {
  console.error('Failed to generate recipe:', error)
}

// Add pantry item
await APIService.addPantryItem({
  ingredient_name: 'Tomato',
  quantity: 2,
  unit: 'count'
})

// Get pantry
const items = await APIService.getPantryItems()
```

### **Supabase Operations**
```typescript
import SupabaseService from './services/supabase'

// Sign in
const { user } = await SupabaseService.signIn('user@example.com', 'password')

// Upload image
await SupabaseService.uploadReceiptImage(userId, imageUri, 'receipt.jpg')

// Get user profile
const profile = await SupabaseService.getUserProfile(userId)
```

### **Sync Offline Changes**
```typescript
import SyncService from './services/sync'

// Queue a change (for later sync)
await SyncService.queueSync('pantry_items', itemId, 'INSERT', itemData)

// Sync all pending changes
await SyncService.syncAll()
```

---

## 🗂️ Database Quick Reference

### **Pantry Items Table**
```sql
SELECT * FROM pantry_items WHERE user_id = ?
INSERT INTO pantry_items (id, user_id, ingredient_name, quantity, unit) VALUES (?, ?, ?, ?, ?)
UPDATE pantry_items SET quantity = ? WHERE id = ?
DELETE FROM pantry_items WHERE id = ?
```

### **Recipes Cache Table**
```sql
SELECT * FROM recipes_cache WHERE user_id = ? AND is_favorite = 1
SELECT * FROM recipes_cache WHERE meal_type = 'dinner'
UPDATE recipes_cache SET is_favorite = 1 WHERE id = ?
```

### **Grocery List Table**
```sql
SELECT * FROM grocery_list WHERE user_id = ? AND is_checked = 0
UPDATE grocery_list SET is_checked = 1 WHERE id = ?
```

### **Sync Queue**
```sql
SELECT * FROM sync_queue WHERE retry_count < 3
DELETE FROM sync_queue WHERE id = ?
```

---

## 🔑 MMKV Keys

### **Auth**
```typescript
StorageService.getAuthToken()
StorageService.getUserId()
StorageService.getUserEmail()
StorageService.clearAuth() // On logout
```

### **Preferences**
```typescript
StorageService.getTheme() // 'light' | 'dark'
StorageService.getMeasurementSystem() // 'metric' | 'imperial'
StorageService.getDefaultServings() // number
```

### **Features**
```typescript
StorageService.isPremiumUnlocked() // boolean
StorageService.getAIRecipesRemaining() // number
StorageService.isOnboardingCompleted() // boolean
```

### **Budget**
```typescript
StorageService.getMonthlyBudget() // number
StorageService.getCurrency() // 'USD'
```

---

## 🌐 API Endpoints (FastAPI)

### **Pantry**
- `GET /api/v1/pantry` - Get all items
- `POST /api/v1/pantry` - Add item
- `PUT /api/v1/pantry/:id` - Update item
- `DELETE /api/v1/pantry/:id` - Delete item
- `GET /api/v1/pantry/barcode/:code` - Lookup barcode

### **Recipes**
- `POST /api/v1/recipes/generate` - Generate AI recipe
- `GET /api/v1/recipes/suggestions` - Get suggestions
- `GET /api/v1/recipes/:id` - Get recipe
- `POST /api/v1/recipes` - Save recipe
- `GET /api/v1/recipes/:id/match` - Calculate match %

### **Receipts**
- `POST /api/v1/receipts/process` - Process OCR text
- `GET /api/v1/receipts` - Get history

### **Budget**
- `GET /api/v1/budget/summary/:month` - Monthly summary
- `GET /api/v1/budget/alert` - Check budget alert

### **Subscription**
- `GET /api/v1/subscription/status` - Get status
- `POST /api/v1/subscription/checkout` - Create checkout

---

## 🎨 Common Patterns

### **Loading State**
```typescript
const [loading, setLoading] = useState(false)
const [data, setData] = useState(null)

const loadData = async () => {
  try {
    setLoading(true)
    const result = await APIService.getPantryItems()
    setData(result)
  } catch (error) {
    console.error('Failed to load:', error)
  } finally {
    setLoading(false)
  }
}
```

### **Error Handling**
```typescript
try {
  await APIService.addPantryItem(item)
  Alert.alert('Success', 'Item added to pantry')
} catch (error: any) {
  Alert.alert('Error', error.message || 'Failed to add item')
}
```

### **Offline-First Save**
```typescript
// Save locally first (instant)
const db = DatabaseService.getDatabase()
const itemId = uuid()
await db.runAsync(
  'INSERT INTO pantry_items (id, user_id, ingredient_name, quantity, sync_status) VALUES (?, ?, ?, ?, ?)',
  [itemId, userId, name, quantity, 'pending']
)

// Queue for sync (when online)
await SyncService.queueSync('pantry_items', itemId, 'INSERT', {
  id: itemId,
  ingredient_name: name,
  quantity: quantity
})

// Trigger sync if online
await SyncService.syncAll()
```

### **Premium Feature Gating**
```typescript
import { useAuth } from './contexts/AuthContext'

function RecipeScreen() {
  const { isPremium } = useAuth()

  const generateRecipe = async () => {
    if (!isPremium) {
      const remaining = StorageService.getAIRecipesRemaining()
      if (remaining <= 0) {
        Alert.alert('Upgrade to Premium', 'You've used all free AI recipes')
        return
      }
      StorageService.setAIRecipesRemaining(remaining - 1)
    }

    const recipe = await APIService.generateRecipe()
  }
}
```

---

## 📱 Navigation

```typescript
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from './types/navigation'

type NavigationProp = NativeStackNavigationProp<RootStackParamList>

function MyScreen() {
  const navigation = useNavigation<NavigationProp>()

  const goToPantry = () => {
    navigation.navigate('Pantry')
  }

  const goToRecipe = (recipeId: string) => {
    navigation.navigate('Recipes', { recipeId })
  }
}
```

---

## 🔧 Environment Variables

### **Mobile (.env)**
```bash
EXPO_PUBLIC_API_URL=http://localhost:8000/api/v1
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-key-here
EXPO_PUBLIC_ENVIRONMENT=development
```

### **Backend (.env)**
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
OPENAI_API_KEY=sk-your-key
STRIPE_SECRET_KEY=sk_test_your-key
```

---

## 🐛 Debug Commands

```typescript
// View MMKV keys
console.log('All keys:', StorageService.getAllKeys())

// Check sync queue
const db = DatabaseService.getDatabase()
const queue = await db.getAllAsync('SELECT * FROM sync_queue')
console.log('Pending syncs:', queue)

// Clear all data (testing only!)
await DatabaseService.clearAll()
StorageService.clearAll()

// Check environment
import { env } from './config/env'
console.log('API URL:', env.apiUrl)
console.log('Environment:', env.environment)
```

---

## 📦 File Structure Cheat Sheet

```
services/database.ts    → SQLite operations
services/storage.ts     → MMKV settings
services/api.ts         → Backend API calls
services/supabase.ts    → Supabase & auth
services/sync.ts        → Offline sync
contexts/AuthContext.tsx → User authentication
config/env.ts           → Environment variables
```

---

Print this out or keep it handy while coding! 🚀
