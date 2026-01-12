import { z } from "zod";
import { createTaggedFactory } from "@/lib/factory";
import { successResponse } from "@/response/success.response";
import { badRequestResponse, notFoundResponse } from "@/response/error.response";
import { validator } from "@/middleware/validator";
import { requireService } from "@/middleware";
import {
  createTokenSchema,
  updateTokenSchema,
  rotateTokenSchema,
  setWebhookSchema,
  batchSetWebhookSchema,
} from "./telegram-token.repo";
import { TelegramTokenService } from "./telegram-token.service";

const [factory, describeRoute] = createTaggedFactory("Telegram Tokens");
export const telegramTokenRoutes = factory.createApp();

// Initialize service
const tokenService = new TelegramTokenService();

// Response schemas for OpenAPI
const tokenResponseSchema = z.object({
  id: z.string(),
  content_key: z.string(),
  content_value: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  metadata: z
    .object({
      usage_count: z.number(),
      last_used_at: z.string().nullable(),
      error_message: z.string().nullable(),
    })
    .optional(),
});

const tokensListResponseSchema = z.array(tokenResponseSchema);

/**
 * POST /tokens
 * Create a new telegram bot token
 */
telegramTokenRoutes.post(
  "/",
  describeRoute({
    description: "Create a new telegram bot token",
    schema: tokenResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  validator("json", createTokenSchema),
  async (c) => {
    const input = c.req.valid("json");
    const token = await tokenService.createToken(input);
    return successResponse(c, token, "Token created successfully");
  }
);

/**
 * GET /tokens
 * Get all telegram bot tokens
 */
telegramTokenRoutes.get(
  "/",
  describeRoute({
    description: "Get all telegram bot tokens",
    schema: tokensListResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const tokens = await tokenService.getAllTokens();
    return successResponse(c, tokens, "Tokens retrieved successfully");
  }
);

/**
 * GET /tokens/:id
 * Get a specific token by ID
 */
telegramTokenRoutes.get(
  "/:id",
  describeRoute({
    description: "Get a specific telegram bot token by ID",
    schema: tokenResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const id = c.req.param("id");
    const token = await tokenService.getTokenById(id);

    if (!token) {
      return notFoundResponse(c, "Token not found");
    }

    return successResponse(c, token, "Token retrieved successfully");
  }
);

/**
 * PUT /tokens/:id
 * Update a telegram bot token
 */
telegramTokenRoutes.put(
  "/:id",
  describeRoute({
    description: "Update a telegram bot token",
    schema: tokenResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  validator("json", updateTokenSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const token = await tokenService.updateToken(id, input);

    if (!token) {
      return notFoundResponse(c, "Token not found");
    }

    return successResponse(c, token, "Token updated successfully");
  }
);

/**
 * DELETE /tokens/:id
 * Delete (deactivate) a telegram bot token
 */
telegramTokenRoutes.delete(
  "/:id",
  describeRoute({
    description: "Delete (deactivate) a telegram bot token",
    schema: z.object({ success: z.boolean() }),
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const id = c.req.param("id");
    const success = await tokenService.deleteToken(id);

    if (!success) {
      return notFoundResponse(c, "Token not found");
    }

    return successResponse(
      c,
      { success: true },
      "Token deleted (deactivated) successfully"
    );
  }
);

/**
 * POST /tokens/:id/rotate
 * Manually mark a token as banned/inactive
 */
telegramTokenRoutes.post(
  "/:id/rotate",
  describeRoute({
    description: "Mark a token as banned/inactive (rotate to next token)",
    schema: z.object({ success: z.boolean() }),
    requireServiceAuth: true,
  }),
  requireService(),
  validator("json", rotateTokenSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const success = await tokenService.markTokenAsBanned(id, input);

    if (!success) {
      return notFoundResponse(c, "Token not found");
    }

    return successResponse(
      c,
      { success: true },
      "Token marked as inactive successfully"
    );
  }
);

/**
 * GET /tokens/next/active
 * Get the next active token (for testing round-robin)
 */
telegramTokenRoutes.get(
  "/next/active",
  describeRoute({
    description: "Get the next active token using round-robin logic",
    schema: tokenResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const token = await tokenService.getNextActiveToken();

    if (!token) {
      return notFoundResponse(c, "No active tokens available");
    }

    return successResponse(c, token, "Next active token retrieved successfully");
  }
);

// ==================== Webhook Management Endpoints ====================

/**
 * GET /tokens/:id/webhook
 * Get webhook info for a specific token
 */
telegramTokenRoutes.get(
  "/:id/webhook",
  describeRoute({
    description: "Get webhook info for a specific telegram bot token",
    schema: z.any(),
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const id = c.req.param("id");
    
    try {
      const webhookInfo = await tokenService.getWebhookInfo(id);
      return successResponse(c, webhookInfo, "Webhook info retrieved successfully");
    } catch (error: any) {
      return badRequestResponse(c, error.message || "Failed to get webhook info");
    }
  }
);

/**
 * POST /tokens/:id/webhook
 * Set webhook URL for a specific token
 */
telegramTokenRoutes.post(
  "/:id/webhook",
  describeRoute({
    description: "Set webhook URL for a specific telegram bot token",
    schema: z.any(),
    requireServiceAuth: true,
  }),
  requireService(),
  validator("json", setWebhookSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    
    try {
      const result = await tokenService.setWebhook(id, input.url, input.secret_token);
      return successResponse(c, result, "Webhook set successfully");
    } catch (error: any) {
      return badRequestResponse(c, error.message || "Failed to set webhook");
    }
  }
);

/**
 * DELETE /tokens/:id/webhook
 * Delete webhook for a specific token
 */
telegramTokenRoutes.delete(
  "/:id/webhook",
  describeRoute({
    description: "Delete webhook for a specific telegram bot token",
    schema: z.any(),
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const id = c.req.param("id");
    
    try {
      const result = await tokenService.deleteWebhook(id);
      return successResponse(c, result, "Webhook deleted successfully");
    } catch (error: any) {
      return badRequestResponse(c, error.message || "Failed to delete webhook");
    }
  }
);

/**
 * POST /tokens/webhook/batch
 * Set webhook URL for all active tokens
 */
telegramTokenRoutes.post(
  "/webhook/batch",
  describeRoute({
    description: "Set webhook URL for all active telegram bot tokens",
    schema: z.object({
      updated: z.number(),
      failed: z.number(),
      errors: z.array(z.any()),
    }),
    requireServiceAuth: true,
  }),
  requireService(),
  validator("json", batchSetWebhookSchema),
  async (c) => {
    const input = c.req.valid("json");
    
    try {
      const result = await tokenService.setWebhookBatch(input.url, input.secret_token);
      return successResponse(
        c,
        result,
        `Batch webhook set complete: ${result.updated} updated, ${result.failed} failed`
      );
    } catch (error: any) {
      return badRequestResponse(c, error.message || "Failed to set webhooks");
    }
  }
);

/**
 * GET /tokens/webhook/status
 * Get webhook status for all active tokens
 */
telegramTokenRoutes.get(
  "/webhook/status",
  describeRoute({
    description: "Get webhook status for all active telegram bot tokens",
    schema: z.array(z.any()),
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    try {
      const statuses = await tokenService.getWebhookStatusForAllTokens();
      return successResponse(c, statuses, "Webhook statuses retrieved successfully");
    } catch (error: any) {
      return badRequestResponse(c, error.message || "Failed to get webhook statuses");
    }
  }
);
