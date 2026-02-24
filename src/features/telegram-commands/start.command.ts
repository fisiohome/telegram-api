import type { BotCommand, CommandContext } from "./base.command";

/**
 * /start  — welcome message
 * requiresAuth: false → siapapun bisa akses
 */
export class StartCommand implements BotCommand {
  command = "start";
  description = "Tampilkan pesan selamat datang";
  requiresAuth = false;

  async execute(ctx: CommandContext): Promise<string> {
    const user = ctx.user;
    const nameStr = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

    let response = `👋 Welcome${nameStr ? ` ${nameStr}` : ""} to Fisiohome Telegram Bot!\n\n`;

    if (user) {
      response += `👤 <b>Your Info:</b>\n`;
      response += `• ID: <code>${user.id || "Unknown"}</code>\n`;
      response += `• Username: ${user.username && user.username !== "no_username" ? `@${user.username}` : "None"}\n`;
      response += `• Name: ${nameStr || "Unknown"}\n\n`;
    }

    response += `Available commands:\n`;
    response += `📝 /register [key] - Register this chat with a key\n`;
    response += `❓ /help - Show this help message\n\n`;
    response += `Example:\n`;
    response += `/register TEST_PATIENT\n\n`;
    response += `After registration, you can send messages to this chat using the key.`;

    return response;
  }
}
