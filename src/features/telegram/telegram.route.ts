import { z } from "zod";
import { createTaggedFactory } from "@/lib/factory";
import { successResponse } from "@/response/success.response";
import { validator } from "@/middleware/validator";
import { requireService } from "@/middleware";
import { sendMessageSchema, sendTelegramSchema } from "./telegram.repo";
import { TelegramService } from "./telegram.service";
import { env } from "@/lib/env";

const [factory, describeRoute] = createTaggedFactory("Telegram");
export const telegramRoutes = factory.createApp();

// Initialize telegram service with bot token from env
const telegramService = new TelegramService(env.TELEGRAM_BOT_TOKEN || "");

// Response schemas for OpenAPI
const sendMessageResponseSchema = z.object({
  ok: z.boolean(),
  result: z.any(),
});

const sendTelegramResponseSchema = z.object({
  ok: z.boolean(),
  result: z.any(),
});

const getMeResponseSchema = z.object({
  id: z.number(),
  is_bot: z.boolean(),
  first_name: z.string(),
  username: z.string().optional(),
});

/**
 * POST /telegram/send-message
 * Send a simple telegram message
 */
telegramRoutes.post(
  "/send-message",
  describeRoute({
    description: "Send a simple telegram message",
    schema: sendMessageResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(), // Require service authentication
  validator("json", sendMessageSchema), // ✅ Library akan otomatis ambil schema dari sini
  async (c) => {
    const input = c.req.valid("json");
    const result = await telegramService.sendMessage(input);
    return successResponse(c, result, "Message sent successfully");
  }
);

/**
 * POST /telegram/send-telegram
 * Send a formatted patient notification to telegram
 */
telegramRoutes.post(
  "/send-telegram",
  describeRoute({
    description: "Send a formatted patient notification to telegram",
    schema: sendTelegramResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(), // Require service authentication
  validator("json", sendTelegramSchema), // ✅ Library akan otomatis ambil schema dari sini
  async (c) => {
    const input = c.req.valid("json");
    const result = await telegramService.sendTelegram(input);
    return successResponse(c, result, "Patient notification sent successfully");
  }
);

/**
 * GET /telegram/me
 * Get telegram bot information
 */
telegramRoutes.get(
  "/me",
  describeRoute({
    description: "Get telegram bot information",
    schema: getMeResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(), // Require service authentication
  async (c) => {
    const result = await telegramService.getMe();
    return successResponse(c, result, "Bot info retrieved successfully");
  }
);
