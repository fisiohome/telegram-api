export const Constants = {
  app: {
    NAME: "Telegram API",
    VERSION: "1.0.0",
    START_TIME: Date.now(),
  },
  api: {
    PREFIX: "/api/v1",
  },
} as const;

// Export for backward compatibility
export const APP_NAME = Constants.app.NAME;
export const APP_VERSION = Constants.app.VERSION;
export const API_PREFIX = Constants.api.PREFIX;

// ==================== Telegram Broadcast Token Keys ====================
// These content_key values map to dedicated bot tokens inside the
// TELEGRAM_BOT_TOKENS group. They are intentionally excluded from the
// rolling/round-robin token pool so they are only used for their type.

export const TELEGRAM_BROADCAST_TOKEN_KEYS = {
  /** Bot dedicated to sending reminder messages */
  REMINDER: "TELEGRAM_REMINDER",
  /** Bot dedicated to sending announcement messages */
  ANNOUNCEMENT: "TELEGRAM_ANNOUNCEMENT",
} as const;

export type TelegramBroadcastType = keyof typeof TELEGRAM_BROADCAST_TOKEN_KEYS;

/** All reserved content_keys that must be excluded from normal token rotation */
export const TELEGRAM_RESERVED_TOKEN_KEYS: string[] = Object.values(
  TELEGRAM_BROADCAST_TOKEN_KEYS,
);
