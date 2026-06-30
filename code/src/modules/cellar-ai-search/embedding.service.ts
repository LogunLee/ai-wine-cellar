import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/**
 * System-level embedding service (Voyage AI). The MODEL is fixed server-side
 * (VOYAGE_MODEL) — it must be identical for the book KB, wine descriptions and
 * every query, or the stored vectors become incomparable. The API KEY, however,
 * is per-call: callers pass the user's own Voyage key (or the server key for the
 * admin book-indexing CLI / trial mode), so concurrent users don't share one
 * rate-limit bucket. If no key is passed, the server VOYAGE_API_KEY is used.
 *
 * Retry policy depends on the call type:
 *  - 'document' (book/desc indexing, background): patient backoff up to 60s × 6.
 *  - 'query'    (interactive search): fail fast — one short retry, then throw so
 *               the search degrades to structure-only instead of hanging.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name)
  private readonly model: string
  private readonly batchSize = 100

  constructor(private readonly config: ConfigService) {
    this.model = this.config.get<string>('VOYAGE_MODEL') || 'voyage-3.5'
  }

  get configured(): boolean {
    return !!this.config.get<string>('VOYAGE_API_KEY')
  }

  /** Embed document chunks for storage (patient retries). */
  embedDocuments(texts: string[], apiKey?: string): Promise<number[][]> {
    return this.embed(texts, 'document', apiKey)
  }

  /** Embed a search query (asymmetric mode + fast-fail retries). */
  async embedQuery(text: string, apiKey?: string): Promise<number[]> {
    const [v] = await this.embed([text], 'query', apiKey)
    return v
  }

  private async embed(texts: string[], inputType: 'query' | 'document', apiKey?: string): Promise<number[][]> {
    const key = apiKey || this.config.get<string>('VOYAGE_API_KEY')
    if (!key) {
      throw new Error('VOYAGE_API_KEY is not configured on the server')
    }
    if (texts.length === 0) return []

    const out: number[][] = []
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize)
      const data = await this.callWithRetry(batch, inputType, key)
      for (const row of data.data) out.push(row.embedding)
    }
    return out
  }

  /**
   * POST to Voyage with retry. Free tier without a card is capped at 3 RPM / 10K TPM,
   * so document indexing backs off patiently (honoring Retry-After). Interactive
   * queries fail fast (one short retry) so a busy key degrades the search in ~1-2s
   * rather than blocking for minutes.
   */
  private async callWithRetry(
    batch: string[],
    inputType: 'query' | 'document',
    apiKey: string,
  ): Promise<{ data: { embedding: number[] }[] }> {
    const isQuery = inputType === 'query'
    const maxRetries = isQuery ? 1 : 6
    const backoff = (attempt: number, retryAfter: number): number =>
      isQuery
        ? Math.min(2000, Number.isFinite(retryAfter) ? retryAfter * 1000 : 1200)
        : Number.isFinite(retryAfter)
          ? retryAfter * 1000 + 1000
          : Math.min(60000, 20000 * Math.pow(2, attempt))

    for (let attempt = 0; ; attempt++) {
      // A thrown fetch (network drop / DNS) must be retried too — it happens before
      // any HTTP status is available, so it would otherwise kill the whole run.
      let res: Response
      try {
        res = await fetch('https://api.voyageai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ input: batch, model: this.model, input_type: inputType }),
        })
      } catch (err) {
        if (attempt >= maxRetries) throw err
        const waitMs = backoff(attempt, NaN)
        this.logger.warn(
          `Voyage fetch failed (${inputType}, attempt ${attempt + 1}/${maxRetries}); backing off ${Math.round(waitMs / 1000)}s`,
        )
        await new Promise((r) => setTimeout(r, waitMs))
        continue
      }
      if (res.ok) {
        return (await res.json()) as { data: { embedding: number[] }[] }
      }
      const body = await res.text().catch(() => '')
      const retryable = res.status === 429 || res.status >= 500
      if (!retryable || attempt >= maxRetries) {
        throw new Error(`Voyage embeddings error ${res.status}: ${body.slice(0, 300)}`)
      }
      const retryAfter = parseInt(res.headers.get('retry-after') || '', 10)
      const waitMs = backoff(attempt, retryAfter)
      this.logger.warn(
        `Voyage ${res.status} (${inputType}, attempt ${attempt + 1}/${maxRetries}); backing off ${Math.round(waitMs / 1000)}s`,
      )
      await new Promise((r) => setTimeout(r, waitMs))
    }
  }

  /** pgvector literal for a vector, e.g. "[0.1,0.2,...]". */
  static toVectorLiteral(v: number[]): string {
    return `[${v.join(',')}]`
  }
}
