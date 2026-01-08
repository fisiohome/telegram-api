import type { SendMessageInput, SendTelegramInput } from './telegram.repo'
import { logger } from '@/lib/logger'
import { env } from '@/lib/env'

/**
 * Business logic for telegram feature
 */

export class TelegramService {
  private botToken: string

  constructor(botToken: string) {
    this.botToken = botToken
  }

  async sendMessage(input: SendMessageInput) {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`
      
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
        logger.error('Failed to send telegram message:', data)
        throw new Error(data.description || 'Failed to send message')
      }

      logger.info(`Message sent to chat ${input.chat_id}`)
      return data
    } catch (error) {
      logger.error('Error sending telegram message:', error)
      throw error
    }
  }

  async sendTelegram(input: SendTelegramInput) {
    try {
      // Prepare mentions
      const mentions = [...(input.mentions || [])]
      if (env.TELEGRAM_ADMIN && !mentions.includes(env.TELEGRAM_ADMIN)) {
        mentions.push(env.TELEGRAM_ADMIN)
      }
      const adminContact = mentions.length ? `(${mentions.join(', ')})` : ''

      const message = this.formatPatientMessage(input, adminContact)

      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`
      
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
        logger.error('Failed to send telegram notification:', data)
        throw new Error(data.description || 'Failed to send telegram message')
      }

      logger.info(`Patient notification sent to chat ${input.chat_id}`)
      return data
    } catch (error) {
      logger.error('Error sending telegram notification:', error)
      throw error
    }
  }

  async getMe() {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/getMe`
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
    
    message += `🩺 *INFORMASI PASIEN*\n\n`
    message += `*KODE PASIEN* : ${input.kode_pasien}\n`
    message += `*Request Gender* : ${input.gender_req}\n`
    message += `*Usia* : ${input.usia} tahun\n`
    message += `*Jenis Kelamin* : ${input.jenis_kelamin}\n\n`

    message += `*Keluhan*\n${input.keluhan}\n\n`
    message += `*Durasi Keluhan*\n${input.durasi}\n\n`
    message += `*Kondisi Pasien*\n${input.kondisi}\n\n`
    message += `*Riwayat Penyakit*\n${input.riwayat}\n\n`
    message += `*Alamat Lengkap*\n${input.alamat}\n\n`
    message += `*Request Layanan*\n${input.visit}\n\n`
    message += `*Rencana Kunjungan*\n${input.jadwal}\n\n`

    message += `────────────────────\n`
    message += `🙏 *Informasi untuk Tim Fisioterapis*\n`
    message += `Apabila berkenan menangani pasien di atas, silakan hubungi admin ${adminContact} melalui *personal chat* dengan menyertakan *KODE PASIEN* serta opsi jadwal kunjungan alternatif.`

    return message
  }
}
