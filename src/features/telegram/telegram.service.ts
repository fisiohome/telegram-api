import type {
  SendMessageInput,
  SendTelegramInput,
  SendBulkMessageInput,
} from "./telegram.repo";
import type { CommandResponse } from "@/features/telegram-commands";
import {
  pendingConfirmations,
  parseCallbackData,
  registerChatIdForEmployee,
} from "@/features/telegram-commands/start.command";
import { randomUUID } from "crypto";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { TelegramTokenService } from "@/features/telegram-token";
import { commandRegistry } from "@/features/telegram-commands";
import {
  TELEGRAM_BROADCAST_TOKEN_KEYS,
  type TelegramBroadcastType,
} from "@/lib/constants";

/**
 * Business logic for telegram feature
 * Updated to use DB tokens (primary) with `ENV` fallback
 */

// ==================== Broadcast Job Tracker ====================

export type BroadcastJobStatus = "pending" | "running" | "done" | "failed";

export interface BroadcastJob {
  id: string;
  status: BroadcastJobStatus;
  total: number;
  sent: number;
  failed: number;
  errors: Array<{ chat_id: string; error: string }>;
  startedAt: Date;
  finishedAt?: Date;
  /** Snapshot of per-message results (only available after done) */
  results?: Array<{ success: boolean; chat_id: string; error?: string }>;
}

/** In-memory store. Cukup untuk use-case ini; bersih saat server restart. */
const broadcastJobs = new Map<string, BroadcastJob>();

// ==================== Broadcast Config ====================

const BROADCAST_CONFIG = {
  /** Delay (ms) between each individual message to respect Telegram rate limits */
  MESSAGE_DELAY_MS: 50,
  /** Number of messages per batch before taking a longer pause */
  BATCH_SIZE: 20,
  /** Delay (ms) after completing a batch (anti-flood cooldown) */
  BATCH_PAUSE_MS: 1_000,
  /** Extra backoff (ms) when Telegram returns a 429 Too Many Requests */
  RATE_LIMIT_BACKOFF_MS: 5_000,
} as const;

// ==================== TelegramService ====================

export class TelegramService {
  private botToken: string | null = null;
  private tokenService: TelegramTokenService;
  private currentTokenId: string | null = null;
  private readonly MAX_RETRIES = 3;

  constructor(botToken?: string) {
    // Optional token for backward compatibility
    this.botToken = botToken || null;
    this.tokenService = new TelegramTokenService();
  }

  /**
   * Get active bot token
   * Priority: DB tokens (with rotation) -> ENV token
   */
  private async getActiveToken(): Promise<{
    token: string;
    tokenId: string | null;
  }> {
    try {
      // Try to get token from DB first
      const dbToken = await this.tokenService.getNextActiveToken();

      if (dbToken && dbToken.content_value) {
        this.currentTokenId = dbToken.id;
        return {
          token: dbToken.content_value,
          tokenId: dbToken.id,
        };
      }

      // Fallback to ENV token
      logger.info("No DB tokens available, using ENV token as fallback");
      this.currentTokenId = null;
      return {
        token: this.botToken || env.TELEGRAM_BOT_TOKEN || "",
        tokenId: null,
      };
    } catch (error) {
      logger.error("Error getting active token, falling back to ENV:", error);
      this.currentTokenId = null;
      return {
        token: this.botToken || env.TELEGRAM_BOT_TOKEN || "",
        tokenId: null,
      };
    }
  }

  /**
   * Check if error indicates a banned/invalid token
   */
  private isBannedTokenError(error: any): boolean {
    const errorMessage = error?.message || error?.description || String(error);
    const bannedKeywords = [
      "Forbidden",
      "Unauthorized",
      "bot was blocked",
      "bot was kicked",
      "token is invalid",
      "Not Found", // Invalid bot token
    ];

    return bannedKeywords.some((keyword) =>
      errorMessage.toLowerCase().includes(keyword.toLowerCase()),
    );
  }

  /**
   * Send message with the rolling/rotation token mechanism (default behaviour).
   */
  async sendMessage(input: SendMessageInput) {
    return this.sendMessageWithToken(input);
  }

