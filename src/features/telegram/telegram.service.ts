import type { SendMessageInput, SendTelegramInput } from './telegram.repo'
import { logger } from '@/lib/logger'
import { env } from '@/lib/env'
import { TelegramTokenService } from '@/features/telegram-token'

/**
 * Business logic for telegram feature
 * Updated to use DB tokens (primary) with `ENV` fallback
 */

export class TelegramService {
  private botToken: string | null = null
  private tokenService: TelegramTokenService
  private currentTokenId: string | null = null
  private readonly MAX_RETRIES = 3

  constructor(botToken?: string) {
    // Optional token for backward compatibility
    this.botToken = botToken || null
    this.tokenService = new TelegramTokenService()
  }

  /**
   * Get active bot token
   * Priority: DB tokens (with rotation) -> ENV token
   */
  private async getActiveToken(): Promise<{ token: string; tokenId: string | null }> {
    try {
      // Try to get token from DB first
      const dbToken = await this.tokenService.getNextActiveToken()
      
      if (dbToken && dbToken.content_value) {
        this.currentTokenId = dbToken.id
        return {
          token: dbToken.content_value,
          tokenId: dbToken.id
        }
      }

      // Fallback to ENV token
      logger.info('No DB tokens available, using ENV token as fallback')
      this.currentTokenId = null
      return {
        token: this.botToken || env.TELEGRAM_BOT_TOKEN || '',
        tokenId: null
      }
    } catch (error) {
      logger.error('Error getting active token, falling back to ENV:', error)
      this.currentTokenId = null
      return {
        token: this.botToken || env.TELEGRAM_BOT_TOKEN || '',
        tokenId: null
      }
    }
  }

  /**
   * Check if error indicates a banned/invalid token
   */
  private isBannedTokenError(error: any): boolean {
    const errorMessage = error?.message || error?.description || String(error)
    const bannedKeywords = [
      'Forbidden',
      'Unauthorized',
      'bot was blocked',
      'bot was kicked',
      'token is invalid',
      'Not Found' // Invalid bot token
    ]
    
    return bannedKeywords.some(keyword => 
      errorMessage.toLowerCase().includes(keyword.toLowerCase())
    )
  }

