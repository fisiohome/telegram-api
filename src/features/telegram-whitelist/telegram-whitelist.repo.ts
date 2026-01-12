import { z } from "zod";

/**
 * Validation schemas for telegram-whitelist feature
 * Uses generic_content table with group_key = TELEGRAM_COMMAND_WHITELIST
 */

// Constant group key for isolation
export const TELEGRAM_COMMAND_WHITELIST_GROUP_KEY = "TELEGRAM_COMMAND_WHITELIST";

/**
 * Schema for creating a new whitelist entry
 */
export const createWhitelistSchema = z.object({
  content_key: z.string().min(1, "User identifier (content_key) is required"),
  content_value: z.string().optional().default(""),
  is_active: z.boolean().default(true),
});

export type CreateWhitelistInput = z.infer<typeof createWhitelistSchema>;

/**
 * Schema for updating a whitelist entry
 */
export const updateWhitelistSchema = z.object({
  content_key: z.string().min(1).optional(),
  content_value: z.string().optional(),
  is_active: z.boolean().optional(),
});

export type UpdateWhitelistInput = z.infer<typeof updateWhitelistSchema>;

/**
 * Whitelist entry from database
 */
export interface WhitelistEntry {
  id: string;
  content_key: string;
  content_value: string | null;
  is_active: boolean | null;
  created_at: Date;
  updated_at: Date;
}
