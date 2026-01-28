import { z } from "zod";
import { createTaggedFactory } from "@/lib/factory";
import { successResponse } from "@/response/success.response";
import { badRequestResponse, notFoundResponse } from "@/response/error.response";
import { validator } from "@/middleware/validator";
import { requireService } from "@/middleware";
import {
  createWhitelistSchema,
  updateWhitelistSchema,
} from "./telegram-whitelist.repo";
import { TelegramWhitelistService } from "./telegram-whitelist.service";

const [factory, describeRoute] = createTaggedFactory("Telegram Whitelist");
export const telegramWhitelistRoutes = factory.createApp();

// Initialize service
const whitelistService = new TelegramWhitelistService();

// Response schemas for OpenAPI
const whitelistResponseSchema = z.object({
  id: z.string(),
  content_key: z.string(),
  content_value: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

const whitelistListResponseSchema = z.array(whitelistResponseSchema);

/**
 * POST /whitelist
 * Create a new whitelist entry
 */
telegramWhitelistRoutes.post(
  "/",
  describeRoute({
    description: "Add user to command whitelist",
    schema: whitelistResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  validator("json", createWhitelistSchema),
  async (c) => {
    const input = c.req.valid("json");
    const entry = await whitelistService.createWhitelistEntry(input);
    return successResponse(c, entry, "Whitelist entry created successfully");
  }
);

/**
 * GET /whitelist
 * Get all whitelist entries
 */
telegramWhitelistRoutes.get(
  "/",
  describeRoute({
    description: "Get all whitelisted users",
    schema: whitelistListResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const entries = await whitelistService.getAllWhitelistEntries();
    return successResponse(c, entries, "Whitelist entries retrieved successfully");
  }
);

/**
 * GET /whitelist/:id
 * Get a specific whitelist entry by ID
 */
telegramWhitelistRoutes.get(
  "/:id",
  describeRoute({
    description: "Get a specific whitelist entry by ID",
    schema: whitelistResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const id = c.req.param("id");
    const entry = await whitelistService.getWhitelistEntryById(id);

    if (!entry) {
      return notFoundResponse(c, "Whitelist entry not found");
    }

    return successResponse(c, entry, "Whitelist entry retrieved successfully");
  }
);

/**
 * GET /whitelist/check/:identifier
 * Check if user is whitelisted
 */
telegramWhitelistRoutes.get(
  "/check/:identifier",
  describeRoute({
    description: "Check if user identifier is whitelisted",
    schema: z.object({ is_whitelisted: z.boolean() }),
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const identifier = c.req.param("identifier");
    const isWhitelisted = await whitelistService.isUserWhitelisted(identifier);
    
    return successResponse(
      c,
      { is_whitelisted: isWhitelisted },
      isWhitelisted ? "User is whitelisted" : "User is not whitelisted"
    );
  }
);

/**
 * PUT /whitelist/:id
 * Update a whitelist entry
 */
telegramWhitelistRoutes.put(
  "/:id",
  describeRoute({
    description: "Update a whitelist entry",
    schema: whitelistResponseSchema,
    requireServiceAuth: true,
  }),
  requireService(),
  validator("json", updateWhitelistSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const entry = await whitelistService.updateWhitelistEntry(id, input);

    if (!entry) {
      return notFoundResponse(c, "Whitelist entry not found");
    }

    return successResponse(c, entry, "Whitelist entry updated successfully");
  }
);

/**
 * POST /whitelist/:id/unpublish
 * Unpublish (deactivate) a whitelist entry
 */
telegramWhitelistRoutes.post(
  "/:id/unpublish",
  describeRoute({
    description: "Unpublish (deactivate) whitelist entry - can be restored",
    schema: z.object({ success: z.boolean() }),
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const id = c.req.param("id");
    const success = await whitelistService.unpublishWhitelistEntry(id);

    if (!success) {
      return notFoundResponse(c, "Whitelist entry not found");
    }

    return successResponse(c, { success: true }, "Whitelist entry unpublished successfully");
  }
);

/**
 * POST /whitelist/:id/publish
 * Publish (activate) a whitelist entry
 */
telegramWhitelistRoutes.post(
  "/:id/publish",
  describeRoute({
    description: "Publish (activate) whitelist entry",
    schema: z.object({ success: z.boolean() }),
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const id = c.req.param("id");
    const success = await whitelistService.publishWhitelistEntry(id);

    if (!success) {
      return notFoundResponse(c, "Whitelist entry not found");
    }

    return successResponse(c, { success: true }, "Whitelist entry published successfully");
  }
);

/**
 * DELETE /whitelist/:id
 * Hard delete (permanently remove) a whitelist entry
 */
telegramWhitelistRoutes.delete(
  "/:id",
  describeRoute({
    description: "Permanently delete whitelist entry - irreversible",
    schema: z.object({ success: z.boolean() }),
    requireServiceAuth: true,
  }),
  requireService(),
  async (c) => {
    const id = c.req.param("id");
    const success = await whitelistService.hardDeleteWhitelistEntry(id);

    if (!success) {
      return notFoundResponse(c, "Whitelist entry not found");
    }

    return successResponse(c, { success: true }, "Whitelist entry permanently deleted");
  }
);
