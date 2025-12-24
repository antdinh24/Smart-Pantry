/**
 * Database Service (SQLite)
 *
 * Product Manager Note:
 * - Initializes SQLite database on device
 * - Creates tables for offline storage
 * - Handles migrations (schema updates)
 * - All data is local - syncs to Supabase when online
 *
 * Tables created:
 * - pantry_items: User's current pantry
 * - recipes_cache: Downloaded recipes
 * - grocery_list: Shopping list
 * - receipts_offline: Scanned receipts
 * - meal_schedule: Meal planning
 * - sync_queue: Tracks pending uploads
 */

import * as SQLite from 'expo-sqlite'
import StorageService from './storage'

const DB_NAME = 'smartpantry.db'
const CURRENT_SCHEMA_VERSION = 1

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null

  /**
   * Initialize database
   * Call this on app startup
   */
  async initialize(): Promise<void> {
    try {
      console.log('🗄️ Initializing SQLite database...')

      // Open database
      this.db = await SQLite.openDatabaseAsync(DB_NAME)

      // Check if we need to run migrations
      const currentVersion = StorageService.getDbSchemaVersion()

      if (currentVersion < CURRENT_SCHEMA_VERSION) {
        console.log(`📊 Running migrations from v${currentVersion} to v${CURRENT_SCHEMA_VERSION}`)
        await this.runMigrations(currentVersion)
        StorageService.setDbSchemaVersion(CURRENT_SCHEMA_VERSION)
      } else {
        console.log('✅ Database schema up to date')
      }

      console.log('✅ Database initialized successfully')
    } catch (error) {
      console.error('❌ Failed to initialize database:', error)
      throw error
    }
  }

  /**
   * Run database migrations
   */
  private async runMigrations(fromVersion: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    // Migration 0 → 1: Create initial schema
    if (fromVersion < 1) {
      await this.createInitialSchema()
    }

    // Future migrations go here
    // if (fromVersion < 2) { await this.migration_v2() }
  }

  /**
   * Create initial database schema
   */
  private async createInitialSchema(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    console.log('Creating initial schema...')

    // PANTRY ITEMS TABLE
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS pantry_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        ingredient_name TEXT NOT NULL,
        normalized_name TEXT,
        quantity REAL NOT NULL,
        unit TEXT,
        category TEXT,
        expiration_date TEXT,
        location TEXT,
        barcode TEXT,
        added_date TEXT DEFAULT (datetime('now')),
        last_updated TEXT DEFAULT (datetime('now')),
        sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('synced', 'pending', 'conflict')),
        deleted INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_pantry_user_id ON pantry_items(user_id);
      CREATE INDEX IF NOT EXISTS idx_pantry_sync_status ON pantry_items(sync_status);
      CREATE INDEX IF NOT EXISTS idx_pantry_normalized_name ON pantry_items(normalized_name);
    `)

    // RECIPES CACHE TABLE
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS recipes_cache (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        ingredient_list TEXT,
        instructions TEXT,
        prep_time_minutes INTEGER,
        cook_time_minutes INTEGER,
        servings INTEGER,
        difficulty TEXT,
        cuisine_type TEXT,
        meal_type TEXT,
        is_ai_generated INTEGER DEFAULT 0,
        source_type TEXT,
        nutritional_info TEXT,
        is_favorite INTEGER DEFAULT 0,
        match_percentage REAL,
        last_viewed TEXT,
        created_at TEXT,
        sync_status TEXT DEFAULT 'synced',
        deleted INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes_cache(user_id);
      CREATE INDEX IF NOT EXISTS idx_recipes_favorite ON recipes_cache(is_favorite);
      CREATE INDEX IF NOT EXISTS idx_recipes_meal_type ON recipes_cache(meal_type);
    `)

    // GROCERY LIST TABLE
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS grocery_list (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        ingredient_name TEXT NOT NULL,
        normalized_name TEXT,
        quantity REAL,
        unit TEXT,
        recipe_id TEXT,
        is_checked INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 0,
        notes TEXT,
        added_date TEXT DEFAULT (datetime('now')),
        sync_status TEXT DEFAULT 'pending',
        deleted INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_grocery_user_id ON grocery_list(user_id);
      CREATE INDEX IF NOT EXISTS idx_grocery_checked ON grocery_list(is_checked);
    `)

    // RECEIPTS OFFLINE TABLE
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS receipts_offline (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        merchant_name TEXT,
        purchase_date TEXT,
        total_amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        line_items TEXT,
        image_path TEXT,
        ocr_confidence REAL,
        processed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        sync_status TEXT DEFAULT 'pending',
        deleted INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_receipts_user_id ON receipts_offline(user_id);
      CREATE INDEX IF NOT EXISTS idx_receipts_processed ON receipts_offline(processed);
      CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts_offline(purchase_date);
    `)

    // MEAL SCHEDULE TABLE
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS meal_schedule (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        recipe_id TEXT NOT NULL,
        scheduled_date TEXT NOT NULL,
        meal_type TEXT,
        is_completed INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        sync_status TEXT DEFAULT 'pending',
        deleted INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_schedule_user_id ON meal_schedule(user_id);
      CREATE INDEX IF NOT EXISTS idx_schedule_date ON meal_schedule(scheduled_date);
    `)

    // SYNC QUEUE TABLE
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
        data TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        retry_count INTEGER DEFAULT 0,
        last_error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_sync_queue_table ON sync_queue(table_name);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);
    `)

    console.log('✅ Initial schema created')
  }

  /**
   * Get database instance
   * Use this to run custom queries
   */
  getDatabase(): SQLite.SQLiteDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.')
    }
    return this.db
  }

  /**
   * Close database connection
   * Call this on app shutdown (optional, usually not needed)
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync()
      this.db = null
      console.log('Database connection closed')
    }
  }

  /**
   * Clear all data (for testing/logout)
   */
  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    await this.db.execAsync(`
      DELETE FROM pantry_items;
      DELETE FROM recipes_cache;
      DELETE FROM grocery_list;
      DELETE FROM receipts_offline;
      DELETE FROM meal_schedule;
      DELETE FROM sync_queue;
    `)

    console.log('✅ All database data cleared')
  }
}

// Export singleton instance
export default new DatabaseService()
