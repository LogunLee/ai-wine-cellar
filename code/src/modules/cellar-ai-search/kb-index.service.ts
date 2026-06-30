import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { PrismaService } from '../../shared/database/prisma.service'
import { EmbeddingService } from './embedding.service'
import { AiRouterService } from '../ai-settings/ai-router.service'

interface FineChunk {
  id: string
  book_id: string
  png: number | string
  printed_page: number | string
  sections: string[]
  heading: string
  content_hash: string
  text: string
}

/**
 * Admin/server-only indexing. NOT exposed to end users. Book indexing is run via
 * the CLI (scripts/index-kb.ts). Per-bottle description indexing is triggered when
 * a user saves a description. Incremental: chunks/passages whose content_hash is
 * unchanged are skipped (no re-embedding).
 */
@Injectable()
export class KbIndexService {
  private readonly logger = new Logger(KbIndexService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
    private readonly config: ConfigService,
    private readonly aiRouter: AiRouterService,
  ) {}

  private chunksPath(): string {
    return (
      this.config.get<string>('KB_CHUNKS_PATH') ||
      path.resolve(process.cwd(), '..', 'knowledge', 'books', '_index', 'kb_chunks_fine.jsonl')
    )
  }

  /** Embed and upsert all book chunks. Returns counts. */
  async indexBooks(): Promise<{ total: number; embedded: number; skipped: number }> {
    if (!this.embeddings.configured) throw new Error('VOYAGE_API_KEY is not configured')
    const file = this.chunksPath()
    if (!fs.existsSync(file)) throw new Error(`KB chunks file not found: ${file}`)

    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)
    const chunks: FineChunk[] = lines.map((l) => JSON.parse(l))

    const existing = await this.prisma.$queryRawUnsafe<{ id: string; content_hash: string }[]>(
      `SELECT id, content_hash FROM kb_chunk`,
    )
    const existingMap = new Map(existing.map((r) => [r.id, r.content_hash]))

    const toEmbed = chunks.filter((c) => existingMap.get(c.id) !== c.content_hash)
    this.logger.log(`KB index: ${chunks.length} chunks, ${toEmbed.length} new/changed`)

    // Throttle to Voyage's free-tier-without-card limits (default 3 RPM / 10K TPM).
    // Add a payment method on Voyage billing to lift these (still free within 200M tokens),
    // then set VOYAGE_RPM/VOYAGE_TPM higher to index fast.
    const rpm = Math.max(1, parseInt(this.config.get<string>('VOYAGE_RPM') || '3', 10))
    const tpm = Math.max(1000, parseInt(this.config.get<string>('VOYAGE_TPM') || '10000', 10))
    // Cyrillic tokenizes ~1 token per 2 chars on Voyage (latin ~1/4). The book KB is
    // Russian, so estimate at /2 and use 75% of the TPM budget — the 429 retry in
    // EmbeddingService is the backstop if a batch still overshoots.
    const perReqTokens = Math.max(500, Math.floor((tpm * 0.75) / rpm))
    const minGapMs = Math.ceil(60000 / rpm) + 500
    const estTokens = (s: string) => Math.ceil(s.length / 2)

    // Token-aware batches so a single request never exceeds the per-minute token budget.
    const batches: FineChunk[][] = []
    let cur: FineChunk[] = []
    let curTok = 0
    for (const c of toEmbed) {
      const t = estTokens(c.text)
      if (cur.length && curTok + t > perReqTokens) {
        batches.push(cur)
        cur = []
        curTok = 0
      }
      cur.push(c)
      curTok += t
    }
    if (cur.length) batches.push(cur)

    this.logger.log(`KB index: ${batches.length} batches (~${perReqTokens} tok each), ${rpm} req/min — est ~${Math.ceil((batches.length * minGapMs) / 60000)} min`)

