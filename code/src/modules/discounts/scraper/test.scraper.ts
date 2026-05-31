import { Injectable } from '@nestjs/common'
import { Store } from '@prisma/client'
import { BaseScraper, RawScrapedOffer, ScraperResult, ScraperCallbacks } from './base-scraper'

@Injectable()
export class TestScraper extends BaseScraper {
  storeCode = 'test'

  async scrape(_store: Store, _jobId: string, _callbacks?: ScraperCallbacks): Promise<ScraperResult> {
    const offers: RawScrapedOffer[] = [
      {
        externalId: 'test-1',
        title: 'Chateau Margaux 2015',
        url: 'https://example.com/wine/1',
        currentPrice: 15000,
        oldPrice: 20000,
        availability: 'in_stock',
        rawPayload: { source: 'test' },
      },
      {
        externalId: 'test-2',
        title: 'Barolo Riserva DOCG 2018',
        url: 'https://example.com/wine/2',
        currentPrice: 3500,
        oldPrice: 5000,
        availability: 'in_stock',
        rawPayload: { source: 'test' },
      },
    ]

    return { offers }
  }
}
