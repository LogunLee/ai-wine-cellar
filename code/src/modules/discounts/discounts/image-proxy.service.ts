import { Injectable, Logger } from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'crypto'
import sharp from 'sharp'

interface CacheEntry {
  buf: Buffer
  ts: number
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 часов
const CACHE_MAX = 500
const FETCH_TIMEOUT_MS = 10_000
const MAX_BYTES = 10 * 1024 * 1024

/**
 * Нормализатор картинок магазинов: многие (Винлаб и др.) отдают AVIF/PNG
 * с прозрачным фоном. На части устройств Android альфа теряется и фон
 * становится чёрным; на Android < 12 AVIF вообще не декодируется.
 * Прокси скачивает изображение, кладёт на белый фон и отдаёт обычный JPEG.
 *
 * Доступ открыт (Coil не шлёт JWT), поэтому каждый URL подписывается HMAC —
 * сервер обрабатывает только свои ссылки (защита от использования как открытого прокси/SSRF).
 */
@Injectable()
export class ImageProxyService {
  private readonly logger = new Logger(ImageProxyService.name)
  private readonly secret = process.env.JWT_SECRET || 'merlotic-image-proxy'
  private readonly cache = new Map<string, CacheEntry>()

  private sign(url: string): string {
    return createHmac('sha256', this.secret).update(url).digest('hex').slice(0, 24)
  }

  /** Оборачивает исходный URL картинки в подписанную ссылку на наш прокси. */
  proxify(baseUrl: string, originalUrl?: string | null): string | null {
    if (!originalUrl) return null
    if (!/^https?:\/\//i.test(originalUrl)) return originalUrl
    const sig = this.sign(originalUrl)
    return `${baseUrl}/discounts/image?u=${encodeURIComponent(originalUrl)}&s=${sig}`
  }

  async normalize(url: string, sig: string): Promise<Buffer | null> {
    // 1. Подпись
    if (!url || !sig) return null
    const expected = this.sign(url)
    if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
      return null
    }

    // 2. Кэш
    const cached = this.cache.get(sig)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.buf

    // 3. Валидация хоста (анти-SSRF, хотя подпись уже ограничивает)
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return null
    }
    if (!/^https?:$/.test(parsed.protocol) || this.isPrivateHost(parsed.hostname)) return null

    // 4. Загрузка
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' })
      if (!res.ok) return null
      const ct = res.headers.get('content-type') || ''
      if (!ct.startsWith('image/')) return null

      const ab = await res.arrayBuffer()
      if (ab.byteLength > MAX_BYTES) return null

      // 5. Белый фон + JPEG
      const out = await sharp(Buffer.from(ab))
        .flatten({ background: '#ffffff' })
        .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer()

      this.store(sig, out)
      return out
    } catch (err) {
      this.logger.warn(`image normalize failed for ${url}: ${err}`)
      return null
    }
  }

  private isPrivateHost(host: string): boolean {
    const h = host.toLowerCase()
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
    // IPv4 приватные / loopback / link-local
    if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
    if (h === '0.0.0.0' || h === '::1') return true
    return false
  }

  private store(sig: string, buf: Buffer) {
    if (this.cache.size >= CACHE_MAX) {
      const oldest = this.cache.keys().next().value
      if (oldest) this.cache.delete(oldest)
    }
    this.cache.set(sig, { buf, ts: Date.now() })
  }
}
