import type { ConsolaInstance } from 'consola'
import { type Expression, Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'
import type { DB } from '../db/schema'

export type KyselyDatabase = Kysely<DB>

export function createDBClient(connectionString: string, logger: ConsolaInstance) {
  const pool = new Pool({ connectionString })
  const db: KyselyDatabase = new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
    log: (event) => {
      if (process.env.DATABASE_DEBUG === 'true') {
        if (event.level === 'query') {
          logger.info(event.query.sql)
          logger.info(event.query.parameters)
        }
      }
      if (event.level === 'error') {
        logger.error('Error on database query :', event.error)
        logger.info(event.query.sql)
        logger.info(event.query.parameters)
      }
    },
  })

  return { pool, db }
}

export function upper(expr: Expression<string>) {
  return sql<string>`upper(${expr})`
}

export function lower(expr: Expression<string>) {
  return sql<string>`lower(${expr})`
}

export function concat(...exprs: Expression<string>[]) {
  return sql.join<string>(exprs, sql`||`)
}

interface PostgresError extends Error {
  code: string
  detail: string
  schema: string
  table: string
  column: string
  constraint: string
}

export const UNIQUE_VIOLATION_CODE = '23505'

export function isPostgresError(error: unknown, code: string): error is PostgresError {
  return error instanceof Error && (error as PostgresError).code === code
}
