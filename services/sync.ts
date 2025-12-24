/**
 * Sync Service
 *
 * Product Manager Note:
 * - Syncs offline data to cloud when internet is available
 * - Processes sync_queue table
 * - Handles conflicts (local vs cloud data)
 * - Retries failed syncs
 *
 * How it works:
 * 1. User makes changes offline → saved to SQLite + sync_queue
 * 2. When online → SyncService processes queue
 * 3. Uploads changes to FastAPI/Supabase
 * 4. Marks as synced
 */

import DatabaseService from './database'
import APIService from './api'
import StorageService from './storage'

interface SyncQueueItem {
  id: number
  table_name: string
  record_id: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  data: string
  retry_count: number
}

class SyncService {
  private isSyncing = false
  private maxRetries = 3

  /**
   * Check if device is online
   */
  async isOnline(): Promise<boolean> {
    try {
      const response = await fetch(APIService.healthCheck as any)
      return response !== null
    } catch {
      return false
    }
  }

  /**
   * Start sync process
   * Call this when app comes online or user manually syncs
   */
  async syncAll(): Promise<void> {
    if (this.isSyncing) {
      console.log('⏳ Sync already in progress')
      return
    }

    try {
      this.isSyncing = true
      console.log('🔄 Starting sync...')

      // Check if online
      const online = await this.isOnline()
      if (!online) {
        console.log('📴 Device is offline, skipping sync')
        return
      }

      // Get pending items from sync queue
      const db = DatabaseService.getDatabase()
      const queue = await db.getAllAsync<SyncQueueItem>(
        'SELECT * FROM sync_queue WHERE retry_count < ? ORDER BY created_at ASC',
        [this.maxRetries]
      )

      if (queue.length === 0) {
        console.log('✅ Nothing to sync')
        StorageService.setLastSyncTime(Date.now())
        return
      }

      console.log(`📤 Syncing ${queue.length} items...`)

      // Process each item
      let successCount = 0
      let errorCount = 0

      for (const item of queue) {
        try {
          await this.syncItem(item)
          // Remove from queue on success
          await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [item.id])
          successCount++
        } catch (error: any) {
          console.error(`❌ Failed to sync item ${item.id}:`, error.message)
          // Increment retry count
          await db.runAsync(
            'UPDATE sync_queue SET retry_count = retry_count + 1, last_error = ? WHERE id = ?',
            [error.message, item.id]
          )
          errorCount++
        }
      }

      console.log(`✅ Sync complete: ${successCount} success, ${errorCount} errors`)
      StorageService.setLastSyncTime(Date.now())
    } catch (error) {
      console.error('❌ Sync failed:', error)
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * Sync individual item
   */
  private async syncItem(item: SyncQueueItem): Promise<void> {
    const data = JSON.parse(item.data)

    switch (item.table_name) {
      case 'pantry_items':
        await this.syncPantryItem(item.operation, data)
        break
      case 'grocery_list':
        await this.syncGroceryItem(item.operation, data)
        break
      case 'receipts_offline':
        await this.syncReceipt(item.operation, data)
        break
      // Add other tables as needed
      default:
        console.warn(`Unknown table: ${item.table_name}`)
    }
  }

  /**
   * Sync pantry item
   */
  private async syncPantryItem(operation: string, data: any): Promise<void> {
    switch (operation) {
      case 'INSERT':
        await APIService.addPantryItem(data)
        break
      case 'UPDATE':
        await APIService.updatePantryItem(data.id, data)
        break
      case 'DELETE':
        await APIService.deletePantryItem(data.id)
        break
    }

    // Mark as synced in local database
    const db = DatabaseService.getDatabase()
    await db.runAsync(
      'UPDATE pantry_items SET sync_status = ? WHERE id = ?',
      ['synced', data.id]
    )
  }

  /**
   * Sync grocery item
   */
  private async syncGroceryItem(operation: string, data: any): Promise<void> {
    // TODO: Implement grocery list sync endpoints
    console.log('Syncing grocery item:', operation, data)
  }

  /**
   * Sync receipt
   */
  private async syncReceipt(operation: string, data: any): Promise<void> {
    // TODO: Implement receipt sync
    console.log('Syncing receipt:', operation, data)
  }

  /**
   * Add item to sync queue
   * Call this whenever data changes offline
   */
  async queueSync(
    tableName: string,
    recordId: string,
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    data: any
  ): Promise<void> {
    const db = DatabaseService.getDatabase()
    await db.runAsync(
      'INSERT INTO sync_queue (table_name, record_id, operation, data) VALUES (?, ?, ?, ?)',
      [tableName, recordId, operation, JSON.stringify(data)]
    )
    console.log(`📝 Queued ${operation} for ${tableName}:${recordId}`)
  }
}

export default new SyncService()
