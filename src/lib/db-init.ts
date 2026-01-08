import type { ConsolaInstance } from 'consola'
import type { Pool } from 'pg'
import { env } from './env'
import { createDBClient, type KyselyDatabase } from './db'

let db: KyselyDatabase | null = null
let pool: Pool | null = null

export async function initializeDatabase(logger: ConsolaInstance) {
  try {
    const { db: dbClient, pool: dbPool } = createDBClient(env.DATABASE_URL, logger)
    db = dbClient
    pool = dbPool

    // Test connection (read-only check)
    await db.selectFrom('users').select('id').limit(1).execute()
    
    logger.success('Database connection initialized successfully')
    return { db, pool }
  } catch (error) {
    logger.error('Failed to initialize database connection:', error)
    throw error
  }
}

export async function closeDatabase(logger: ConsolaInstance) {
  try {
    if (pool) {
      await pool.end()
      logger.info('Database connection pool closed')
    }
    db = null
    pool = null
  } catch (error) {
    logger.error('Error closing database connection:', error)
    throw error
  }
}

export function getDB(): KyselyDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }
  return db
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initializeDatabase() first.')
  }
  return pool
}
