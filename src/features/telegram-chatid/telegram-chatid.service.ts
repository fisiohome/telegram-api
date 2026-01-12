import type {
  CreateChatIdInput,
  UpdateChatIdInput,
  ChatIdMetadata,
  ChatIdWithMetadata,
} from "./telegram-chatid.repo";
import { TELEGRAM_CHAT_IDS_GROUP_KEY } from "./telegram-chatid.repo";
import { getDB } from "@/lib/db-init";
import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";

/**
 * Business logic for telegram chat ID management
 * Implements CRUD operations and Redis caching
 */
export class TelegramChatIdService {
  private readonly CACHE_TTL = 3600; // 1 hour (data is static, changes infrequent)
  private readonly CACHE_KEY_ALL = "telegram:chatids:all";
  private readonly CACHE_KEY_PREFIX = "telegram:chatid:";
  private readonly CACHE_KEY_METADATA_SUFFIX = ":metadata";

  /**
   * Create a new telegram chat ID
   */
  async createChatId(input: CreateChatIdInput): Promise<ChatIdWithMetadata> {
    try {
      const db = getDB();

      const result = await db
        .insertInto("generic_content")
        .values({
          group_key: TELEGRAM_CHAT_IDS_GROUP_KEY,
          content_key: input.content_key,
          content_value: input.content_value,
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

      // Initialize metadata in Redis
      await this.initializeMetadata(result.id);

      // Invalidate cache
      await this.invalidateCache();

      logger.info(`Created telegram chat ID: ${result.content_key}`);

      return {
        ...result,
        created_at: new Date(result.created_at!),
        updated_at: new Date(result.updated_at!),
        metadata: await this.getMetadata(result.id),
      };
    } catch (error) {
      logger.error("Error creating telegram chat ID:", error);
      throw error;
    }
  }

  /**
   * Get chat ID by ID (with caching)
   */
  async getChatIdById(id: string): Promise<ChatIdWithMetadata | null> {
    try {
      const redis = getRedis();
      const cacheKey = `${this.CACHE_KEY_PREFIX}${id}`;

      // Try cache first
      if (redis) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const chatId = JSON.parse(cached);
          return {
            ...chatId,
            created_at: new Date(chatId.created_at),
            updated_at: new Date(chatId.updated_at),
            metadata: await this.getMetadata(id),
          };
        }
      }

      // Fetch from DB
      const db = getDB();
      const chatId = await db
        .selectFrom("generic_content")
        .selectAll()
        .where("id", "=", id)
        .where("group_key", "=", TELEGRAM_CHAT_IDS_GROUP_KEY)
        .executeTakeFirst();

      if (!chatId) {
        return null;
      }

      // Cache the result
      if (redis) {
        await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(chatId));
      }

      return {
        ...chatId,
        created_at: new Date(chatId.created_at!),
        updated_at: new Date(chatId.updated_at!),
        metadata: await this.getMetadata(id),
      };
    } catch (error) {
      logger.error("Error getting chat ID by ID:", error);
      throw error;
    }
  }

  /**
   * Get chat ID by content_key (for easy lookup)
   */
  async getChatIdByKey(key: string): Promise<ChatIdWithMetadata | null> {
    try {
      const db = getDB();
      const chatId = await db
        .selectFrom("generic_content")
        .selectAll()
        .where("group_key", "=", TELEGRAM_CHAT_IDS_GROUP_KEY)
        .where("content_key", "=", key)
        .where("is_active", "is", true)
        .executeTakeFirst();

      if (!chatId) {
        return null;
      }

      return {
        ...chatId,
        created_at: new Date(chatId.created_at!),
        updated_at: new Date(chatId.updated_at!),
        metadata: await this.getMetadata(chatId.id),
      };
    } catch (error) {
      logger.error("Error getting chat ID by key:", error);
      throw error;
    }
  }

  /**
   * Get chat ID by content_value (for duplicate check)
   * Check if a chat_id already exists regardless of the key
   */
  async getChatIdByValue(value: string): Promise<ChatIdWithMetadata | null> {
    try {
      const db = getDB();
      const chatId = await db
        .selectFrom("generic_content")
        .selectAll()
        .where("group_key", "=", TELEGRAM_CHAT_IDS_GROUP_KEY)
        .where("content_value", "=", value)
        .where("is_active", "is", true)
        .executeTakeFirst();

      if (!chatId) {
        return null;
      }

      return {
        ...chatId,
        created_at: new Date(chatId.created_at!),
        updated_at: new Date(chatId.updated_at!),
        metadata: await this.getMetadata(chatId.id),
      };
    } catch (error) {
      logger.error("Error getting chat ID by value:", error);
      throw error;
    }
  }

  /**
   * Get all telegram chat IDs (with caching)
   */
  async getAllChatIds(): Promise<ChatIdWithMetadata[]> {
    try {
      const redis = getRedis();

      // Try cache first
      if (redis) {
        const cached = await redis.get(this.CACHE_KEY_ALL);
        if (cached) {
          const chatIds = JSON.parse(cached);
          return Promise.all(
            chatIds.map(async (chatId: any) => ({
              ...chatId,
              created_at: new Date(chatId.created_at),
              updated_at: new Date(chatId.updated_at),
              metadata: await this.getMetadata(chatId.id),
            }))
          );
        }
      }

      // Fetch from DB
      const db = getDB();
      const chatIds = await db
        .selectFrom("generic_content")
        .selectAll()
        .where("group_key", "=", TELEGRAM_CHAT_IDS_GROUP_KEY)
        .orderBy("created_at", "asc")
        .execute();

      // Cache the result
      if (redis) {
        await redis.setex(
          this.CACHE_KEY_ALL,
          this.CACHE_TTL,
          JSON.stringify(chatIds)
        );
      }

      return Promise.all(
        chatIds.map(async (chatId) => ({
          ...chatId,
          created_at: new Date(chatId.created_at!),
          updated_at: new Date(chatId.updated_at!),
          metadata: await this.getMetadata(chatId.id),
        }))
      );
    } catch (error) {
      logger.error("Error getting all chat IDs:", error);
      throw error;
    }
  }

  /**
   * Update a telegram chat ID
   */
  async updateChatId(
    id: string,
    input: UpdateChatIdInput
  ): Promise<ChatIdWithMetadata | null> {
    try {
      const db = getDB();

      const result = await db
        .updateTable("generic_content")
        .set({
          ...(input.content_key && { content_key: input.content_key }),
          ...(input.content_value && { content_value: input.content_value }),
          ...(input.is_active !== undefined && { is_active: input.is_active }),
        })
        .where("id", "=", id)
        .where("group_key", "=", TELEGRAM_CHAT_IDS_GROUP_KEY)
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

      // Invalidate cache
      await this.invalidateCache();
      await this.invalidateChatIdCache(id);

      logger.info(`Updated telegram chat ID: ${result.content_key}`);

      return {
        ...result,
        created_at: new Date(result.created_at!),
        updated_at: new Date(result.updated_at!),
        metadata: await this.getMetadata(id),
      };
    } catch (error) {
      logger.error("Error updating telegram chat ID:", error);
      throw error;
    }
  }

  /**
   * Delete (deactivate) a telegram chat ID
   */
  async deleteChatId(id: string): Promise<boolean> {
    try {
      const db = getDB();

      const result = await db
        .updateTable("generic_content")
        .set({ is_active: false })
        .where("id", "=", id)
        .where("group_key", "=", TELEGRAM_CHAT_IDS_GROUP_KEY)
        .executeTakeFirst();

      if (Number(result.numUpdatedRows) > 0) {
        // Invalidate cache
        await this.invalidateCache();
        await this.invalidateChatIdCache(id);

        logger.info(`Deleted (deactivated) telegram chat ID: ${id}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Error deleting telegram chat ID:", error);
      throw error;
    }
  }

  /**
   * Unpublish (deactivate) a chat ID
   */
  async unpublishChatId(id: string): Promise<boolean> {
    try {
      const db = getDB();

      const result = await db
        .updateTable("generic_content")
        .set({ is_active: false })
        .where("id", "=", id)
        .where("group_key", "=", TELEGRAM_CHAT_IDS_GROUP_KEY)
        .executeTakeFirst();

      if (Number(result.numUpdatedRows) > 0) {
        await this.invalidateCache();
        await this.invalidateChatIdCache(id);
        logger.info(`Unpublished (deactivated) chat ID: ${id}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Error unpublishing chat ID:", error);
      throw error;
    }
  }

  /**
   * Publish (activate) a chat ID
   */
  async publishChatId(id: string): Promise<boolean> {
    try {
      const db = getDB();

      const result = await db
        .updateTable("generic_content")
        .set({ is_active: true })
        .where("id", "=", id)
        .where("group_key", "=", TELEGRAM_CHAT_IDS_GROUP_KEY)
        .executeTakeFirst();

      if (Number(result.numUpdatedRows) > 0) {
        await this.invalidateCache();
        await this.invalidateChatIdCache(id);
        logger.info(`Published (activated) chat ID: ${id}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Error publishing chat ID:", error);
      throw error;
    }
  }

  /**
   * Hard delete (permanently remove) a chat ID
   */
  async hardDeleteChatId(id: string): Promise<boolean> {
    try {
      const db = getDB();

      const result = await db
        .deleteFrom("generic_content")
        .where("id", "=", id)
        .where("group_key", "=", TELEGRAM_CHAT_IDS_GROUP_KEY)
        .executeTakeFirst();

      if (Number(result.numDeletedRows) > 0) {
        await this.invalidateCache();
        await this.invalidateChatIdCache(id);
        logger.info(`Hard deleted chat ID: ${id}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Error hard deleting chat ID:", error);
      throw error;
    }
  }

  /**
   * Increment usage count and update last_used_at
   */
  async incrementUsage(chatIdId: string): Promise<void> {
    try {
      const metadata = await this.getMetadata(chatIdId);
      await this.updateMetadata(chatIdId, {
        usage_count: metadata.usage_count + 1,
        last_used_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error incrementing usage:", error);
    }
  }

  /**
   * Get chat ID metadata from Redis
   */
  private async getMetadata(chatIdId: string): Promise<ChatIdMetadata> {
    try {
      const redis = getRedis();
      const metadataKey = `${this.CACHE_KEY_PREFIX}${chatIdId}${this.CACHE_KEY_METADATA_SUFFIX}`;

      if (redis) {
        const cached = await redis.get(metadataKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      // Default metadata
      const defaultMetadata: ChatIdMetadata = {
        usage_count: 0,
        last_used_at: null,
      };

      // Cache default metadata
      if (redis) {
        await redis.set(metadataKey, JSON.stringify(defaultMetadata));
      }

      return defaultMetadata;
    } catch (error) {
      logger.error("Error getting metadata:", error);
      return {
        usage_count: 0,
        last_used_at: null,
      };
    }
  }

  /**
   * Initialize metadata in Redis
   */
  private async initializeMetadata(chatIdId: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    const metadataKey = `${this.CACHE_KEY_PREFIX}${chatIdId}${this.CACHE_KEY_METADATA_SUFFIX}`;
    const metadata: ChatIdMetadata = {
      usage_count: 0,
      last_used_at: null,
    };

    await redis.set(metadataKey, JSON.stringify(metadata));
  }

  /**
   * Update metadata in Redis
   */
  private async updateMetadata(
    chatIdId: string,
    updates: Partial<ChatIdMetadata>
  ): Promise<void> {
    try {
      const redis = getRedis();
      if (!redis) return;

      const metadataKey = `${this.CACHE_KEY_PREFIX}${chatIdId}${this.CACHE_KEY_METADATA_SUFFIX}`;
      const current = await this.getMetadata(chatIdId);
      const updated = { ...current, ...updates };

      await redis.set(metadataKey, JSON.stringify(updated));
    } catch (error) {
      logger.error("Error updating metadata:", error);
    }
  }

  /**
   * Invalidate all chat IDs cache
   */
  private async invalidateCache(): Promise<void> {
    const redis = getRedis();
    if (redis) {
      await redis.del(this.CACHE_KEY_ALL);
    }
  }

  /**
   * Invalidate specific chat ID cache
   */
  private async invalidateChatIdCache(chatIdId: string): Promise<void> {
    const redis = getRedis();
    if (redis) {
      const cacheKey = `${this.CACHE_KEY_PREFIX}${chatIdId}`;
      await redis.del(cacheKey);
    }
  }
}
