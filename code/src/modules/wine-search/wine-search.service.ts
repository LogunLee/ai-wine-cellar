import { Injectable, Logger } from '@nestjs/common'
import { AiRouterService, ResolvedAi } from '../ai-settings/ai-router.service'

export interface WineRecognitionResult {
  producer: string
  name: string
  vintageYear?: number
  region?: string
  country?: string
  wineType?: string
  grapes?: string[] | null
  confidence: number
}

@Injectable()
export class WineSearchService {
  private readonly logger = new Logger(WineSearchService.name)

  constructor(private readonly aiRouter: AiRouterService) {}

  async recognizeWinesFromImages(userId: string, images: string[]): Promise<WineRecognitionResult[]> {
    if (!images || images.length === 0) throw new Error('No images provided')

    const resolved = await this.aiRouter.resolveForUser(userId, 'label_recognition')

    const systemPrompt =
      resolved.promptOverride ||
      (resolved.promptConfig?.systemPrompt as string) ||
      this.getDefaultImagePrompt()

    this.logger.log(`Image recognition via ${resolved.providerCode}/${resolved.modelCode} (${resolved.source}), images: ${images.length}`)

    const imageParts = images.map((img) => ({
      type: 'image_url' as const,
      image_url: { url: `data:image/jpeg;base64,${img}` },
    }))

    const requestBody = {
      model: resolved.modelCode,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            ...imageParts,
            {
              type: 'text',
              text: `Распознай вина на этих ${images.length} изображени${images.length === 1 ? 'и' : 'ях'} и верни результат в формате JSON.`,
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    }

    const response = await fetch(`${resolved.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolved.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    const responseText = await response.text()
    this.logger.log(`Image model response status: ${response.status}`)

    if (!response.ok) {
      this.logger.error(`Image model API error: status ${response.status}`)
      throw new Error(`AI model error (${response.status}): ${responseText}`)
    }

    const data = JSON.parse(responseText)
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      this.logger.error('No content in image model response')
      throw new Error('Empty response from AI model')
    }

    this.logger.log(`AI response: ${content.substring(0, 200)}...`)

    const parsed = JSON.parse(content)
    if (resolved.source === 'trial') {
      await this.aiRouter.commitTrialUse(userId, 'label_recognition')
    }
    return parsed.wines || []
  }

  async recognizeWineFromText(userId: string, text: string): Promise<WineRecognitionResult[]> {
    if (!text || text.trim().length === 0) throw new Error('No text provided')

    try {
      const resolved = await this.aiRouter.resolveForUser(userId, 'text_search')
      const systemPrompt = resolved.promptOverride || this.getDefaultTextPrompt()

      this.logger.log(`Text search via ${resolved.providerCode}/${resolved.modelCode} (${resolved.source})`)

      const lines = text.trim().split('\n').filter(line => line.trim().length > 0)
      const formattedInput = lines.length > 1
        ? `Wine names (one per line):\n${lines.map((line, i) => `${i + 1}. ${line.trim()}`).join('\n')}`
        : text.trim()

      const content = await this.callTextModel(resolved, systemPrompt, formattedInput)

      if (!content) {
        throw new Error('Empty response from AI model')
      }

      this.logger.log(`Text AI response: ${content.substring(0, 200)}...`)

      const cleaned = content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
      const parsed = JSON.parse(cleaned)

      const wineTypeMap: Record<string, string> = {
        red: 'RED',
        white: 'WHITE',
        rose: 'ROSE',
        sparkling: 'SPARKLING',
        dessert: 'SWEET',
        fortified: 'FORTIFIED',
        unknown: 'OTHER',
      }

      const confidenceMap: Record<string, number> = {
        high: 0.9,
        medium: 0.7,
        low: 0.4,
      }

      const wines = parsed.wines || [parsed]

      if (resolved.source === 'trial') {
        await this.aiRouter.commitTrialUse(userId, 'text_search')
      }

      return wines.map((w: any) => ({
        producer: w.producer || '',
        name: w.wineName || w.fullName || '',
        vintageYear: w.vintage ? parseInt(w.vintage, 10) : undefined,
        region: w.region || null,
        country: w.country || null,
        wineType: wineTypeMap[w.wineType] || 'OTHER',
        grapes: Array.isArray(w.grapeVarieties) && w.grapeVarieties.length > 0 ? w.grapeVarieties : null,
        confidence: confidenceMap[w.confidence] || 0.5,
      }))
    } catch (error) {
      this.logger.error(`recognizeWineFromText error: ${error}`)
      if (error instanceof Error) {
        throw error
      }
      throw error
    }
  }

  /** Текстовый вызов: OpenAI-совместимый chat/completions либо нативный Gemini generateContent. */
  private async callTextModel(resolved: ResolvedAi, systemPrompt: string, userInput: string): Promise<string | null> {
    let response: Response

    if (!resolved.openAiCompatible) {
      const url = `${resolved.baseUrl}/models/${resolved.modelCode}:generateContent?key=${resolved.apiKey}`
      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userInput}` }],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }

      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
    } else {
      const requestBody = {
        model: resolved.modelCode,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInput },
        ],
        response_format: { type: 'json_object' },
      }

      response = await fetch(`${resolved.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resolved.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      })
    }

    const responseText = await response.text()
    this.logger.log(`Text model response status: ${response.status}`)

    if (!response.ok) {
      this.logger.error(`Text model API error: status ${response.status}`)
      throw new Error(`AI model error (${response.status}): ${responseText}`)
    }

    const data = JSON.parse(responseText)
    return resolved.openAiCompatible
      ? data.choices?.[0]?.message?.content ?? null
      : data.candidates?.[0]?.content?.parts?.[0]?.text ?? null
  }

  private getDefaultTextPrompt(): string {
    return `You are a wine name normalizer and entity extractor.

Task:
Given a list of user-entered wine names (one per line), possibly with typos, transliteration, missing accents, mixed Russian/English/French/Italian/Spanish spelling, extract the most likely wine identity for each name.

Rules:
1. Return only valid JSON.
2. Do not invent rare facts.
3. If a field is uncertain, return null and add the field name to uncertainFields.
4. If the wine is well-known and the correction is obvious, normalize it.
5. Preserve the vintage only if it is explicitly present in the input.
6. Do not use web search.
7. Do not return tasting notes.
8. Do not return prices.
9. The goal is not a full wine card, only normalized identity.
10. If several wines are possible, set confidence="low" and add alternatives.

Return JSON with this schema:
{
  "wines": [
    {
      "producer": string | null,
      "wineName": string | null,
      "fullName": string | null,
      "vintage": string | null,
      "country": string | null,
      "region": string | null,
      "originZone": string | null,
      "grapeVarieties": string[],
      "wineType": "red" | "white" | "rose" | "sparkling" | "dessert" | "fortified" | "unknown",
      "normalizedSearchQuery": string,
      "alternativeQueries": string[],
      "confidence": "high" | "medium" | "low",
      "needsVerification": boolean,
      "uncertainFields": string[]
    }
  ]
}

Process each wine name separately and return all of them in the "wines" array.`
  }

  private getDefaultImagePrompt(): string {
    return `Ты — эксперт по распознаванию вин по этикеткам. Проанализируй изображение и определи все вина, которые на нём видны.

Правила:
- country — ОБЯЗАТЕЛЬНО двухбуквенный код ISO 3166-1 alpha-2 (например: FR, IT, ES, RU, US, DE, AR, CL, AU, ZA, PT, GE, AM). Никаких полных названий стран — только код.
- Если поле неизвестно — верни null.
- Confidence — от 0 до 1.

Верни результат в формате JSON:
{
  "wines": [
    {
      "producer": "Название производителя",
      "name": "Название вина",
      "vintageYear": 2020,
      "region": "Регион",
      "country": "FR",
      "wineType": "RED|WHITE|ROSE|SPARKLING|SWEET|FORTIFIED|OTHER",
      "confidence": 0.95
    }
  ]
}`
  }
}