  /**
   * Internal: send a single message.
   * When `overrideToken` is provided the rotation logic is bypassed entirely —
   * the caller is responsible for choosing the right token.
   */
  private async sendMessageWithToken(
    input: SendMessageInput,
    overrideToken?: string,
  ) {
    let lastError: any = null;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        let token: string;
        let tokenId: string | null;

        if (overrideToken) {
          // Dedicated token — skip rotation
          token = overrideToken;
          tokenId = null;
        } else {
          const active = await this.getActiveToken();
          token = active.token;
          tokenId = active.tokenId;
        }

        if (!token) {
          throw new Error("No bot token available");
        }

        const url = `https://api.telegram.org/bot${token}/sendMessage`;

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: input.chat_id,
            text: input.message,
            parse_mode: input.parse_mode || "HTML",
          }),
        });

        const data = (await response.json()) as any;

        if (!response.ok) {
          const error = new Error(data.description || "Failed to send message");

          // Only auto-rotate when using pool token (not a dedicated override)
          if (!overrideToken && tokenId && this.isBannedTokenError(data)) {
            logger.warn(
              `Token ${tokenId} appears to be banned, marking as inactive`,
            );
            await this.tokenService.markTokenAsBanned(tokenId, {
              error_message: data.description || "Token banned/invalid",
            });
            lastError = error;
            continue;
          }

          throw error;
        }

        logger.info(`Message sent to chat ${input.chat_id}`);
        return data;
      } catch (error) {
        logger.error(
          `Error sending telegram message (attempt ${attempt + 1}/${this.MAX_RETRIES}):`,
          error,
        );
        lastError = error;
        if (!this.isBannedTokenError(error)) {
          throw error;
        }
      }
    }

    throw lastError || new Error("Failed to send message after retries");
  }

  /**
   * Helper: sleep for given milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if the Telegram error indicates rate limiting (HTTP 429)
   */
  private isRateLimitError(error: any): boolean {
    const msg = error?.message || error?.description || String(error);
    return (
      msg.includes("Too Many Requests") ||
      msg.includes("retry after") ||
      msg.includes("429")
    );
  }

  /**
   * Create a broadcast job using the rolling token pool (default).
   * Returns the job ID immediately — processing runs in the background.
   */
  startBroadcast(inputs: SendBulkMessageInput): string {
    return this.createBroadcastJob(inputs);
  }

  /**
   * Create a broadcast job using a dedicated bot token for a specific type.
   *
   * - If `type` is provided → resolve the dedicated token from DB by content_key.
   *   If that token is not found / inactive, falls back to the rolling pool.
   * - If `type` is omitted → same as startBroadcast() (rolling pool).
   *
   * @param inputs  Array of messages to send
   * @param type    Optional broadcast type: 'REMINDER' | 'ANNOUNCEMENT'
   */
  async startBroadcastByType(
    inputs: SendBulkMessageInput,
    type?: TelegramBroadcastType,
  ): Promise<string> {
    let overrideToken: string | undefined;

    if (type) {
      const contentKey = TELEGRAM_BROADCAST_TOKEN_KEYS[type];
      const dedicatedToken =
        await this.tokenService.getTokenByContentKey(contentKey);

      if (dedicatedToken?.content_value) {
        overrideToken = dedicatedToken.content_value;
        logger.info(
          `[Broadcast] Using dedicated token for type=${type} (${contentKey})`,
        );
      } else {
        logger.warn(
          `[Broadcast] Dedicated token for type=${type} not found, falling back to rolling pool`,
        );
      }
    }

    return this.createBroadcastJob(inputs, overrideToken);
  }

  /**
   * Internal: create + enqueue a broadcast job.
   * @param overrideToken  When set, every message in this job uses this token.
   */
  private createBroadcastJob(
    inputs: SendBulkMessageInput,
    overrideToken?: string,
  ): string {
    const jobId = randomUUID();
    const job: BroadcastJob = {
      id: jobId,
      status: "pending",
      total: inputs.length,
      sent: 0,
      failed: 0,
      errors: [],
      startedAt: new Date(),
    };
    broadcastJobs.set(jobId, job);

    // Kick off background processing — intentionally NOT awaited
    this.processBroadcast(job, inputs, overrideToken).catch((err) => {
      logger.error(`[Broadcast ${jobId}] Unexpected crash:`, err);
      job.status = "failed";
      job.finishedAt = new Date();
    });

    logger.info(
      `[Broadcast ${jobId}] Queued ${inputs.length} messages in background` +
        (overrideToken ? " (dedicated token)" : " (rolling pool)"),
    );
    return jobId;
  }

  /**
   * Internal: runs the actual broadcast with anti-ban strategy
   *
   * Strategy:
   *  1. Process messages one-by-one (sequential, not concurrent) to stay
   *     well within Telegram's 30 msg/s global limit.
   *  2. Wait MESSAGE_DELAY_MS between every message (~20 msg/s safe pace).
   *  3. Every BATCH_SIZE messages take a BATCH_PAUSE_MS break (anti-flood).
   *  4. On 429 Too Many Requests → back off RATE_LIMIT_BACKOFF_MS and retry
   *     the same message once before giving up.
   */
  private async processBroadcast(
    job: BroadcastJob,
    inputs: SendBulkMessageInput,
    overrideToken?: string,
  ): Promise<void> {
    job.status = "running";
    const results: BroadcastJob["results"] = [];

    logger.info(
      `[Broadcast ${job.id}] Starting — ${inputs.length} recipients | ` +
        `batch=${BROADCAST_CONFIG.BATCH_SIZE} | ` +
        `delay=${BROADCAST_CONFIG.MESSAGE_DELAY_MS}ms | ` +
        `batchPause=${BROADCAST_CONFIG.BATCH_PAUSE_MS}ms`,
    );

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];

      try {
        await this.sendMessageWithToken(input, overrideToken);
        job.sent++;
        results.push({ success: true, chat_id: input.chat_id });
        logger.debug(
          `[Broadcast ${job.id}] ✓ ${i + 1}/${inputs.length} → ${input.chat_id}`,
        );
      } catch (err: any) {
        // On rate limit: back off and retry once
        if (this.isRateLimitError(err)) {
          logger.warn(
            `[Broadcast ${job.id}] Rate limited at msg ${i + 1}, backing off ${BROADCAST_CONFIG.RATE_LIMIT_BACKOFF_MS}ms…`,
          );
          await this.sleep(BROADCAST_CONFIG.RATE_LIMIT_BACKOFF_MS);
          try {
            await this.sendMessage(input);
            job.sent++;
            results.push({ success: true, chat_id: input.chat_id });
            logger.debug(
              `[Broadcast ${job.id}] ✓ (retry) ${i + 1}/${inputs.length} → ${input.chat_id}`,
            );
          } catch (retryErr: any) {
            job.failed++;
            const errMsg = retryErr?.message || String(retryErr);
            job.errors.push({ chat_id: input.chat_id, error: errMsg });
            results.push({
              success: false,
              chat_id: input.chat_id,
              error: errMsg,
            });
            logger.error(
              `[Broadcast ${job.id}] ✗ (retry failed) ${i + 1}/${inputs.length} → ${input.chat_id}: ${errMsg}`,
            );
          }
        } else {
          job.failed++;
          const errMsg = err?.message || String(err);
          job.errors.push({ chat_id: input.chat_id, error: errMsg });
          results.push({
            success: false,
            chat_id: input.chat_id,
            error: errMsg,
          });
          logger.error(
            `[Broadcast ${job.id}] ✗ ${i + 1}/${inputs.length} → ${input.chat_id}: ${errMsg}`,
          );
        }
      }

      const isLast = i === inputs.length - 1;

      if (!isLast) {
        // Pause between every batch to give Telegram a breather
        const isEndOfBatch = (i + 1) % BROADCAST_CONFIG.BATCH_SIZE === 0;

        if (isEndOfBatch) {
          logger.info(
            `[Broadcast ${job.id}] Batch of ${BROADCAST_CONFIG.BATCH_SIZE} done (${i + 1}/${inputs.length}), pausing ${BROADCAST_CONFIG.BATCH_PAUSE_MS}ms…`,
          );
          await this.sleep(BROADCAST_CONFIG.BATCH_PAUSE_MS);
        } else {
          // Short per-message delay
          await this.sleep(BROADCAST_CONFIG.MESSAGE_DELAY_MS);
        }
      }
    }

    job.status = "done";
    job.finishedAt = new Date();
    job.results = results;

    const durationSec = (
      (job.finishedAt.getTime() - job.startedAt.getTime()) /
      1000
    ).toFixed(1);

    logger.info(
      `[Broadcast ${job.id}] Finished — sent=${job.sent} failed=${job.failed} duration=${durationSec}s`,
    );
  }

  /**
   * Get current status of a broadcast job.
   * Returns undefined if the job ID is unknown.
   */
  getBroadcastJob(jobId: string): BroadcastJob | undefined {
    return broadcastJobs.get(jobId);
  }

  /**
   * @deprecated Use startBroadcast() for large broadcasts.
   * Kept for small/internal use where caller needs to await results.
   */
  async sendBulkMessages(inputs: SendBulkMessageInput) {
    const results = [];
    for (const input of inputs) {
      try {
        const result = await this.sendMessage(input);
        results.push({ success: true, chat_id: input.chat_id, result });
      } catch (error: any) {
        logger.error(`Failed to send bulk message to ${input.chat_id}:`, error);
        results.push({
          success: false,
          chat_id: input.chat_id,
          error: error.message || String(error),
        });
      }
    }
    return results;
  }

  /**
   * Send telegram notification with automatic token rotation and retry
   */
  async sendTelegram(input: SendTelegramInput) {
    let lastError: any = null;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const { token, tokenId } = await this.getActiveToken();

        if (!token) {
          throw new Error("No bot token available");
        }

        // Prepare mentions
        const mentions = [...(input.mentions || [])];
        if (env.TELEGRAM_ADMIN && !mentions.includes(env.TELEGRAM_ADMIN)) {
          mentions.push(env.TELEGRAM_ADMIN);
        }
        const adminContact = mentions.length ? `(${mentions.join(", ")})` : "";

        const message = this.formatPatientMessage(input, adminContact);

        const url = `https://api.telegram.org/bot${token}/sendMessage`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: input.chat_id,
            text: message,
            parse_mode: "Markdown",
          }),
        });

        const data = (await response.json()) as any;

        if (!response.ok) {
          const error = new Error(
            data.description || "Failed to send telegram message",
          );

          // Check if token is banned
          if (tokenId && this.isBannedTokenError(data)) {
            logger.warn(
              `Token ${tokenId} appears to be banned, marking as inactive`,
            );
            await this.tokenService.markTokenAsBanned(tokenId, {
              error_message: data.description || "Token banned/invalid",
            });

            // Retry with next token
            lastError = error;
            continue;
          }

          throw error;
        }

        logger.info(`Patient notification sent to chat ${input.chat_id}`);
        return data;
      } catch (error) {
        logger.error(
          `Error sending telegram notification (attempt ${attempt + 1}/${this.MAX_RETRIES}):`,
          error,
        );
        lastError = error;

        // If it's not a banned token error, don't retry
        if (!this.isBannedTokenError(error)) {
          throw error;
        }
      }
    }

    // All retries failed
    throw (
      lastError || new Error("Failed to send telegram message after retries")
    );
  }

  async getMe() {
    try {
      const { token } = await this.getActiveToken();

      if (!token) {
        throw new Error("No bot token available");
      }

      const url = `https://api.telegram.org/bot${token}/getMe`;
      const response = await fetch(url);
      const data = (await response.json()) as any;

      if (!response.ok) {
        throw new Error(data.description || "Failed to get bot info");
      }

      return data.result;
    } catch (error) {
      logger.error("Error getting bot info:", error);
      throw error;
    }
  }

  /**
   * Sync registered commands to Telegram Bot API
   */
  async syncCommands() {
    try {
      const { token } = await this.getActiveToken();

      if (!token) {
        throw new Error("No bot token available");
      }

      // Format commands for Telegram API (only command and description)
      const commands = commandRegistry.map((cmd) => ({
        command: cmd.command,
        description: cmd.description,
      }));

      const url = `https://api.telegram.org/bot${token}/setMyCommands`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          commands,
        }),
      });

      const data = (await response.json()) as any;

      if (!response.ok) {
        throw new Error(data.description || "Failed to sync commands");
      }

      logger.info(
        `Successfully synced ${commands.length} commands to Telegram`,
      );
      return data;
    } catch (error) {
      logger.error("Error syncing commands:", error);
      throw error;
    }
  }

  private formatPatientMessage(
    input: SendTelegramInput,
    adminContact: string,
  ): string {
    let message = "";

    // Gunakan \n (satu backslash) untuk enter
    message += `🩺 *INFORMASI PASIEN*\n\n`;
    message += `*KODE PASIEN* : ${input.kode_pasien}\n`;
    message += `*Request Gender* : ${input.gender_req}\n`;
    message += `*Usia* : ${input.usia} tahun\n`;
    message += `*Jenis Kelamin* : ${input.jenis_kelamin}\n\n`;

    message += `*Keluhan*\n${input.keluhan}\n\n`;
    message += `*Durasi Keluhan*\n${input.durasi}\n\n`;
    message += `*Kondisi Pasien*\n${input.kondisi}\n\n`;
    message += `*Riwayat Penyakit*\n${input.riwayat}\n\n`;
    message += `*Alamat Lengkap*\n${input.alamat}\n\n`;
    message += `*Request Layanan*\n${input.visit}\n\n`;
    message += `*Rencana Kunjungan*\n${input.jadwal}\n\n`;

    message += `────────────────────\n`;
    message += `🙏 *Informasi untuk Tim Fisioterapis*\n`;
    message += `Apabila berkenan menangani pasien di atas, silakan hubungi admin ${adminContact} melalui *personal chat* dengan menyertakan *KODE PASIEN* serta opsi jadwal kunjungan alternatif.`;

    return message;
  }

  // ==================== Webhook Handler ====================

  /**
   * Parse command from message text
   * Returns { command, args } or null if not a command
   */
  private parseCommand(
    text: string,
  ): { command: string; args: string[] } | null {
    const trimmed = text.trim();
    if (!trimmed.startsWith("/")) {
      return null;
    }

    const parts = trimmed.substring(1).split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    return { command, args };
  }

  /**
   * Main webhook handler
   * Processes incoming updates from Telegram
   */
  async handleWebhook(update: any): Promise<void> {
    try {
      // ── Callback query (inline keyboard button press) ────────────────
      if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query);
        return;
      }

      // ── Regular message ──────────────────────────────────────────────
      const message = update.message;
      if (!message || !message.text) {
        logger.debug("Update does not contain a text message, ignoring");
        return;
      }

      const chatId = String(message.chat.id);
      const text = message.text;

      // Extract user info
      const user = message.from;
      const userId = user?.id;
      const username = user?.username || "no_username";
      const firstName = user?.first_name || "Unknown";
      const lastName = user?.last_name || "";
      const fullName = `${firstName} ${lastName}`.trim();

      logger.info(
        `Webhook message from user: @${username} (${fullName}) [ID: ${userId}] in chat ${chatId}`,
      );

      // Parse command
      const parsed = this.parseCommand(text);
      if (!parsed) {
        logger.debug(`Received non-command message: ${text}`);
        return;
      }

      const { command, args } = parsed;
      logger.info(
        `Command: /${command} | User: @${username} | Chat: ${chatId}`,
      );

      // Dispatch ke command handler yang terdaftar di registry
      const handler = commandRegistry.find((c) => c.command === command);

      let commandResult: string | CommandResponse;

      if (!handler) {
        commandResult = `❌ Unknown command: /${command}\n\nType /help for available commands.`;
      } else if (handler.requiresAuth) {
        const isAllowed = await this.checkWhitelist(userId, username);
        if (!isAllowed) {
          logger.warn(
            `User @${username} (${userId}) not in whitelist, command /${command} denied`,
          );
          commandResult =
            "❌ Access denied.\n\nYou are not authorized to use this command.\nPlease contact the administrator.";
        } else {
          commandResult = await handler.execute({
            chatId,
            args,
            registry: commandRegistry,
            user: { id: userId, username, firstName, lastName },
          });
        }
      } else {
        commandResult = await handler.execute({
          chatId,
          args,
          registry: commandRegistry,
          user: { id: userId, username, firstName, lastName },
        });
      }

      // Send response — support plain string OR CommandResponse (with inline keyboard)
      await this.sendMessageRich(chatId, commandResult);

      logger.info(
        `Processed command /${command} from @${username} in chat ${chatId}`,
      );
    } catch (error) {
      logger.error("Error in webhook handler:", error);
      throw error;
    }
  }

  /**
   * Handle an inline keyboard callback query.
   *
   * Anti-race-condition: callback_data encodes the original userId.
   * We reject presses from any user whose ID doesn't match.
   */
  private async handleCallbackQuery(callbackQuery: any): Promise<void> {
    const callbackQueryId: string = callbackQuery.id;
    const presserUserId: number = callbackQuery.from?.id;
    const presserUsername: string =
      callbackQuery.from?.username || "no_username";
    const chatId: string = String(callbackQuery.message?.chat?.id);
    const data: string = callbackQuery.data || "";

    // Always answer the callback query to remove the loading spinner on the button
    const answerCallback = async (text?: string, showAlert = false) => {
      try {
        const { token } = await this.getActiveToken();
        await fetch(
          `https://api.telegram.org/bot${token}/answerCallbackQuery`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              callback_query_id: callbackQueryId,
              text,
              show_alert: showAlert,
            }),
          },
        );
      } catch (err) {
        logger.error("[handleCallbackQuery] answerCallbackQuery failed:", err);
      }
    };

    // ── Parse callback_data ──────────────────────────────────────────
    const parsed = parseCallbackData(data);
    if (!parsed) {
      // Not our callback — ignore silently
      await answerCallback();
      return;
    }

    const { userId: ownerUserId, action } = parsed;

    // ── Race condition guard: pastikan yang pencet adalah pemilik sesi ─
    if (presserUserId !== ownerUserId) {
      logger.warn(
        `[handleCallbackQuery] User @${presserUsername} (${presserUserId}) tried to claim confirmation owned by userId=${ownerUserId}`,
      );
      await answerCallback(
        "⚠️ Konfirmasi ini hanya bisa dilakukan oleh pemiliknya.",
        true,
      );
      return;
    }

    // ── Ambil pending confirmation ────────────────────────────────────
    const pending = pendingConfirmations.get(ownerUserId);

    if (!pending) {
      await answerCallback(
        "⏰ Sesi sudah kadaluarsa atau tidak ditemukan. Silakan kirim /start lagi.",
        true,
      );
      return;
    }

    // ── Cek TTL ───────────────────────────────────────────────────────
    if (Date.now() > pending.expiresAt) {
      pendingConfirmations.delete(ownerUserId);
      await answerCallback(
        "⏰ Sesi sudah kadaluarsa. Silakan kirim /start lagi.",
        true,
      );
      return;
    }

    // ── Proses action ─────────────────────────────────────────────────
    pendingConfirmations.delete(ownerUserId);

    if (action === "no") {
      await answerCallback("Oke, tidak jadi.");
      await this.sendMessage({
        chat_id: chatId,
        message: `❎ Baik, pendaftaran dibatalkan. Kalau berubah pikiran, kirim /start lagi ya!`,
        parse_mode: "HTML",
      });
      logger.info(
        `[handleCallbackQuery] @${presserUsername} declined chat ID registration`,
      );
      return;
    }

    // action === "yes"
    try {
      // TODO: pending.chatId adalah chat_id dari saat /start dikirim.
      // Untuk personal chat, ini = userId. Untuk group, ini = group chat_id.
      // Sesuaikan dengan kebutuhan — apakah mau simpan personal chat_id atau group chat_id.
      await registerChatIdForEmployee(pending.employee.id, pending.chatId);

      await answerCallback("✅ Berhasil didaftarkan!");
      await this.sendMessage({
        chat_id: chatId,
        message:
          `✅ <b>Berhasil!</b> Telegram kamu sudah didaftarkan.\n\n` +
          `Kamu akan menerima reminder dan pengumuman dari Fisiohome di sini. 🎉`,
        parse_mode: "HTML",
      });
      logger.info(
        `[handleCallbackQuery] @${presserUsername} registered chat_id=${pending.chatId} for employee=${pending.employee.id}`,
      );
    } catch (err) {
      logger.error(
        "[handleCallbackQuery] registerChatIdForEmployee failed:",
        err,
      );
      await answerCallback("❌ Gagal mendaftar. Coba lagi nanti.", true);
      await this.sendMessage({
        chat_id: chatId,
        message: `❌ Terjadi kesalahan saat mendaftarkan. Silakan coba /start lagi nanti.`,
        parse_mode: "HTML",
      });
    }
  }

  /**
   * Send a message that may include an inline keyboard.
   * Accepts either:
   *  - plain `string`  → sent as-is (backward compatible)
   *  - `CommandResponse` → sent with optional reply_markup
   */
  private async sendMessageRich(
    chatId: string,
    result: string | CommandResponse,
  ): Promise<void> {
    if (typeof result === "string") {
      await this.sendMessage({
        chat_id: chatId,
        message: result,
        parse_mode: "HTML",
      });
      return;
    }

    // CommandResponse with optional reply_markup
    const { token } = await this.getActiveToken();
    if (!token) throw new Error("No bot token available");

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: result.text,
        parse_mode: "HTML",
        ...(result.reply_markup && { reply_markup: result.reply_markup }),
      }),
    });

    const data = (await response.json()) as any;
    if (!response.ok) {
      throw new Error(
        data.description || "Failed to send message with reply_markup",
      );
    }
  }

  /**
   * Check if user is in whitelist
   * Returns true if user is allowed, false otherwise
   * Priority: Database whitelist -> ENV fallback
   */
  private async checkWhitelist(
    userId: number,
    username: string,
  ): Promise<boolean> {
    try {
      // Import whitelist service
      const { TelegramWhitelistService } =
        await import("@/features/telegram-whitelist");
      const whitelistService = new TelegramWhitelistService();

      // Get all whitelist entries from database
      const dbEntries = await whitelistService.getAllWhitelistEntries();
      const activeEntries = dbEntries.filter((e) => e.is_active);

      // If database has entries, use database whitelist
      if (activeEntries.length > 0) {
        const userIdStr = String(userId);
        const usernameWithAt = `@${username}`.toLowerCase();
        const usernameWithoutAt = username.toLowerCase();

        const isAllowed = activeEntries.some((entry: any) => {
          const key = entry.content_key.toLowerCase();
          return (
            key === userIdStr ||
            key === usernameWithAt ||
            key === usernameWithoutAt
          );
        });

        logger.info(
          `Whitelist check (DB) for @${username} (${userId}): ${isAllowed ? "ALLOWED" : "DENIED"}`,
        );
        return isAllowed;
      }

      // Fallback to ENV if database is empty
      const whitelist = env.TELEGRAM_COMMAND_WHITELIST;

      if (!whitelist || whitelist.trim() === "" || whitelist === "*") {
        // No whitelist or wildcard = allow all
        logger.info(
          `Whitelist check (ENV fallback) for @${username}: ALLOWED (wildcard)`,
        );
        return true;
      }

      // Check ENV whitelist
      const allowedUsers = whitelist
        .split(",")
        .map((u: string) => u.trim().toLowerCase());
      const userIdStr = String(userId);
      const usernameWithAt = `@${username}`.toLowerCase();
      const usernameWithoutAt = username.toLowerCase();

      const isAllowed = allowedUsers.some(
        (allowed: string) =>
          allowed === userIdStr ||
          allowed === usernameWithAt ||
          allowed === usernameWithoutAt,
      );

      logger.info(
        `Whitelist check (ENV fallback) for @${username} (${userId}): ${isAllowed ? "ALLOWED" : "DENIED"}`,
      );
      return isAllowed;
    } catch (error) {
      logger.error("Error checking whitelist:", error);
      // On error, deny access for security
      return false;
    }
  }
}
