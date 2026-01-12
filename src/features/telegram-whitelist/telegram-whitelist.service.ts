import type {
  CreateWhitelistInput,
  UpdateWhitelistInput,
  WhitelistEntry,
} from "./telegram-whitelist.repo";
import { TELEGRAM_COMMAND_WHITELIST_GROUP_KEY } from "./telegram-whitelist.repo";
import { getDB } from "@/lib/db-init";
import { logger } from "@/lib/logger";

/**
 * Business logic for telegram whitelist management
 * Implements CRUD operations for command access control
 */
export class TelegramWhitelistService {
  /**
   * Create a new whitelist entry
   */
  async createWhitelistEntry(input: CreateWhitelistInput): Promise<WhitelistEntry> {
    try {
      const db = getDB();

      const result = await db
        .insertInto("generic_content")
        .values({
          group_key: TELEGRAM_COMMAND_WHITELIST_GROUP_KEY,
          content_key: input.content_key,
          content_value: input.content_value || "",
          is_active: input.is_active,
        })
        .returning([
          "id",
          "content_key",
          "content_value",
          "is_active",
          "created_at",
          "updated_at",
        ])
        .executeTakeFirstOrThrow();

      logger.info(`Created whitelist entry: ${result.content_key}`);

      return {
        ...result,
        created_at: new Date(result.created_at!),
        updated_at: new Date(result.updated_at!),
      };
    } catch (error) {
      logger.error("Error creating whitelist entry:", error);
      throw error;
    }
  }

  /**
   * Get whitelist entry by ID
   */
  async getWhitelistEntryById(id: string): Promise<WhitelistEntry | null> {
    try {
      const db = getDB();
      const entry = await db
        .selectFrom("generic_content")
        .selectAll()
        .where("id", "=", id)
        .where("group_key", "=", TELEGRAM_COMMAND_WHITELIST_GROUP_KEY)
        .executeTakeFirst();

      if (!entry) {
        return null;
      }

      return {
        ...entry,
        created_at: new Date(entry.created_at!),
        updated_at: new Date(entry.updated_at!),
      };
    } catch (error) {
      logger.error("Error getting whitelist entry by ID:", error);
      throw error;
    }
  }

  /**
   * Get whitelist entry by key (user identifier)
   */
  async getWhitelistEntryByKey(key: string): Promise<WhitelistEntry | null> {
    try {
      const db = getDB();
      const entry = await db
        .selectFrom("generic_content")
        .selectAll()
        .where("group_key", "=", TELEGRAM_COMMAND_WHITELIST_GROUP_KEY)
        .where("content_key", "=", key)
        .where("is_active", "is", true)
        .executeTakeFirst();

      if (!entry) {
        return null;
      }

      return {
        ...entry,
        created_at: new Date(entry.created_at!),
        updated_at: new Date(entry.updated_at!),
      };
    } catch (error) {
      logger.error("Error getting whitelist entry by key:", error);
      throw error;
    }
  }

  /**
   * Get all whitelist entries
   */
  async getAllWhitelistEntries(): Promise<WhitelistEntry[]> {
    try {
      const db = getDB();
      const entries = await db
        .selectFrom("generic_content")
        .selectAll()
        .where("group_key", "=", TELEGRAM_COMMAND_WHITELIST_GROUP_KEY)
        .orderBy("created_at", "asc")
        .execute();

      return entries.map((entry) => ({
        ...entry,
        created_at: new Date(entry.created_at!),
        updated_at: new Date(entry.updated_at!),
      }));
    } catch (error) {
      logger.error("Error getting all whitelist entries:", error);
      throw error;
    }
  }

