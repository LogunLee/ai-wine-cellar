import { Injectable, OnModuleInit, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

/**
 * Шифрование API-ключей пользователей.
 * Формат хранения: iv(12) | authTag(16) | ciphertext.
 * Мастер-ключ — env AI_KEY_ENCRYPTION_SECRET (64 hex-символа = 32 байта),
 * в БД не хранится: дамп базы без env бесполезен.
 */
@Injectable()
export class KeyCryptoService implements OnModuleInit {
  private readonly logger = new Logger(KeyCryptoService.name)
  private masterKey: Buffer | null = null

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const hex = this.config.get<string>('AI_KEY_ENCRYPTION_SECRET')
    if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
      this.logger.warn(
        'AI_KEY_ENCRYPTION_SECRET отсутствует или некорректен (нужно 64 hex-символа) — сохранение пользовательских ключей будет недоступно',
      )
      return
    }
    this.masterKey = Buffer.from(hex, 'hex')
  }

  get available(): boolean {
    return this.masterKey !== null
  }

  encrypt(plain: string): Uint8Array<ArrayBuffer> {
    if (!this.masterKey) throw new Error('Encryption key is not configured')
    const iv = randomBytes(IV_LEN)
    const cipher = createCipheriv(ALGO, this.masterKey, iv)
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), ciphertext]))
  }

  decrypt(enc: Uint8Array): string {
    if (!this.masterKey) throw new Error('Encryption key is not configured')
    const buf = Buffer.from(enc)
    const iv = buf.subarray(0, IV_LEN)
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
    const ciphertext = buf.subarray(IV_LEN + TAG_LEN)
    const decipher = createDecipheriv(ALGO, this.masterKey, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  }
}