    let embedded = 0
    for (let b = 0; b < batches.length; b++) {
      if (b > 0) await sleep(minGapMs)
      const batch = batches[b]
      const vectors = await this.embeddings.embedDocuments(batch.map((c) => c.text))
      for (let j = 0; j < batch.length; j++) {
        const c = batch[j]
        const vec = EmbeddingService.toVectorLiteral(vectors[j])
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO kb_chunk (id, book_id, printed_page, png, sections, heading, content_hash, text, embedding, updated_at)
           VALUES ($1,$2,$3,$4,$5::text[],$6,$7,$8,'${vec}'::vector, now())
           ON CONFLICT (id) DO UPDATE SET
             book_id=EXCLUDED.book_id, printed_page=EXCLUDED.printed_page, png=EXCLUDED.png,
             sections=EXCLUDED.sections, heading=EXCLUDED.heading, content_hash=EXCLUDED.content_hash,
             text=EXCLUDED.text, embedding=EXCLUDED.embedding, updated_at=now()`,
          c.id,
          c.book_id,
          toInt(c.printed_page),
          toInt(c.png),
          c.sections ?? [],
          c.heading ?? null,
          c.content_hash,
          c.text,
        )
        embedded++
      }
      this.logger.log(`KB index progress: ${embedded}/${toEmbed.length} (batch ${b + 1}/${batches.length})`)
    }
    return { total: chunks.length, embedded, skipped: chunks.length - toEmbed.length }
  }

  /** Drop all vector chunks for a bottle (on delete / when descriptions are cleared). */
  async removeCellarItemDescriptions(cellarItemId: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM wine_desc_chunk WHERE cellar_item_id = $1::uuid`,
      cellarItemId,
    )
  }

  /** (Re)index one bottle's user/seller descriptions into wine_desc_chunk. */
  async indexCellarItemDescriptions(cellarItemId: string): Promise<{ chunks: number }> {
    const item = await this.prisma.cellarItem.findUnique({
      where: { id: cellarItemId },
      include: { cellar: true },
    })
    if (!item) return { chunks: 0 }
    const ownerId = item.cellar.ownerId

    // Эмбеддим описания на ключе владельца (иначе серверный); нет ключа — пропускаем.
    const apiKey = await this.aiRouter.voyageKeyForIndexing(ownerId)
    if (!apiKey) return { chunks: 0 }

    // wipe previous rows for this item, then re-insert
    await this.prisma.$executeRawUnsafe(`DELETE FROM wine_desc_chunk WHERE cellar_item_id = $1::uuid`, cellarItemId)

    const sources: { source: string; text: string | null }[] = [
      { source: 'user', text: item.userDescription },
      { source: 'seller', text: item.sellerDescription },
      { source: 'producer', text: item.producerDescription },
    ]
    let total = 0
    for (const { source, text } of sources) {
      if (!text || !text.trim()) continue
      const passages = splitPassages(text)
      if (passages.length === 0) continue
      const vectors = await this.embeddings.embedDocuments(passages, apiKey)
      for (let i = 0; i < passages.length; i++) {
        const vec = EmbeddingService.toVectorLiteral(vectors[i])
        const hash = crypto.createHash('sha1').update(passages[i]).digest('hex')
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO wine_desc_chunk (id, cellar_item_id, owner_id, source, content_hash, text, embedding)
           VALUES ($1,$2::uuid,$3::uuid,$4,$5,$6,'${vec}'::vector)
           ON CONFLICT (id) DO NOTHING`,
          `${cellarItemId}:${source}:${i}`,
          cellarItemId,
          ownerId,
          source,
          hash,
          passages[i],
        )
        total++
      }
    }
    return { chunks: total }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function toInt(v: number | string | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

/** Split a (possibly very large) description into ~900-char passages on paragraph breaks. */
function splitPassages(text: string, target = 900, overlap = 120, hardMax = 1400): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const out: string[] = []
  let buf = ''
  for (const p of paras) {
    if (buf && buf.length + p.length + 2 > target) {
      out.push(buf.trim())
      buf = buf.slice(-overlap) + '\n' + p
    } else {
      buf = buf ? buf + '\n' + p : p
    }
    while (buf.length > hardMax) {
      out.push(buf.slice(0, hardMax).trim())
      buf = buf.slice(hardMax - overlap)
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}
