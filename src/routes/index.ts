import type { Hono } from 'hono'
import { telegramRoutes } from '@/features/telegram'
import { telegramTokenRoutes } from '@/features/telegram-token'
import { telegramChatIdRoutes } from '@/features/telegram-chatid'
import { telegramWhitelistRoutes } from '@/features/telegram-whitelist'
import { API_PREFIX } from '@/lib/constants'
import type { HonoEnv } from '@/lib/env'

export function registerRoutes(app: Hono<HonoEnv>) {
  // Register all feature routes under API prefix
  app.route(`${API_PREFIX}/telegram`, telegramRoutes)
  app.route(`${API_PREFIX}/tokens`, telegramTokenRoutes)
  app.route(`${API_PREFIX}/chatids`, telegramChatIdRoutes)
  app.route(`${API_PREFIX}/whitelist`, telegramWhitelistRoutes)
}