  /**
   * Update a whitelist entry
   */
  async updateWhitelistEntry(
    id: string,
    input: UpdateWhitelistInput
  ): Promise<WhitelistEntry | null> {
    try {
      const db = getDB();

      const result = await db
        .updateTable("generic_content")
        .set({
          ...(input.content_key && { content_key: input.content_key }),
          ...(input.content_value !== undefined && { content_value: input.content_value }),
          ...(input.is_active !== undefined && { is_active: input.is_active }),
        })
        .where("id", "=", id)
        .where("group_key", "=", TELEGRAM_COMMAND_WHITELIST_GROUP_KEY)
        .returning([
          "id",
          "content_key",
          "content_value",
          "is_active",
          "created_at",
          "updated_at",
        ])
        .executeTakeFirst();

      if (!result) {
        return null;
      }

      logger.info(`Updated whitelist entry: ${result.content_key}`);

      return {
        ...result,
        created_at: new Date(result.created_at!),
        updated_at: new Date(result.updated_at!),
      };
    } catch (error) {
      logger.error("Error updating whitelist entry:", error);
      throw error;
    }
  }

  /**
   * Delete (deactivate) a whitelist entry
   */
  async deleteWhitelistEntry(id: string): Promise<boolean> {
    try {
      const db = getDB();

      const result = await db
        .updateTable("generic_content")
        .set({ is_active: false })
        .where("id", "=", id)
        .where("group_key", "=", TELEGRAM_COMMAND_WHITELIST_GROUP_KEY)
        .executeTakeFirst();

      if (Number(result.numUpdatedRows) > 0) {
        logger.info(`Deleted (deactivated) whitelist entry: ${id}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Error deleting whitelist entry:", error);
      throw error;
    }
  }

  /**
   * Unpublish (deactivate) a whitelist entry
   */
  async unpublishWhitelistEntry(id: string): Promise<boolean> {
    try {
      const db = getDB();

      const result = await db
        .updateTable("generic_content")
        .set({ is_active: false })
        .where("id", "=", id)
        .where("group_key", "=", TELEGRAM_COMMAND_WHITELIST_GROUP_KEY)
        .executeTakeFirst();

      if (Number(result.numUpdatedRows) > 0) {
        logger.info(`Unpublished (deactivated) whitelist entry: ${id}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Error unpublishing whitelist entry:", error);
      throw error;
    }
  }

  /**
   * Publish (activate) a whitelist entry
   */
  async publishWhitelistEntry(id: string): Promise<boolean> {
    try {
      const db = getDB();

      const result = await db
        .updateTable("generic_content")
        .set({ is_active: true })
        .where("id", "=", id)
        .where("group_key", "=", TELEGRAM_COMMAND_WHITELIST_GROUP_KEY)
        .executeTakeFirst();

      if (Number(result.numUpdatedRows) > 0) {
        logger.info(`Published (activated) whitelist entry: ${id}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Error publishing whitelist entry:", error);
      throw error;
    }
  }

  /**
   * Hard delete (permanently remove) a whitelist entry
   */
  async hardDeleteWhitelistEntry(id: string): Promise<boolean> {
    try {
      const db = getDB();

      const result = await db
        .deleteFrom("generic_content")
        .where("id", "=", id)
        .where("group_key", "=", TELEGRAM_COMMAND_WHITELIST_GROUP_KEY)
        .executeTakeFirst();

      if (Number(result.numDeletedRows) > 0) {
        logger.info(`Hard deleted whitelist entry: ${id}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Error hard deleting whitelist entry:", error);
      throw error;
    }
  }

  /**
   * Check if user is whitelisted
   * Supports both user ID and @username formats
   */
  async isUserWhitelisted(identifier: string): Promise<boolean> {
    try {
      const db = getDB();
      
      // Normalize identifier (remove @ if present)
      const normalizedId = identifier.toLowerCase().replace(/^@/, "");
      const withAt = `@${normalizedId}`;

      const entry = await db
        .selectFrom("generic_content")
        .select("id")
        .where("group_key", "=", TELEGRAM_COMMAND_WHITELIST_GROUP_KEY)
        .where("is_active", "is", true)
        .where((eb) =>
          eb.or([
            eb("content_key", "=", identifier),
            eb("content_key", "=", normalizedId),
            eb("content_key", "=", withAt),
          ])
        )
        .executeTakeFirst();

      return !!entry;
    } catch (error) {
      logger.error("Error checking whitelist:", error);
      return false;
    }
  }
}
