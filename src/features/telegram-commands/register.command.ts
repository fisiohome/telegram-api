import { logger } from "@/lib/logger";
import type { BotCommand, CommandContext } from "./base.command";

/**
 * /register [key]  — daftarkan chat_id dengan key di database
 * requiresAuth: true → hanya whitelist yang bisa daftar
 */
export class RegisterCommand implements BotCommand {
  command = "register";
  description =
    "(Hanya Admin) Daftarkan grup ini dengan sebuah key: /register [key]";
  requiresAuth = true;

  async execute({ chatId, args }: CommandContext): Promise<string> {
    const key = args[0];

    try {
      if (!key) {
        return "❌ Usage: /register [key]\n\nExample: /register MY_PATIENT_ID";
      }

      // Import dynamically to avoid circular dependency
      const { TelegramChatIdService } =
        await import("@/features/telegram-chatid");
      const chatIdService = new TelegramChatIdService();

      // Check if key already exists
      const existingKey = await chatIdService.getChatIdByKey(key);
      if (existingKey) {
        return `⚠️ Key "${key}" already registered with chat ID: ${existingKey.content_value}\n\nUse a different key or update via API.`;
      }

      // Check if this chat_id is already registered (any key)
      const existingChatId = await chatIdService.getChatIdByValue(chatId);
      if (existingChatId) {
        return `⚠️ This chat is already registered with key: "${existingChatId.content_key}"\n\nYou cannot register the same chat with multiple keys.\nIf you need to change the key, please contact the administrator.`;
      }

      // Save to database
      await chatIdService.createChatId({
        content_key: key,
        content_value: chatId,
        is_active: true,
      });

      logger.info(`Chat ID ${chatId} registered with key: ${key}`);
      return `✅ Chat ID registered successfully!\n\nKey: ${key}\nChat ID: ${chatId}\n\nYou can now use this key to send messages to this chat.`;
    } catch (error) {
      logger.error("Error in RegisterCommand.execute:", error);
      return "❌ Failed to register chat ID. Please try again later.";
    }
  }
}