  /**
   * Send message with automatic token rotation and retry
   */
  async sendMessage(input: SendMessageInput) {
    let lastError: any = null

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const { token, tokenId } = await this.getActiveToken()
        
        if (!token) {
          throw new Error('No bot token available')
        }

        const url = `https://api.telegram.org/bot${token}/sendMessage`
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: input.chat_id,
            text: input.message,
            parse_mode: input.parse_mode || 'HTML',
          }),
        })

        const data = (await response.json()) as any

        if (!response.ok) {
          const error = new Error(data.description || 'Failed to send message')
          
          // Check if token is banned
          if (tokenId && this.isBannedTokenError(data)) {
            logger.warn(`Token ${tokenId} appears to be banned, marking as inactive`)
            await this.tokenService.markTokenAsBanned(tokenId, {
              error_message: data.description || 'Token banned/invalid'
            })
            
            // Retry with next token
            lastError = error
            continue
          }
          
          throw error
        }

        logger.info(`Message sent to chat ${input.chat_id}`)
        return data
      } catch (error) {
        logger.error(`Error sending telegram message (attempt ${attempt + 1}/${this.MAX_RETRIES}):`, error)
        lastError = error
        
        // If it's not a banned token error, don't retry
        if (!this.isBannedTokenError(error)) {
          throw error
        }
      }
    }

    // All retries failed
    throw lastError || new Error('Failed to send message after retries')
  }

  /**
   * Send telegram notification with automatic token rotation and retry
   */
  async sendTelegram(input: SendTelegramInput) {
    let lastError: any = null

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const { token, tokenId } = await this.getActiveToken()
        
        if (!token) {
          throw new Error('No bot token available')
        }

        // Prepare mentions
        const mentions = [...(input.mentions || [])]
        if (env.TELEGRAM_ADMIN && !mentions.includes(env.TELEGRAM_ADMIN)) {
          mentions.push(env.TELEGRAM_ADMIN)
        }
        const adminContact = mentions.length ? `(${mentions.join(', ')})` : ''

        const message = this.formatPatientMessage(input, adminContact)

        const url = `https://api.telegram.org/bot${token}/sendMessage`
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: input.chat_id,
            text: message,
            parse_mode: 'Markdown',
          }),
        })

        const data = (await response.json()) as any

        if (!response.ok) {
          const error = new Error(data.description || 'Failed to send telegram message')
          
          // Check if token is banned
          if (tokenId && this.isBannedTokenError(data)) {
            logger.warn(`Token ${tokenId} appears to be banned, marking as inactive`)
            await this.tokenService.markTokenAsBanned(tokenId, {
              error_message: data.description || 'Token banned/invalid'
            })
            
            // Retry with next token
            lastError = error
            continue
          }
          
          throw error
        }

        logger.info(`Patient notification sent to chat ${input.chat_id}`)
        return data
      } catch (error) {
        logger.error(`Error sending telegram notification (attempt ${attempt + 1}/${this.MAX_RETRIES}):`, error)
        lastError = error
        
        // If it's not a banned token error, don't retry
        if (!this.isBannedTokenError(error)) {
          throw error
        }
      }
    }

    // All retries failed
    throw lastError || new Error('Failed to send telegram message after retries')
  }

  async getMe() {
    try {
      const { token } = await this.getActiveToken()
      
      if (!token) {
        throw new Error('No bot token available')
      }

      const url = `https://api.telegram.org/bot${token}/getMe`
      const response = await fetch(url)
      const data = (await response.json()) as any

      if (!response.ok) {
        throw new Error(data.description || 'Failed to get bot info')
      }

      return data.result
    } catch (error) {
      logger.error('Error getting bot info:', error)
      throw error
    }
  }

  private formatPatientMessage(input: SendTelegramInput, adminContact: string): string {
    let message = ''
    
    message += `🩺 *INFORMASI PASIEN*\\n\\n`
    message += `*KODE PASIEN* : ${input.kode_pasien}\\n`
    message += `*Request Gender* : ${input.gender_req}\\n`
    message += `*Usia* : ${input.usia} tahun\\n`
    message += `*Jenis Kelamin* : ${input.jenis_kelamin}\\n\\n`

    message += `*Keluhan*\\n${input.keluhan}\\n\\n`
    message += `*Durasi Keluhan*\\n${input.durasi}\\n\\n`
    message += `*Kondisi Pasien*\\n${input.kondisi}\\n\\n`
    message += `*Riwayat Penyakit*\\n${input.riwayat}\\n\\n`
    message += `*Alamat Lengkap*\\n${input.alamat}\\n\\n`
    message += `*Request Layanan*\\n${input.visit}\\n\\n`
    message += `*Rencana Kunjungan*\\n${input.jadwal}\\n\\n`

    message += `────────────────────\\n`
    message += `🙏 *Informasi untuk Tim Fisioterapis*\\n`
    message += `Apabila berkenan menangani pasien di atas, silakan hubungi admin ${adminContact} melalui *personal chat* dengan menyertakan *KODE PASIEN* serta opsi jadwal kunjungan alternatif.`

    return message
  }

  // ==================== Webhook Handler ====================

  /**
   * Parse command from message text
   * Returns { command, args } or null if not a command
   */
  private parseCommand(text: string): { command: string; args: string[] } | null {
    const trimmed = text.trim()
    if (!trimmed.startsWith('/')) {
      return null
    }

    const parts = trimmed.substring(1).split(/\s+/)
    const command = parts[0].toLowerCase()
    const args = parts.slice(1)

    return { command, args }
  }

  /**
   * Handle /register [key] command
   * Saves chat_id with the provided key to database
   */
  async handleRegisterCommand(chatId: string, key: string): Promise<string> {
    try {
      if (!key) {
        return '❌ Usage: /register [key]\n\nExample: /register MY_PATIENT_ID'
      }

      // Import chatid service dynamically to avoid circular dependency
      const { TelegramChatIdService } = await import('@/features/telegram-chatid')
      const chatIdService = new TelegramChatIdService()

      // Check if key already exists
      const existing = await chatIdService.getChatIdByKey(key)
      if (existing) {
        return `⚠️ Key "${key}" already registered with chat ID: ${existing.content_value}\n\nUse a different key or update via API.`
      }

      // Save to database
      await chatIdService.createChatId({
        content_key: key,
        content_value: chatId,
        is_active: true,
      })

      logger.info(`Chat ID ${chatId} registered with key: ${key}`)
      return `✅ Chat ID registered successfully!\n\nKey: ${key}\nChat ID: ${chatId}\n\nYou can now use this key to send messages to this chat.`
    } catch (error) {
      logger.error('Error in handleRegisterCommand:', error)
      return '❌ Failed to register chat ID. Please try again later.'
    }
  }

  /**
   * Handle /start command
   */
  async handleStartCommand(chatId: string): Promise<string> {
    return `👋 Welcome to Fisiohome Telegram Bot!

Available commands:
📝 /register [key] - Register this chat with a key
❓ /help - Show this help message

Example:
/register TEST_PATIENT

After registration, you can send messages to this chat using the key.`
  }

  /**
   * Handle /help command
   */
  async handleHelpCommand(chatId: string): Promise<string> {
    return this.handleStartCommand(chatId)
  }

  /**
   * Main webhook handler
   * Processes incoming updates from Telegram
   */
  async handleWebhook(update: any): Promise<void> {
    try {
      // Extract message from update
      const message = update.message
      if (!message || !message.text) {
        logger.debug('Update does not contain a text message, ignoring')
        return
      }

      const chatId = String(message.chat.id)
      const text = message.text

      // Parse command
      const parsed = this.parseCommand(text)
      if (!parsed) {
        // Not a command, ignore
        logger.debug(`Received non-command message: ${text}`)
        return
      }

      const { command, args } = parsed
      let responseText: string

      // Handle commands
      switch (command) {
        case 'register':
          responseText = await this.handleRegisterCommand(chatId, args[0])
          break

        case 'start':
          responseText = await this.handleStartCommand(chatId)
          break

        case 'help':
          responseText = await this.handleHelpCommand(chatId)
          break

        default:
          responseText = `❌ Unknown command: /${command}\n\nType /help for available commands.`
      }

      // Send response
      await this.sendMessage({
        chat_id: chatId,
        message: responseText,
        parse_mode: 'HTML',
      })

      logger.info(`Processed command /${command} from chat ${chatId}`)
    } catch (error) {
      logger.error('Error in webhook handler:', error)
      throw error
    }
  }
}
