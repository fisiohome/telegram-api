import { z } from "zod";

/**
 * Validation schemas for telegram-token feature
 * Uses generic_content table with group_key = TELEGRAM_BOT_TOKENS
 */

// Constant group key for isolation
export const TELEGRAM_BOT_TOKENS_GROUP_KEY = "TELEGRAM_BOT_TOKENS";

/**
 * Schema for creating a new telegram token
 */
export const createTokenSchema = z.object({
  content_key: z.string().min(1, "Token name (content_key) is required"),
  content_value: z.string().min(1, "Bot token (content_value) is required"),
  is_active: z.boolean().default(true),
});

export type CreateTokenInput = z.infer<typeof createTokenSchema>;

/**
 * Schema for updating a telegram token
 */
export const updateTokenSchema = z.object({
  content_key: z.string().min(1).optional(),
  content_value: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
});

export type UpdateTokenInput = z.infer<typeof updateTokenSchema>;

/**
 * Schema for rotating/banning a token
 */
export const rotateTokenSchema = z.object({
  error_message: z.string().optional(),
});

export type RotateTokenInput = z.infer<typeof rotateTokenSchema>;

/**
 * Token metadata stored in Redis
 */
export interface TokenMetadata {
  usage_count: number;
  last_used_at: string | null;
  error_message: string | null;
}

/**
 * Token with metadata (combined from DB and Redis)
 */
export interface TokenWithMetadata {
  id: string;
  content_key: string;
  content_value: string | null;
  is_active: boolean | null;
  created_at: Date;
  updated_at: Date;
  metadata?: TokenMetadata;
}

/**
 * Schema for setting webhook
 */
export const setWebhookSchema = z.object({
  url: z.string().url("Valid webhook URL is required"),
  secret_token: z.string().min(1).max(256).optional(),
});

export type SetWebhookInput = z.infer<typeof setWebhookSchema>;

/**
 * Schema for batch setting webhook
 */
export const batchSetWebhookSchema = z.object({
  url: z.string().url("Valid webhook URL is required"),
  secret_token: z.string().min(1).max(256).optional(),
});

export type BatchSetWebhookInput = z.infer<typeof batchSetWebhookSchema>;

/**
 * Telegram API webhook info response
 */
export interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  last_synchronization_error_date?: number;
  max_connections?: number;
  allowed_updates?: string[];
}

/**
 * Webhook status for all tokens
 */
export interface WebhookStatus {
  token_id: string;
  token_name: string;
  webhook_info: TelegramWebhookInfo | null;
  error?: string;
}

