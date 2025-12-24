# SQLite Schemas for Mobile App

## Overview
These schemas define the **on-device database** for offline-first functionality.

## Purpose
- **Offline Support**: App works without internet
- **Fast Performance**: Instant queries (no API calls)
- **Sync Strategy**: Changes sync to Supabase when online

## Tables

### Core Data Tables
| Table | Purpose | Syncs to Supabase? |
|-------|---------|-------------------|
| `pantry_items` | User's current pantry inventory | Yes |
| `recipes_cache` | Downloaded recipes | Yes (one-way from cloud) |
| `grocery_list` | Shopping list | Yes |
| `receipts_offline` | Scanned receipts | Yes |
| `meal_schedule` | Meal planning calendar | Yes |

### System Tables
| Table | Purpose |
|-------|---------|
| `sync_queue` | Tracks pending sync operations |

## Sync Strategy

### How Syncing Works
```
User Action (Offline)
  ↓
Save to SQLite (instant)
  ↓
Add to sync_queue
  ↓
When online → Process queue
  ↓
Upload to Supabase
  ↓
Mark as synced
```

### Conflict Resolution
- **Server wins**: Supabase is source of truth
- Local changes are timestamped
- If conflict detected, user prompted to resolve

## Using in React Native

### Example: Add Pantry Item
```javascript
import * as SQLite from 'expo-sqlite';

const db = await SQLite.openDatabaseAsync('smartpantry.db');

// Add item (works offline)
await db.runAsync(
  'INSERT INTO pantry_items (id, user_id, ingredient_name, quantity, unit) VALUES (?, ?, ?, ?, ?)',
  [uuid(), userId, 'tomato', 2, 'count']
);

// Queue for sync
await db.runAsync(
  'INSERT INTO sync_queue (table_name, record_id, operation) VALUES (?, ?, ?)',
  ['pantry_items', itemId, 'INSERT']
);
```

## Initialization
The mobile app will run this SQL file on first launch to create the schema.

## Migration Strategy
For schema changes:
1. Check current version (stored in MMKV)
2. Run migration scripts (e.g., `ALTER TABLE ADD COLUMN`)
3. Update version number
