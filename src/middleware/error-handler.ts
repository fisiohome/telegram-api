import type { Context, Next } from 'hono'
import { internalServerErrorResponse } from '@/response'
import { logger } from '@/lib/logger'

export async function errorHandler(c: Context, next: Next) {
  try {
    await next()
  } catch (error) {
    logger.error('Unhandled error:', error)
    return internalServerErrorResponse(
      c,
      error instanceof Error ? error.message : 'Unknown error',
      'Internal Server Error'
    )
  }
}
