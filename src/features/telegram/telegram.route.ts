import { z } from "zod";
import { createTaggedFactory } from "@/lib/factory";
import { successResponse } from "@/response/success.response";
import { validator } from "@/middleware/validator";
import { requireService } from "@/middleware";
import { sendMessageSchema, sendTelegramSchema } from "./telegram.repo";
import { TelegramService } from "./telegram.service";
import { logger } from "@/lib/logger";

const [factory, describeRoute] = createTaggedFactory("Telegram");
export const telegramRoutes = factory.createApp();

// Initialize telegram service (will use DB tokens with ENV fallback)
const telegramService = new TelegramService();

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

/**
 * POST /telegram/webhook
 * Webhook endpoint for receiving updates from Telegram Bot API
 * This endpoint is called by Telegram servers, NOT by users
 */
telegramRoutes.post(
  "/webhook",
  describeRoute({
    description: "Receive updates from Telegram Bot API (webhook endpoint)",
    schema: z.object({ ok: z.boolean() }),
    requireServiceAuth: false, // No service auth - validated by secret token
  }),
  async (c) => {
    try {
      // Validate secret token from header
      const secretToken = c.req.header('x-telegram-bot-api-secret-token');
      const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;

      if (expectedToken && secretToken !== expectedToken) {
        logger.warn('Webhook request with invalid secret token');
        return c.json({ error: 'Unauthorized' }, 403);
      }

      // Parse update from Telegram
      const update = await c.req.json();

      // Handle webhook (async, don't wait for response)
      await telegramService.handleWebhook(update);

      // Always return 200 OK to Telegram (required)
      return c.json({ ok: true }, 200);
    } catch (error: any) {
      logger.error('Error in webhook endpoint:', error);
      // Still return 200 to Telegram to avoid retries
      return c.json({ ok: true }, 200);
    }
  }
);
