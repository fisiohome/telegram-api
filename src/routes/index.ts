import type { Hono } from 'hono'
import { telegramRoutes } from '@/features/telegram'
import { API_PREFIX } from '@/lib/constants'
import type { HonoEnv } from '@/lib/env'

export function registerRoutes(app: Hono<HonoEnv>) {
  // Register all feature routes under API prefix
  app.route(`${API_PREFIX}/telegram`, telegramRoutes)
}
