import type {
  CreateTokenInput,
  UpdateTokenInput,
  RotateTokenInput,
  TokenMetadata,
  TokenWithMetadata,
} from "./telegram-token.repo";
import { TELEGRAM_BOT_TOKENS_GROUP_KEY } from "./telegram-token.repo";
import { getDB } from "@/lib/db-init";
import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";

/**
 * Business logic for telegram token management
 * Implements CRUD operations, token rotation, and Redis caching
 * Uses in-memory cache to minimize DB reads
 */
export class TelegramTokenService {
  private readonly CACHE_TTL = 3600; // 1 hour (data is static, changes infrequent)
  private readonly CACHE_KEY_ALL = "telegram:tokens:all";
  private readonly CACHE_KEY_PREFIX = "telegram:token:";
  private readonly CACHE_KEY_METADATA_SUFFIX = ":metadata";
  private readonly CACHE_KEY_LAST_USED = "telegram:tokens:last_used_id";

  // In-memory cache for active tokens (primary cache layer)
  private tokensInMemory: TokenWithMetadata[] = [];
  private tokensLoadedAt: Date | null = null;

  /**
   * Create a new telegram token
   */
  async createToken(input: CreateTokenInput): Promise<TokenWithMetadata> {
    try {
      const db = getDB();

      const result = await db
        .insertInto("generic_content")
        .values({
          group_key: TELEGRAM_BOT_TOKENS_GROUP_KEY,
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
      await this.refreshTokensCache(); // Refresh in-memory cache

      logger.info(`Created telegram token: ${result.content_key}`);

      return {
        ...result,
        created_at: new Date(result.created_at!),
        updated_at: new Date(result.updated_at!),
        metadata: await this.getMetadata(result.id),
      };
    } catch (error) {
      logger.error("Error creating telegram token:", error);
      throw error;
    }
  }

  /**
   * Load all active tokens into memory
   * This is called on first request or when cache needs refresh
   */
  private async loadTokensToMemory(): Promise<void> {
    try {
      const db = getDB();
      
      const tokens = await db
        .selectFrom("generic_content")
        .selectAll()
        .where("group_key", "=", TELEGRAM_BOT_TOKENS_GROUP_KEY)
        .where("is_active", "is", true)
        .orderBy("id", "asc")
        .execute();

      this.tokensInMemory = await Promise.all(
        tokens.map(async (token) => ({
          ...token,
          created_at: new Date(token.created_at!),
          updated_at: new Date(token.updated_at!),
          metadata: await this.getMetadata(token.id),
        }))
      );

      this.tokensLoadedAt = new Date();
      
      logger.info(`Loaded ${this.tokensInMemory.length} active tokens into memory`);
    } catch (error) {
      logger.error("Error loading tokens to memory:", error);
      throw error;
    }
  }

  /**
   * Refresh in-memory token cache from DB
   * Called after create, update, delete, or ban operations
   */
  private async refreshTokensCache(): Promise<void> {
    await this.loadTokensToMemory();
  }

  /**
   * Check if in-memory cache is empty or needs initialization
   */
  private async ensureTokensLoaded(): Promise<void> {
    if (this.tokensInMemory.length === 0 || !this.tokensLoadedAt) {
      await this.loadTokensToMemory();
    }
  }

  /**
   * Get token by ID (with caching)
   */
  async getTokenById(id: string): Promise<TokenWithMetadata | null> {
    try {
      const redis = getRedis();
      const cacheKey = `${this.CACHE_KEY_PREFIX}${id}`;

      // Try cache first
      if (redis) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const token = JSON.parse(cached);
          return {
            ...token,
            created_at: new Date(token.created_at),
            updated_at: new Date(token.updated_at),
            metadata: await this.getMetadata(id),
          };
        }
      }

      // Fetch from DB
      const db = getDB();
      const token = await db
        .selectFrom("generic_content")
        .selectAll()
        .where("id", "=", id)
        .where("group_key", "=", TELEGRAM_BOT_TOKENS_GROUP_KEY)
        .executeTakeFirst();

      if (!token) {
        return null;
      }

      // Cache the result
      if (redis) {
        await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(token));
      }

      return {
        ...token,
        created_at: new Date(token.created_at!),
        updated_at: new Date(token.updated_at!),
        metadata: await this.getMetadata(id),
      };
    } catch (error) {
      logger.error("Error getting token by ID:", error);
      throw error;
    }
  }

  /**
   * Get all telegram tokens (with caching)
   */
  async getAllTokens(): Promise<TokenWithMetadata[]> {
    try {
      const redis = getRedis();

      // Try cache first
      if (redis) {
        const cached = await redis.get(this.CACHE_KEY_ALL);
        if (cached) {
          const tokens = JSON.parse(cached);
          return Promise.all(
            tokens.map(async (token: any) => ({
              ...token,
              created_at: new Date(token.created_at),
              updated_at: new Date(token.updated_at),
              metadata: await this.getMetadata(token.id),
            }))
          );
        }
      }

      // Fetch from DB
      const db = getDB();
      const tokens = await db
        .selectFrom("generic_content")
        .selectAll()
        .where("group_key", "=", TELEGRAM_BOT_TOKENS_GROUP_KEY)
        .orderBy("created_at", "asc")
        .execute();

      // Cache the result
      if (redis) {
        await redis.setex(
          this.CACHE_KEY_ALL,
          this.CACHE_TTL,
          JSON.stringify(tokens)
        );
      }

      return Promise.all(
        tokens.map(async (token) => ({
          ...token,
          created_at: new Date(token.created_at!),
          updated_at: new Date(token.updated_at!),
          metadata: await this.getMetadata(token.id),
        }))
      );
    } catch (error) {
      logger.error("Error getting all tokens:", error);
      throw error;
    }
  }

  /**
   * Update a telegram token
   */
  async updateToken(
    id: string,
    input: UpdateTokenInput
  ): Promise<TokenWithMetadata | null> {
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
        .where("group_key", "=", TELEGRAM_BOT_TOKENS_GROUP_KEY)
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
      await this.invalidateTokenCache(id);
      await this.refreshTokensCache(); // Refresh in-memory cache

      logger.info(`Updated telegram token: ${result.content_key}`);

      return {
        ...result,
        created_at: new Date(result.created_at!),
        updated_at: new Date(result.updated_at!),
        metadata: await this.getMetadata(id),
      };
    } catch (error) {
      logger.error("Error updating telegram token:", error);
      throw error;
    }
  }

  /**
   * Delete (deactivate) a telegram token
   */
  async deleteToken(id: string): Promise<boolean> {
    try {
      const db = getDB();

      const result = await db
        .updateTable("generic_content")
        .set({ is_active: false })
        .where("id", "=", id)
        .where("group_key", "=", TELEGRAM_BOT_TOKENS_GROUP_KEY)
        .executeTakeFirst();

      if (Number(result.numUpdatedRows) > 0) {
        // Invalidate cache
        await this.invalidateCache();
        await this.invalidateTokenCache(id);
        await this.refreshTokensCache(); // Refresh in-memory cache

        logger.info(`Deleted (deactivated) telegram token: ${id}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Error deleting telegram token:", error);
      throw error;
    }
  }

  /**
   * Get next active token using round-robin logic
   * This is the key method for token rotation
   * Uses in-memory cache to avoid DB reads on every request
   */
  async getNextActiveToken(): Promise<TokenWithMetadata | null> {
    try {
      // Ensure tokens are loaded in memory
      await this.ensureTokensLoaded();

      // Get active tokens from memory
      const activeTokens = this.tokensInMemory.filter(
        (t) => t.is_active === true
      );

      if (activeTokens.length === 0) {
        logger.warn("No active telegram tokens found in memory");
        return null;
      }

      let selectedToken;
      const redis = getRedis();

      // Get last used token ID from Redis
      if (redis) {
        const lastUsedId = await redis.get(this.CACHE_KEY_LAST_USED);

        if (lastUsedId) {
          // Find the index of last used token
          const lastIndex = activeTokens.findIndex((t) => t.id === lastUsedId);

          if (lastIndex !== -1) {
            // Get next token (round-robin)
            const nextIndex = (lastIndex + 1) % activeTokens.length;
            selectedToken = activeTokens[nextIndex];
          } else {
            // Last used token not found (might be inactive), use first
            selectedToken = activeTokens[0];
          }
        } else {
          // No last used token, use first
          selectedToken = activeTokens[0];
        }

        // Save the selected token as last used
        await redis.set(this.CACHE_KEY_LAST_USED, selectedToken.id);
      } else {
        // No Redis, just use first active token
        selectedToken = activeTokens[0];
      }

      // Increment usage
      await this.incrementUsage(selectedToken.id);

      logger.info(`Selected token for use: ${selectedToken.content_key} (from memory cache)`);

      return selectedToken;
    } catch (error) {
      logger.error("Error getting next active token:", error);
      throw error;
    }
  }

  /**
   * Mark a token as banned/inactive
   */
  async markTokenAsBanned(
    tokenId: string,
    input: RotateTokenInput
  ): Promise<boolean> {
    try {
      const db = getDB();

      // Set token as inactive
      const result = await db
        .updateTable("generic_content")
        .set({ is_active: false })
        .where("id", "=", tokenId)
        .where("group_key", "=", TELEGRAM_BOT_TOKENS_GROUP_KEY)
        .executeTakeFirst();

      if (Number(result.numUpdatedRows) > 0) {
        // Update metadata with error message
        await this.updateMetadata(tokenId, {
          error_message: input.error_message || "Token banned/invalid",
        });

        // Invalidate cache
        await this.invalidateCache();
        await this.invalidateTokenCache(tokenId);
        await this.refreshTokensCache(); // Refresh in-memory cache to remove banned token

        logger.warn(
          `Token marked as banned: ${tokenId} - ${input.error_message}`
        );
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Error marking token as banned:", error);
      throw error;
    }
  }

  /**
   * Increment usage count and update last_used_at
   */
  async incrementUsage(tokenId: string): Promise<void> {
    try {
      const metadata = await this.getMetadata(tokenId);
      await this.updateMetadata(tokenId, {
        usage_count: metadata.usage_count + 1,
        last_used_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error incrementing usage:", error);
    }
  }

  /**
   * Get token metadata from Redis
   */
  private async getMetadata(tokenId: string): Promise<TokenMetadata> {
    try {
      const redis = getRedis();
      const metadataKey = `${this.CACHE_KEY_PREFIX}${tokenId}${this.CACHE_KEY_METADATA_SUFFIX}`;

      if (redis) {
        const cached = await redis.get(metadataKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      // Default metadata
      const defaultMetadata: TokenMetadata = {
        usage_count: 0,
        last_used_at: null,
        error_message: null,
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
        error_message: null,
      };
    }
  }

  /**
   * Initialize metadata in Redis
   */
  private async initializeMetadata(tokenId: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    const metadataKey = `${this.CACHE_KEY_PREFIX}${tokenId}${this.CACHE_KEY_METADATA_SUFFIX}`;
    const metadata: TokenMetadata = {
      usage_count: 0,
      last_used_at: null,
      error_message: null,
    };

    await redis.set(metadataKey, JSON.stringify(metadata));
  }

  /**
   * Update metadata in Redis
   */
  private async updateMetadata(
    tokenId: string,
    updates: Partial<TokenMetadata>
  ): Promise<void> {
    try {
      const redis = getRedis();
      if (!redis) return;

      const metadataKey = `${this.CACHE_KEY_PREFIX}${tokenId}${this.CACHE_KEY_METADATA_SUFFIX}`;
      const current = await this.getMetadata(tokenId);
      const updated = { ...current, ...updates };

      await redis.set(metadataKey, JSON.stringify(updated));
    } catch (error) {
      logger.error("Error updating metadata:", error);
    }
  }

  /**
   * Invalidate all tokens cache
   */
  private async invalidateCache(): Promise<void> {
    const redis = getRedis();
    if (redis) {
      await redis.del(this.CACHE_KEY_ALL);
    }
  }

  /**
   * Invalidate specific token cache
   */
  private async invalidateTokenCache(tokenId: string): Promise<void> {
    const redis = getRedis();
    if (redis) {
      const cacheKey = `${this.CACHE_KEY_PREFIX}${tokenId}`;
      await redis.del(cacheKey);
    }
  }

  // ==================== Webhook Management ====================

  /**
   * Get webhook info from Telegram API
   */
  async getWebhookInfo(tokenId: string): Promise<any> {
    try {
      const token = await this.getTokenById(tokenId);
      if (!token || !token.content_value) {
        throw new Error("Token not found");
      }

      const response = await fetch(
        `https://api.telegram.org/bot${token.content_value}/getWebhookInfo`
      );

      const data = (await response.json()) as any;

      if (!data.ok) {
        logger.error(`Failed to get webhook info: ${data.description}`);
        throw new Error(data.description || "Failed to get webhook info");
      }

      logger.info(`Retrieved webhook info for token: ${token.content_key}`);
      return data.result;
    } catch (error) {
      logger.error("Error getting webhook info:", error);
      throw error;
    }
  }

  /**
   * Set webhook URL for a specific token
   */
  async setWebhook(
    tokenId: string,
    webhookUrl: string,
    secretToken?: string
  ): Promise<any> {
    try {
      const token = await this.getTokenById(tokenId);
      if (!token || !token.content_value) {
        throw new Error("Token not found");
      }

      const body: any = { url: webhookUrl };
      if (secretToken) {
        body.secret_token = secretToken;
      }

      const response = await fetch(
        `https://api.telegram.org/bot${token.content_value}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      const data = (await response.json()) as any;

      if (!data.ok) {
        logger.error(`Failed to set webhook: ${data.description}`);
        throw new Error(data.description || "Failed to set webhook");
      }

      logger.info(
        `Set webhook for token: ${token.content_key} -> ${webhookUrl}`
      );
      return data.result;
    } catch (error) {
      logger.error("Error setting webhook:", error);
      throw error;
    }
  }

  /**
   * Delete webhook for a specific token
   */
  async deleteWebhook(tokenId: string): Promise<any> {
    try {
      const token = await this.getTokenById(tokenId);
      if (!token || !token.content_value) {
        throw new Error("Token not found");
      }

      const response = await fetch(
        `https://api.telegram.org/bot${token.content_value}/deleteWebhook`,
        {
          method: "POST",
        }
      );

      const data = (await response.json()) as any;

      if (!data.ok) {
        logger.error(`Failed to delete webhook: ${data.description}`);
        throw new Error(data.description || "Failed to delete webhook");
      }

      logger.info(`Deleted webhook for token: ${token.content_key}`);
      return data.result;
    } catch (error) {
      logger.error("Error deleting webhook:", error);
      throw error;
    }
  }

  /**
   * Set webhook for all active tokens (batch operation)
   */
  async setWebhookBatch(
    webhookUrl: string,
    secretToken?: string
  ): Promise<{ updated: number; failed: number; errors: any[] }> {
    try {
      // Ensure tokens are loaded
      await this.ensureTokensLoaded();

      const activeTokens = this.tokensInMemory.filter((t) => t.is_active);

      logger.info(
        `Setting webhook for ${activeTokens.length} active tokens...`
      );

      const results = await Promise.allSettled(
        activeTokens.map((token) =>
          this.setWebhook(token.id, webhookUrl, secretToken)
        )
      );

      const updated = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      const errors = results
        .filter((r) => r.status === "rejected")
        .map((r: any) => r.reason?.message || "Unknown error");

      logger.info(
        `Batch webhook set complete: ${updated} updated, ${failed} failed`
      );

      return { updated, failed, errors };
    } catch (error) {
      logger.error("Error in batch webhook set:", error);
      throw error;
    }
  }

  /**
   * Get webhook status for all active tokens
   */
  async getWebhookStatusForAllTokens(): Promise<any[]> {
    try {
      // Ensure tokens are loaded
      await this.ensureTokensLoaded();

      const activeTokens = this.tokensInMemory.filter((t) => t.is_active);

      logger.info(
        `Getting webhook status for ${activeTokens.length} active tokens...`
      );

      const results = await Promise.allSettled(
        activeTokens.map(async (token) => {
          try {
            const webhookInfo = await this.getWebhookInfo(token.id);
            return {
              token_id: token.id,
              token_name: token.content_key,
              webhook_info: webhookInfo,
            };
          } catch (error: any) {
            return {
              token_id: token.id,
              token_name: token.content_key,
              webhook_info: null,
              error: error?.message || "Failed to get webhook info",
            };
          }
        })
      );

      return results.map((r) =>
        r.status === "fulfilled" ? r.value : r.reason
      );
    } catch (error) {
      logger.error("Error getting webhook status for all tokens:", error);
      throw error;
    }
  }
}
