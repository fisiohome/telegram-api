import { z } from "zod";

/**
 * Validation schemas for telegram-chatid feature
 * Uses generic_content table with group_key = TELEGRAM_CHAT_IDS
 */

// Constant group key for isolation
export const TELEGRAM_CHAT_IDS_GROUP_KEY = "TELEGRAM_CHAT_IDS";

/**
 * Schema for creating a new telegram chat ID
 */
export const createChatIdSchema = z.object({
  content_key: z.string().min(1, "Chat ID name (content_key) is required"),
  content_value: z.string().min(1, "Chat ID value (content_value) is required"),
  is_active: z.boolean().default(true),
});

export type CreateChatIdInput = z.infer<typeof createChatIdSchema>;

/**
 * Schema for updating a telegram chat ID
 */
export const updateChatIdSchema = z.object({
  content_key: z.string().min(1).optional(),
  content_value: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
});

export type UpdateChatIdInput = z.infer<typeof updateChatIdSchema>;

/**
 * Chat ID metadata stored in Redis
 */
export interface ChatIdMetadata {
  usage_count: number;
  last_used_at: string | null;
}

/**
 * Chat ID with metadata (combined from DB and Redis)
 */
export interface ChatIdWithMetadata {
  id: string;
  content_key: string;
  content_value: string | null;
  is_active: boolean | null;
  created_at: Date;
  updated_at: Date;
  metadata?: ChatIdMetadata;
}
