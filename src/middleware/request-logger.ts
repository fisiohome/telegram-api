import type { Context, Next } from 'hono'
import { logger } from '@/lib/logger'

export async function requestLogger(c: Context, next: Next) {
  const requestId = crypto.randomUUID()
  c.set('requestId', requestId)

  const start = Date.now()
  const method = c.req.method
  const path = c.req.path

  logger.info(`→ ${method} ${path} [${requestId}]`)

  await next()

  const duration = Date.now() - start
  const status = c.res.status

  logger.info(`← ${method} ${path} ${status} ${duration}ms [${requestId}]`)
}
