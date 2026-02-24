import type { BotCommand } from "./base.command";
import { StartCommand } from "./start.command";
import { HelpCommand } from "./help.command";
import { RegisterCommand } from "./register.command";

/**
 * Registry semua bot command.
 *
 * Cara tambah command baru:
 * 1. Buat file `nama.command.ts` yang implements `BotCommand`
 * 2. Import di sini dan tambahkan instance ke array di bawah
 *
 * Webhook handler di TelegramService akan otomatis mendeteksinya.
 */
export const commandRegistry: BotCommand[] = [
  new StartCommand(),
  new HelpCommand(),
  new RegisterCommand(),
];

export type { BotCommand } from "./base.command";
export type { CommandContext } from "./base.command";
export type { CommandResponse } from "./base.command";
export type { InlineKeyboardButton } from "./base.command";
