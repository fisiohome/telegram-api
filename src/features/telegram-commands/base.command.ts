/**
 * Context passed to every bot command handler
 */
export interface CommandContext {
  /** Telegram chat ID (as string) */
  chatId: string;
  /** Arguments after the command word, e.g. /register KEY → ["KEY"] */
  args: string[];
  /**
   * Optional: full command registry, injected by the webhook handler.
   * Digunakan oleh HelpCommand untuk menampilkan daftar command
   * tanpa menyebabkan circular dependency dengan index.ts.
   */
  registry?: BotCommand[];
  /**
   * User information that initiated the command
   */
  user?: {
    id?: number;
    username?: string;
    firstName?: string;
    lastName?: string;
  };
}

/**
 * Inline keyboard button
 */
export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

/**
 * Rich response that supports both plain text replies and replies with
 * an attached inline keyboard.
 *
 * When a command only needs to return plain text it can still return a
 * simple `string` — the webhook handler accepts either type.
 */
export interface CommandResponse {
  text: string;
  reply_markup?: {
    inline_keyboard: InlineKeyboardButton[][];
  };
}

/**
 * Interface that every bot command must implement.
 *
 * Fields:
 *  - command      : name WITHOUT slash, e.g. "register"
 *  - description  : one-liner shown in /help list
 *  - requiresAuth : when true, user must be in the whitelist to execute this command
 *  - execute      : handler function — returns the reply text or a rich CommandResponse
 */
export interface BotCommand {
  command: string;
  description: string;
  requiresAuth: boolean;
  execute(ctx: CommandContext): Promise<string | CommandResponse>;
}
