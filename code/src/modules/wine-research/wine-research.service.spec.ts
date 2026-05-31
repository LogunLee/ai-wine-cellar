import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { AiModelsService } from '../ai-models/ai-models.service'
import { WineResearchService } from './wine-research.service'

describe('WineResearchService', () => {
  let service: WineResearchService
  let configService: ConfigService
  let aiModelsService: AiModelsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WineResearchService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JINA_API_KEY') return undefined
              return null
            }),
          },
        },
        {
          provide: AiModelsService,
          useValue: {
            getDefaultForPurpose: jest.fn(),
          },
        },
      ],
    }).compile()

    service = module.get<WineResearchService>(WineResearchService)
    configService = module.get<ConfigService>(ConfigService)
    aiModelsService = module.get<AiModelsService>(AiModelsService)
  })

  describe('generateSearchQueries', () => {
    it('should generate 5 queries with wine name and vintage', () => {
      const queries = service.generateSearchQueries({
        wineName: 'Château Margaux',
        vintage: '2015',
      })

      expect(queries.length).toBe(5)
      expect(queries[0]).toContain('Château Margaux')
      expect(queries[0]).toContain('2015')
      expect(queries[0]).toContain('tech sheet')
      expect(queries[4]).toContain('wine-searcher')
    })

    it('should generate queries without vintage when not provided', () => {
      const queries = service.generateSearchQueries({
        wineName: 'Château Margaux',
      })

      expect(queries.length).toBe(5)
      expect(queries.every((q) => !q.includes('2015'))).toBe(true)
    })

    it('should add site: query when producerHint is a URL', () => {
      const queries = service.generateSearchQueries({
        wineName: 'Château Margaux',
        vintage: '2015',
        producerHint: 'https://www.chateau-margaux.com',
      })

      expect(queries[0]).toContain('site:chateau-margaux.com')
      expect(queries[0]).toContain('Château Margaux')
      expect(queries[0]).toContain('2015')
      expect(queries.length).toBe(5)
    })

    it('should not add site: query when producerHint is not a URL', () => {
      const queries = service.generateSearchQueries({
        wineName: 'Château Margaux',
        producerHint: 'Château Margaux',
      })

      expect(queries[0]).not.toContain('site:')
    })

    it('should return empty array for empty wine name', () => {
      const queries = service.generateSearchQueries({
        wineName: '',
      })

      expect(queries.length).toBe(0)
    })

    it('should limit to MAX_SEARCH_QUERIES', () => {
      const queries = service.generateSearchQueries({
        wineName: 'Test',
        vintage: '2020',
        producerHint: 'https://example.com',
      })

      expect(queries.length).toBeLessThanOrEqual(5)
    })
  })

  describe('deduplicateUrls', () => {
    it('should remove duplicate URLs', () => {
      const results = [
        { title: 'A', url: 'https://example.com/wine' },
        { title: 'B', url: 'https://example.com/wine' },
        { title: 'C', url: 'https://other.com/wine' },
      ]

      const deduped = service['deduplicateUrls'](results as any)

      expect(deduped.length).toBe(2)
    })

    it('should treat URLs with and without trailing slash as same', () => {
      const results = [
        { title: 'A', url: 'https://example.com/wine' },
        { title: 'B', url: 'https://example.com/wine/' },
      ]

      const deduped = service['deduplicateUrls'](results as any)

      expect(deduped.length).toBe(1)
    })

    it('should be case-insensitive', () => {
      const results = [
        { title: 'A', url: 'https://Example.com/Wine' },
        { title: 'B', url: 'https://example.com/wine' },
      ]

      const deduped = service['deduplicateUrls'](results as any)

      expect(deduped.length).toBe(1)
    })
  })

  describe('classifySources', () => {
    it('should classify wine-searcher as wine_database with medium trust', () => {
      const results = [
        {
          title: 'Wine Info',
          url: 'https://www.wine-searcher.com/find/chateau-margaux',
        },
      ]

      const classified = service['classifySources'](results as any, {
        wineName: 'Château Margaux',
      })

      expect(classified[0].sourceType).toBe('wine_database')
      expect(classified[0].trustLevel).toBe('medium')
    })

    it('should classify social media URLs as unknown with low trust', () => {
      const results = [
        {
          title: 'Instagram Post',
          url: 'https://www.instagram.com/p/wine123',
        },
      ]

      const classified = service['classifySources'](results as any, {
        wineName: 'Château Margaux',
      })

      expect(classified[0].sourceType).toBe('unknown')
      expect(classified[0].trustLevel).toBe('low')
    })

    it('should classify shop URLs as shop with low trust', () => {
      const results = [
        {
          title: 'Buy Wine',
          url: 'https://www.shop.com/buy/chateau-margaux',
        },
      ]

      const classified = service['classifySources'](results as any, {
        wineName: 'Château Margaux',
      })

      expect(classified[0].sourceType).toBe('shop')
      expect(classified[0].trustLevel).toBe('low')
    })

    it('should classify blog URLs as blog with low trust', () => {
      const results = [
        {
          title: 'Wine Review',
          url: 'https://www.wineblog.com/review/chateau-margaux',
        },
      ]

      const classified = service['classifySources'](results as any, {
        wineName: 'Château Margaux',
      })

      expect(classified[0].sourceType).toBe('blog')
      expect(classified[0].trustLevel).toBe('low')
    })

    it('should classify official region URLs as official_region with high trust', () => {
      const results = [
        {
          title: 'AOC Info',
          url: 'https://www.inao.gouv.fr/margaux',
        },
      ]

      const classified = service['classifySources'](results as any, {
        wineName: 'Château Margaux',
      })

      expect(classified[0].sourceType).toBe('official_region')
      expect(classified[0].trustLevel).toBe('high')
    })
  })

  describe('parseLLMResponse', () => {
    it('should parse valid JSON response', () => {
      const content = JSON.stringify({
        wine: {
          fullName: 'Château Margaux 2015',
          producer: 'Château Margaux',
          country: 'France',
          region: 'Bordeaux',
          appellation: 'Margaux',
          vintage: '2015',
          wineType: 'RED',
          grapes: ['Cabernet Sauvignon', 'Merlot'],
          alcohol: '13.5%',
          sugar: null,
          acidity: null,
          aging: '18 months in oak',
          style: 'Full-bodied',
          tastingProfile: 'Blackcurrant, cedar, tobacco',
          storagePotential: '20-30 years',
          servingTemperature: '16-18°C',
          foodPairing: ['Red meat', 'Cheese'],
        },
      })

      const result = service['parseLLMResponse'](content)

      expect(result).not.toBeNull()
      expect(result?.wine.fullName).toBe('Château Margaux 2015')
      expect(result?.wine.grapes).toEqual(['Cabernet Sauvignon', 'Merlot'])
      expect(result?.wine.sugar).toBeNull()
    })

    it('should handle markdown code blocks', () => {
      const content = '```json\n{"wine":{"fullName":"Test","producer":null,"country":null,"region":null,"appellation":null,"vintage":null,"wineType":null,"grapes":null,"alcohol":null,"sugar":null,"acidity":null,"aging":null,"style":null,"tastingProfile":null,"storagePotential":null,"servingTemperature":null,"foodPairing":null}}\n```'

      const result = service['parseLLMResponse'](content)

      expect(result).not.toBeNull()
      expect(result?.wine.fullName).toBe('Test')
    })

    it('should return null for invalid JSON', () => {
      const result = service['parseLLMResponse']('not json')

      expect(result).toBeNull()
    })

    it('should return null when wine object is missing', () => {
      const content = JSON.stringify({ data: 'something' })

      const result = service['parseLLMResponse'](content)

      expect(result).toBeNull()
    })

    it('should convert non-array grapes to null', () => {
      const content = JSON.stringify({
        wine: {
          fullName: 'Test',
          producer: null,
          country: null,
          region: null,
          appellation: null,
          vintage: null,
          wineType: null,
          grapes: 'Cabernet',
          alcohol: null,
          sugar: null,
          acidity: null,
          aging: null,
          style: null,
          tastingProfile: null,
          storagePotential: null,
          servingTemperature: null,
          foodPairing: null,
        },
      })

      const result = service['parseLLMResponse'](content)

      expect(result?.wine.grapes).toBeNull()
    })
  })

  describe('findMissingFields', () => {
    it('should return all fields when all are null', () => {
      const wine = {
        fullName: null,
        producer: null,
        country: null,
        region: null,
        appellation: null,
        vintage: null,
        wineType: null,
        grapes: null,
        alcohol: null,
        sugar: null,
        acidity: null,
        aging: null,
        style: null,
        tastingProfile: null,
        storagePotential: null,
        servingTemperature: null,
        foodPairing: null,
      }

      const missing = service['findMissingFields'](wine)

      expect(missing.length).toBe(17)
    })

    it('should return only null fields', () => {
      const wine = {
        fullName: 'Château Margaux',
        producer: 'Château Margaux',
        country: 'France',
        region: 'Bordeaux',
        appellation: null,
        vintage: '2015',
        wineType: 'RED',
        grapes: ['Cabernet Sauvignon'],
        alcohol: '13.5%',
        sugar: null,
        acidity: null,
        aging: null,
        style: null,
        tastingProfile: null,
        storagePotential: null,
        servingTemperature: null,
        foodPairing: null,
      }

      const missing = service['findMissingFields'](wine)

      expect(missing).toContain('appellation')
      expect(missing).toContain('sugar')
      expect(missing).not.toContain('fullName')
      expect(missing).not.toContain('producer')
    })
  })

  describe('calculateConfidence', () => {
    it('should return high confidence when no critical fields missing and 3+ sources', () => {
      const wine = {
        fullName: 'Test',
        producer: 'Test',
        country: 'France',
        region: 'Bordeaux',
        appellation: null,
        vintage: '2015',
        wineType: 'RED',
        grapes: ['Cabernet'],
        alcohol: '13%',
        sugar: null,
        acidity: null,
        aging: null,
        style: null,
        tastingProfile: null,
        storagePotential: null,
        servingTemperature: null,
        foodPairing: null,
      }

      const confidence = service['calculateConfidence'](wine, ['appellation', 'sugar', 'acidity', 'aging', 'style', 'tastingProfile', 'storagePotential', 'servingTemperature', 'foodPairing'], 3)

      expect(confidence).toBe('high')
    })

    it('should return medium confidence when some critical fields missing', () => {
      const wine = {
        fullName: 'Test',
        producer: 'Test',
        country: null,
        region: null,
        appellation: null,
        vintage: '2015',
        wineType: 'RED',
        grapes: ['Cabernet'],
        alcohol: '13%',
        sugar: null,
        acidity: null,
        aging: null,
        style: null,
        tastingProfile: null,
        storagePotential: null,
        servingTemperature: null,
        foodPairing: null,
      }

      const confidence = service['calculateConfidence'](wine, ['country', 'region', 'appellation'], 1)

      expect(confidence).toBe('medium')
    })

    it('should return low confidence when many critical fields missing', () => {
      const wine = {
        fullName: null,
        producer: null,
        country: null,
        region: null,
        appellation: null,
        vintage: null,
        wineType: null,
        grapes: null,
        alcohol: null,
        sugar: null,
        acidity: null,
        aging: null,
        style: null,
        tastingProfile: null,
        storagePotential: null,
        servingTemperature: null,
        foodPairing: null,
      }

      const confidence = service['calculateConfidence'](wine, ['fullName', 'producer', 'country', 'region', 'wineType'], 0)

      expect(confidence).toBe('low')
    })
  })

  describe('emptyResult', () => {
    it('should return result with all null fields and low confidence', () => {
      const result = service['emptyResult'](['Test note'])

      expect(result.confidence).toBe('low')
      expect(result.wine.fullName).toBeNull()
      expect(result.wine.producer).toBeNull()
      expect(result.missingFields.length).toBeGreaterThan(0)
      expect(result.sources).toEqual([])
      expect(result.notes).toEqual(['Test note'])
    })
  })
})
