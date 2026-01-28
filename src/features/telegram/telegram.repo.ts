import { z } from "zod";

/**
 * Validation schemas for telegram feature
 */

export const sendMessageSchema = z.object({
  chat_id: z.string().min(1, "Chat ID is required"),
  message: z.string().min(1, "Message is required"),
  parse_mode: z.enum(["HTML", "Markdown", "MarkdownV2"]).optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const sendTelegramSchema = z.object({
  chat_id: z.string().min(1, "Chat ID is required"),
  kode_pasien: z.string(),
  gender_req: z.string(),
  usia: z.number().or(z.string()),
  jenis_kelamin: z.string(),
  keluhan: z.string(),
  durasi: z.string(),
  kondisi: z.string(),
  riwayat: z.string(),
  alamat: z.string(),
  visit: z.string(),
  jadwal: z.string(),
  mentions: z.array(z.string()).optional(),
});

export type SendTelegramInput = z.infer<typeof sendTelegramSchema>;

export const telegramConfigSchema = z.object({
  bot_token: z.string().min(1, "Bot token is required"),
});

export type TelegramConfigInput = z.infer<typeof telegramConfigSchema>;
