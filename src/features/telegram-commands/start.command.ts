import { logger } from "@/lib/logger";
import type {
  BotCommand,
  CommandContext,
  CommandResponse,
} from "./base.command";

// ==================== Employee Info (TODO: replace with actual DB type) ====================

/**
 * TODO: Sesuaikan dengan schema DB karyawan kantor
 */
interface EmployeeInfo {
  /** ID row karyawan di DB kantor */
  id: string;
  /** Nama lengkap karyawan */
  name: string;
}

// ==================== Pending Confirmation Store ====================

interface PendingConfirmation {
  employee: EmployeeInfo;
  /** Chat tempat /start dikirim — dibutuhkan saat update chat_id */
  chatId: string;
  /** Epoch ms — expire setelah CONFIRMATION_TTL_MS */
  expiresAt: number;
}

/** TTL sesi konfirmasi: 5 menit */
const CONFIRMATION_TTL_MS = 5 * 60 * 1_000;

/**
 * In-memory store keyed by Telegram userId.
 * Satu user hanya bisa punya satu sesi pending.
 * Tidak perlu Redis — single-process, state boleh hilang saat restart.
 */
export const pendingConfirmations = new Map<number, PendingConfirmation>();

// ==================== TODO DB Stubs ====================

/**
 * TODO: Query ke internal DB kantor — cek apakah username terdaftar.
 * Kembalikan data karyawan jika ada, null jika tidak.
 *
 * @param _username — username Telegram (tanpa @)
 */
async function checkEmployeeByUsername(
  _username: string,
): Promise<EmployeeInfo | null> {
  // TODO: implementasi query ke DB kantor
  // Contoh:
  //   const row = await db.query(
  //     "SELECT id, name FROM employees WHERE telegram_username = $1 LIMIT 1",
  //     [_username]
  //   );
  //   return row ?? null;
  return null;
}

/**
 * TODO: Update row karyawan — simpan telegram_chat_id ke DB kantor.
 *
 * @param _employeeId — ID karyawan
 * @param _chatId     — Telegram chat_id user
 */
export async function registerChatIdForEmployee(
  _employeeId: string,
  _chatId: string,
): Promise<void> {
  // TODO: implementasi update ke DB kantor
  // Contoh:
  //   await db.query(
  //     "UPDATE employees SET telegram_chat_id = $1 WHERE id = $2",
  //     [_chatId, _employeeId]
  //   );
}

// ==================== Callback Data Helpers ====================

const CALLBACK_PREFIX = "start_confirm";

/**
 * Encode callback_data untuk tombol inline keyboard.
 * Format: `start_confirm:<userId>:<action>`
 */
export function encodeCallbackData(
  userId: number,
  action: "yes" | "no",
): string {
  return `${CALLBACK_PREFIX}:${userId}:${action}`;
}

/**
 * Parse callback_data — kembalikan null bila bukan milik start flow.
 */
export function parseCallbackData(
  data: string,
): { userId: number; action: "yes" | "no" } | null {
  if (!data.startsWith(`${CALLBACK_PREFIX}:`)) return null;

  const parts = data.split(":");
  if (parts.length !== 3) return null;

  const userId = Number(parts[1]);
  const action = parts[2] as "yes" | "no";

  if (isNaN(userId) || !["yes", "no"].includes(action)) return null;

  return { userId, action };
}

// ==================== StartCommand ====================

/**
 * /start — welcome message + employee lookup + chat ID registration flow
 * requiresAuth: false → siapapun bisa akses
 */
export class StartCommand implements BotCommand {
  command = "start";
  description = "Tampilkan pesan selamat datang";
  requiresAuth = false;

  async execute(ctx: CommandContext): Promise<string | CommandResponse> {
    const { user, chatId } = ctx;

    const nameStr = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

    // ── 1. Header welcome ────────────────────────────────────────────
    let text = `👋 Halo${nameStr ? ` <b>${nameStr}</b>` : ""}! Selamat datang di Fisiohome Telegram Bot.\n\n`;

    if (user) {
      text += `👤 <b>Info Telegram kamu:</b>\n`;
      text += `• ID: <code>${user.id ?? "Unknown"}</code>\n`;
      text += `• Username: ${user.username && user.username !== "no_username" ? `@${user.username}` : "Tidak ada"}\n`;
      text += `• Nama: ${nameStr || "Unknown"}\n\n`;
    }

    // ── 2. Cek employee di DB kantor ─────────────────────────────────
    const username = user?.username;

    if (!username || username === "no_username") {
      // Tidak bisa lookup tanpa username
      text += `ℹ️ Kamu tidak memiliki username Telegram, sehingga tidak dapat dicocokkan dengan data karyawan.\n\n`;
      text += helpCommandsText();
      return text;
    }

    let employee: EmployeeInfo | null = null;
    try {
      employee = await checkEmployeeByUsername(username);
    } catch (err) {
      logger.error("[StartCommand] Error checking employee:", err);
      text += `⚠️ Terjadi kesalahan saat mengecek data karyawan. Silakan coba lagi nanti.\n\n`;
      text += helpCommandsText();
      return text;
    }

    if (!employee) {
      // Username tidak terdaftar di kantor
      text += `ℹ️ Username @${username} tidak ditemukan di database karyawan.\n\n`;
      text += helpCommandsText();
      return text;
    }

    // ── 3. Employee ditemukan → tampilkan info & minta konfirmasi ─────
    const userId = user?.id;
    if (!userId) {
      text += helpCommandsText();
      return text;
    }

    // Simpan ke pending store (overwrite kalau sudah ada sesi lama)
    pendingConfirmations.set(userId, {
      employee,
      chatId,
      expiresAt: Date.now() + CONFIRMATION_TTL_MS,
    });

    logger.info(
      `[StartCommand] Employee found for @${username} (userId=${userId}): ${employee.name}`,
    );

    text += `✅ <b>Kamu terdaftar sebagai karyawan Fisiohome!</b>\n\n`;
    text += `👤 <b>Data karyawan:</b>\n`;
    text += `• Nama: <b>${employee.name}</b>\n\n`;
    text += `Apakah data di atas sudah benar dan kamu ingin mendaftarkan Telegram ini agar bisa menerima <b>reminder</b> dan <b>pengumuman</b>?`;

    return {
      text,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Ya, Daftarkan",
              callback_data: encodeCallbackData(userId, "yes"),
            },
            {
              text: "❌ Tidak",
              callback_data: encodeCallbackData(userId, "no"),
            },
          ],
        ],
      },
    };
  }
}

// ==================== Helpers ====================

function helpCommandsText(): string {
  return (
    `📋 <b>Command yang tersedia:</b>\n` +
    `📝 /register [key] — Daftarkan chat ini dengan sebuah key\n` +
    `❓ /help — Tampilkan daftar command`
  );
}
