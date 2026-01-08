export const Constants = {
  app: {
    NAME: 'Telegram API',
    VERSION: '1.0.0',
    START_TIME: Date.now(),
  },
  api: {
    PREFIX: '/api/v1',
  },
} as const

// Export for backward compatibility
export const APP_NAME = Constants.app.NAME
export const APP_VERSION = Constants.app.VERSION
export const API_PREFIX = Constants.api.PREFIX
