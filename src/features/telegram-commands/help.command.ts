import type { BotCommand, CommandContext } from "./base.command";

/**
 * /help  — tampilkan daftar semua command yang terdaftar
 * requiresAuth: true → hanya whitelist
 *
 * Registry di-inject melalui CommandContext.registry untuk
 * menghindari circular dependency dengan index.ts.
 */
export class HelpCommand implements BotCommand {
  command = "help";
  description = "Tampilkan daftar perintah yang tersedia";
  requiresAuth = true;

  async execute(ctx: CommandContext): Promise<string> {
    const registry = ctx.registry ?? [];
    const lines = registry
      .map((cmd) => `• /${cmd.command} — ${cmd.description}`)
      .join("\n");

    return `📋 <b>Daftar Perintah</b>\n\n${lines}`;
  }
}
