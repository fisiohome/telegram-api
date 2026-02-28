import { z } from "zod";
import { createTaggedFactory } from "@/lib/factory";
import { successResponse } from "@/response/success.response";
import { validator } from "@/middleware/validator";
import { requireService } from "@/middleware";
import {
  sendMessageSchema,
  sendTelegramSchema,
  sendBulkMessageSchema,
} from "./telegram.repo";
import { TelegramService } from "./telegram.service";
import { logger } from "@/lib/logger";
import { TELEGRAM_BROADCAST_TOKEN_KEYS } from "@/lib/constants";

const [factory, describeRoute] = createTaggedFactory("Telegram");
export const telegramRoutes = factory.createApp();

// Initialize telegram service (will use DB tokens with ENV fallback)
const telegramService = new TelegramService();

const sendMessageResponseSchema = z.object({
  ok: z.boolean(),
  result: z.any(),
});

const sendBulkMessageResponseSchema = z.object({
  ok: z.boolean(),
  job_id: z.string(),
  total: z.number(),
  message: z.string(),
});

const broadcastStatusResponseSchema = z.object({
  job_id: z.string(),
  status: z.enum(["pending", "running", "done", "failed"]),
  total: z.number(),
  sent: z.number(),
  failed: z.number(),
  started_at: z.string(),
  finished_at: z.string().optional(),
  errors: z.array(z.object({ chat_id: z.string(), error: z.string() })),
  results: z.any().optional(),
});

/** Valid broadcast type values derived from constants (single source of truth) */
const broadcastTypeEnum = z.enum(
  Object.keys(TELEGRAM_BROADCAST_TOKEN_KEYS) as [
    keyof typeof TELEGRAM_BROADCAST_TOKEN_KEYS,
    ...Array<keyof typeof TELEGRAM_BROADCAST_TOKEN_KEYS>,
  ],
);

/** Request body for the typed broadcast endpoint */
const sendBulkMessageByTypeSchema = z.object({
  /** Optional. When provided, use the dedicated bot token for this type. */
  type: broadcastTypeEnum.optional(),
  messages: sendBulkMessageSchema,
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
  },
);

/**
 * POST /telegram/send-messages
 * Fire-and-forget: enqueue a bulk broadcast in the background.
 * Returns 202 immediately with a job_id to track progress.
 */
telegramRoutes.post(
  "/send-messages",
  describeRoute({
    description:
      "Start a background broadcast to multiple recipients. Returns immediately with a job_id.",
    schema: sendBulkMessageResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  validator("json", sendBulkMessageSchema),
  async (c) => {
    const input = c.req.valid("json");
    const jobId = telegramService.startBroadcast(input);
    return c.json(
      {
        ok: true,
        job_id: jobId,
        total: input.length,
        message: `Broadcast queued for ${input.length} recipients. Poll /broadcast-status/${jobId} for progress.`,
      },
      202,
    );
  },
);

/**
 * GET /telegram/broadcast-status/:jobId
 * Poll the status of an ongoing or completed broadcast job.
 */
telegramRoutes.get(
  "/broadcast-status/:jobId",
  describeRoute({
    description: "Get the current status and progress of a broadcast job",
    schema: broadcastStatusResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const jobId = c.req.param("jobId");
    const job = telegramService.getBroadcastJob(jobId);

    if (!job) {
      return c.json({ ok: false, error: "Job not found" }, 404);
    }

    return successResponse(
      c,
      {
        job_id: job.id,
        status: job.status,
        total: job.total,
        sent: job.sent,
        failed: job.failed,
        started_at: job.startedAt.toISOString(),
        finished_at: job.finishedAt?.toISOString(),
        errors: job.errors,
        // Only include full results when done (could be large)
        ...(job.status === "done" && { results: job.results }),
      },
      "Broadcast job status retrieved",
    );
  },
);

/**
 * POST /telegram/send-messages-by-type
 * Typed broadcast: optionally pin the broadcast to a dedicated bot token.
 *
 * Body:
 *   { type?: "REMINDER" | "ANNOUNCEMENT", messages: [...] }
 *
 * - type omitted  → rolling pool (same as /send-messages)
 * - type provided → dedicated token for that type (e.g. TELEGRAM_REMINDER key)
 *                   falls back to rolling pool if token not configured in DB
 */
telegramRoutes.post(
  "/send-messages-by-type",
  describeRoute({
    description:
      "Start a typed background broadcast. Supply a type to use a dedicated bot token; omit to use the rolling pool.",
    schema: sendBulkMessageResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  validator("json", sendBulkMessageByTypeSchema),
  async (c) => {
    const { type, messages } = c.req.valid("json");
    const jobId = await telegramService.startBroadcastByType(messages, type);
    return c.json(
      {
        ok: true,
        job_id: jobId,
        total: messages.length,
        message:
          `Broadcast queued for ${messages.length} recipients` +
          (type ? ` via ${type} bot` : " via rolling pool") +
          `. Poll /broadcast-status/${jobId} for progress.`,
      },
      202,
    );
  },
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
  },
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
  },
);

/**
 * POST /telegram/sync-commands
 * Sync local commands to Telegram API
 */
telegramRoutes.post(
  "/sync-commands",
  describeRoute({
    description: "Sync configured commands to Telegram Bot API",
    schema: z.object({ ok: z.boolean(), result: z.any() }),
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const result = await telegramService.syncCommands();
    return successResponse(c, result, "Commands synced successfully");
  },
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
      const secretToken = c.req.header("x-telegram-bot-api-secret-token");
      const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;

      if (expectedToken && secretToken !== expectedToken) {
        logger.warn("Webhook request with invalid secret token");
        return c.json({ error: "Unauthorized" }, 403);
      }

      // Parse update from Telegram
      const update = await c.req.json();

      // Handle webhook (async, don't wait for response)
      await telegramService.handleWebhook(update);

      // Always return 200 OK to Telegram (required)
      return c.json({ ok: true }, 200);
    } catch (error: any) {
      logger.error("Error in webhook endpoint:", error);
      // Still return 200 to Telegram to avoid retries
      return c.json({ ok: true }, 200);
    }
  },
);
