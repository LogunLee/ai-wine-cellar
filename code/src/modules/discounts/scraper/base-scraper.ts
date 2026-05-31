import { Store } from '@prisma/client'

export interface RawScrapedOffer {
  externalId?: string
  title: string
  url: string
  imageUrl?: string
  currentPrice?: number
  oldPrice?: number
  discountPercent?: number
  availability?: string
  rawPayload: unknown
}

export interface ScraperResult {
  offers: RawScrapedOffer[]
}

export interface ScraperCallbacks {
  saveAndNormalize: (offers: RawScrapedOffer[], storeId: string, jobId: string) => Promise<{ created: number; updated: number; normalized: number }>
}

export interface ScraperCheckpointCallbacks {
  saveCheckpoint: (category: string, pageNum: number, lastUrl: string | null, offersCollected: number) => Promise<void>
  startHeartbeat: (category: string) => void
  stopHeartbeat: (category: string) => void
}

export abstract class BaseScraper {
  abstract storeCode: string
  protected readonly logger = new (require('@nestjs/common').Logger)(this.constructor.name)
  protected readonly PAGE_RECREATE_INTERVAL = 15
  protected readonly OPERATION_TIMEOUT = 120000

  abstract scrape(store: Store, jobId: string, callbacks?: ScraperCallbacks, checkpointCallbacks?: ScraperCheckpointCallbacks): Promise<ScraperResult>
}
