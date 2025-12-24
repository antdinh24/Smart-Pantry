# MMKV Key-Value Storage Schema

## What is MMKV?
**MMKV** is a fast, lightweight key-value storage for React Native (like Redis for mobile).

## Why Use MMKV vs SQLite?
| Use Case | Storage Type |
|----------|-------------|
| Simple flags, tokens, preferences | **MMKV** (fast, simple) |
| Structured data (pantry items, recipes) | **SQLite** (queryable) |

Think of MMKV as a **settings file** and SQLite as a **spreadsheet**.

---

## Key Definitions

### Authentication
| Key | Type | Purpose | Example Value |
|-----|------|---------|---------------|
| `auth.token` | string | Supabase access token | `eyJhbGciOiJIUzI1...` |
| `auth.refresh_token` | string | Refresh token | `v1.abc123...` |
| `auth.user_id` | string | Current user ID | `550e8400-e29b...` |
| `auth.email` | string | User email | `user@example.com` |
| `auth.expires_at` | number | Token expiration timestamp | `1704067200` |

### User Preferences
| Key | Type | Purpose | Example Value |
|-----|------|---------|---------------|
| `prefs.theme` | string | Light/dark mode | `"dark"` |
| `prefs.language` | string | App language | `"en"` |
| `prefs.measurement_system` | string | Metric or imperial | `"metric"` |
| `prefs.default_servings` | number | Default recipe servings | `4` |
| `prefs.notifications_enabled` | boolean | Push notifications | `true` |
| `prefs.budget_alerts` | boolean | Budget exceeded alerts | `true` |

### Feature Flags
| Key | Type | Purpose | Example Value |
|-----|------|---------|---------------|
| `feature.premium_unlocked` | boolean | Is user premium? | `true` |
| `feature.trial_end_date` | number | Trial expiration timestamp | `1704067200` |
| `feature.ai_recipes_remaining` | number | Free tier AI recipe limit | `5` |
| `feature.onboarding_completed` | boolean | Has user finished onboarding? | `true` |
| `feature.receipt_scan_count` | number | Track free tier usage | `3` |

### App State
| Key | Type | Purpose | Example Value |
|-----|------|---------|---------------|
| `app.version` | string | Current app version | `"1.2.0"` |
| `app.db_schema_version` | number | SQLite schema version | `3` |
| `app.last_sync` | number | Last sync timestamp | `1704067200` |
| `app.first_launch_date` | string | When user installed app | `"2024-01-15"` |
| `app.launch_count` | number | Track app opens | `42` |

### Cache & Performance
| Key | Type | Purpose | Example Value |
|-----|------|---------|---------------|
| `cache.ingredients_updated` | number | Last ingredient list update | `1704067200` |
| `cache.recipes_last_fetch` | number | Last recipe sync | `1704067200` |
| `cache.user_location` | string | For local pricing (optional) | `"US-CA"` |

### Budgeting
| Key | Type | Purpose | Example Value |
|-----|------|---------|---------------|
| `budget.monthly_limit` | number | User's grocery budget | `500.00` |
| `budget.currency` | string | Currency code | `"USD"` |
| `budget.alert_threshold` | number | Alert at X% of budget | `0.8` |

---

## Usage Examples (React Native)

### Setting Values
```javascript
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

// Store auth token
storage.set('auth.token', userToken);

// Store premium status
storage.set('feature.premium_unlocked', true);

// Store budget
storage.set('budget.monthly_limit', 500.00);
```

### Getting Values
```javascript
// Get auth token
const token = storage.getString('auth.token');

// Check if premium
const isPremium = storage.getBoolean('feature.premium_unlocked');

// Get budget
const budget = storage.getNumber('budget.monthly_limit');
```

### Deleting Values (e.g., on logout)
```javascript
// Clear all auth data
storage.delete('auth.token');
storage.delete('auth.refresh_token');
storage.delete('auth.user_id');
```

---

## Security Considerations

### Sensitive Data
| Should Store | Should NOT Store |
|--------------|------------------|
| Auth tokens (encrypted by MMKV) | Credit card numbers |
| User preferences | Passwords (plain text) |
| Feature flags | Receipts (use SQLite) |

### Best Practices
1. **Never store passwords** - use Supabase Auth
2. **Tokens are encrypted** - MMKV handles this automatically
3. **Clear on logout** - delete all `auth.*` keys
4. **Sync flags carefully** - don't trust client-side premium flags for billing

---

## Migration Strategy

If you need to change a key name:
```javascript
// Migrate old key to new key
const oldValue = storage.getString('old.key');
if (oldValue) {
  storage.set('new.key', oldValue);
  storage.delete('old.key');
}
```

---

## Debugging

### View All Keys (Development Only)
```javascript
const allKeys = storage.getAllKeys();
console.log('MMKV Keys:', allKeys);

// View specific key
console.log('Auth Token:', storage.getString('auth.token'));
```

### Clear All Data (Logout/Testing)
```javascript
storage.clearAll();
```

---

## Key Naming Convention
Follow this pattern: `category.specific_name`

Examples:
- `auth.token` (not `authToken`)
- `prefs.theme` (not `userTheme`)
- `feature.premium_unlocked` (not `isPremium`)

This keeps keys organized and searchable.
