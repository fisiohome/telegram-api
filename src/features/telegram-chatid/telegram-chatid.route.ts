import { z } from "zod";
import { createTaggedFactory } from "@/lib/factory";
import { successResponse } from "@/response/success.response";
import { badRequestResponse, notFoundResponse } from "@/response/error.response";
import { validator } from "@/middleware/validator";
import { requireService } from "@/middleware";
import {
  createChatIdSchema,
  updateChatIdSchema,
} from "./telegram-chatid.repo";
import { TelegramChatIdService } from "./telegram-chatid.service";

const [factory, describeRoute] = createTaggedFactory("Telegram Chat IDs");
export const telegramChatIdRoutes = factory.createApp();

// Initialize service
const chatIdService = new TelegramChatIdService();

// Response schemas for OpenAPI
const chatIdResponseSchema = z.object({
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
    })
    .optional(),
});

const chatIdsListResponseSchema = z.array(chatIdResponseSchema);

/**
 * POST /
 * Create a new telegram chat ID
 */
telegramChatIdRoutes.post(
  "/",
  describeRoute({
    description: "Create a new telegram chat ID",
    schema: chatIdResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  validator("json", createChatIdSchema),
  async (c) => {
    const input = c.req.valid("json");
    const chatId = await chatIdService.createChatId(input);
    return successResponse(c, chatId, "Chat ID created successfully");
  }
);

/**
 * GET /
 * Get all telegram chat IDs
 */
telegramChatIdRoutes.get(
  "/",
  describeRoute({
    description: "Get all telegram chat IDs",
    schema: chatIdsListResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const chatIds = await chatIdService.getAllChatIds();
    return successResponse(c, chatIds, "Chat IDs retrieved successfully");
  }
);

/**
 * GET /:id
 * Get a specific chat ID by ID
 */
telegramChatIdRoutes.get(
  "/:id",
  describeRoute({
    description: "Get a specific telegram chat ID by ID",
    schema: chatIdResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const id = c.req.param("id");
    const chatId = await chatIdService.getChatIdById(id);

    if (!chatId) {
      return notFoundResponse(c, "Chat ID not found");
    }

    return successResponse(c, chatId, "Chat ID retrieved successfully");
  }
);

/**
 * GET /key/:key
 * Get a chat ID by content_key (for easy lookup)
 */
telegramChatIdRoutes.get(
  "/key/:key",
  describeRoute({
    description: "Get a telegram chat ID by content_key",
    schema: chatIdResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const key = c.req.param("key");
    const chatId = await chatIdService.getChatIdByKey(key);

    if (!chatId) {
      return notFoundResponse(c, "Chat ID not found");
    }

    return successResponse(c, chatId, "Chat ID retrieved successfully");
  }
);

/**
 * PUT /:id
 * Update a telegram chat ID
 */
telegramChatIdRoutes.put(
  "/:id",
  describeRoute({
    description: "Update a telegram chat ID",
    schema: chatIdResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  validator("json", updateChatIdSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const chatId = await chatIdService.updateChatId(id, input);

    if (!chatId) {
      return notFoundResponse(c, "Chat ID not found");
    }

    return successResponse(c, chatId, "Chat ID updated successfully");
  }
);

/**
 * POST /chatids/:id/unpublish
 * Unpublish (deactivate) a chat ID
 */
telegramChatIdRoutes.post(
  "/:id/unpublish",
  describeRoute({
    description: "Unpublish (deactivate) chat ID - can be restored",
    schema: z.object({ success: z.boolean() }),
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const id = c.req.param("id");
    const success = await chatIdService.unpublishChatId(id);

    if (!success) {
      return notFoundResponse(c, "Chat ID not found");
    }

    return successResponse(c, { success: true }, "Chat ID unpublished successfully");
  }
);

/**
 * POST /chatids/:id/publish
 * Publish (activate) a chat ID
 */
telegramChatIdRoutes.post(
  "/:id/publish",
  describeRoute({
    description: "Publish (activate) chat ID",
    schema: z.object({ success: z.boolean() }),
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const id = c.req.param("id");
    const success = await chatIdService.publishChatId(id);

    if (!success) {
      return notFoundResponse(c, "Chat ID not found");
    }

    return successResponse(c, { success: true }, "Chat ID published successfully");
  }
);

/**
 * DELETE /chatids/:id
 * Hard delete (permanently remove) a chat ID
 */
telegramChatIdRoutes.delete(
  "/:id",
  describeRoute({
    description: "Permanently delete chat ID - irreversible",
    schema: z.object({ success: z.boolean() }),
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const id = c.req.param("id");
    const success = await chatIdService.hardDeleteChatId(id);

    if (!success) {
      return notFoundResponse(c, "Chat ID not found");
    }

    return successResponse(c, { success: true }, "Chat ID permanently deleted");
  }
);
