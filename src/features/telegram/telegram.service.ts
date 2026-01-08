import type { SendMessageInput, SendTelegramInput } from './telegram.repo'
import { logger } from '@/lib/logger'

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
      const message = `
🩺 *INFORMASI PASIEN*

*KODE PASIEN* : ${input.kode_pasien}
*Request Gender* : ${input.gender_req}
*Usia* : ${input.usia} tahun
*Jenis Kelamin* : ${input.jenis_kelamin}

*Keluhan*  
${input.keluhan}

*Durasi Keluhan*  
${input.durasi}

*Kondisi Pasien*  
${input.kondisi}

*Riwayat Penyakit*  
${input.riwayat}

*Alamat Lengkap*  
${input.alamat}

*Request Layanan*  
${input.visit}

*Rencana Kunjungan*  
${input.jadwal}

────────────────────
🙏 *Informasi untuk Tim Fisioterapis*  
Apabila berkenan menangani pasien di atas, silakan hubungi admin melalui *personal chat* dengan menyertakan *KODE PASIEN* serta opsi jadwal kunjungan alternatif.
      `.trim()

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
}
