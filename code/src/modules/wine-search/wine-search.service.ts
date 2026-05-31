import { Injectable, Logger } from '@nestjs/common'
import { AiModelsService } from '../ai-models/ai-models.service'

export interface WineRecognitionResult {
  producer: string
  name: string
  vintageYear?: number
  region?: string
  country?: string
  wineType?: string
  confidence: number
}

@Injectable()
export class WineSearchService {
  private readonly logger = new Logger(WineSearchService.name)

  constructor(private readonly aiModelsService: AiModelsService) {}

  async recognizeWinesFromImages(images: string[]): Promise<WineRecognitionResult[]> {
    if (!images || images.length === 0) throw new Error('No images provided')

    const model = await this.aiModelsService.getDefaultForPurpose('IMAGE_RECOGNITION')

    const promptConfig = (model.promptConfig as Record<string, unknown>) || {}
    const systemPrompt = (promptConfig.systemPrompt as string) || this.getDefaultImagePrompt()

    const baseUrl = model.baseUrl || 'https://api.mistral.ai/v1'
    const apiKey = model.apiKey

    this.logger.log(`Using model: ${model.name} at ${baseUrl}, images: ${images.length}`)

    const imageParts = images.map((img) => ({
      type: 'image_url' as const,
      image_url: { url: `data:image/jpeg;base64,${img}` },
    }))

    const requestBody = {
      model: model.name,
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

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    const responseText = await response.text()
    this.logger.log(`Mistral response status: ${response.status}`)

    if (!response.ok) {
      this.logger.error(`Mistral API error: ${responseText}`)
      throw new Error(`AI model error (${response.status}): ${responseText}`)
    }

    const data = JSON.parse(responseText)
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      this.logger.error(`No content in response: ${JSON.stringify(data)}`)
      throw new Error('Empty response from AI model')
    }

    this.logger.log(`AI response: ${content.substring(0, 200)}...`)

    const parsed = JSON.parse(content)
    return parsed.wines || []
  }

  async recognizeWineFromText(text: string): Promise<WineRecognitionResult[]> {
    if (!text || text.trim().length === 0) throw new Error('No text provided')

    try {
      const model = await this.aiModelsService.getDefaultForPurpose('TEXT_PROCESSING')
      this.logger.log(`Model: ${JSON.stringify(model)}`)

      const systemPrompt = this.getDefaultTextPrompt()

      const baseUrl = model.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
      const apiKey = model.apiKey

      this.logger.log(`Using text model: ${model.name} at ${baseUrl}`)

      const isGemini = baseUrl.includes('generativelanguage.googleapis.com')

      let response: Response
      const lines = text.trim().split('\n').filter(line => line.trim().length > 0)
      const formattedInput = lines.length > 1
        ? `Wine names (one per line):\n${lines.map((line, i) => `${i + 1}. ${line.trim()}`).join('\n')}`
        : text.trim()

      if (isGemini) {
        const url = `${baseUrl}/models/${model.name}:generateContent?key=${apiKey}`
        const requestBody = {
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n${formattedInput}` }],
            },
          ],
          generationConfig: { responseMimeType: 'application/json' },
        }

        this.logger.log(`Gemini request URL: ${url}`)
        this.logger.log(`Gemini request body: ${JSON.stringify(requestBody).substring(0, 500)}`)

        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })
      } else {
        const requestBody = {
          model: model.name,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: formattedInput },
          ],
          response_format: { type: 'json_object' },
        }

        response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
        })
      }

      const responseText = await response.text()
      this.logger.log(`Text model response status: ${response.status}`)
      this.logger.log(`Text model response body: ${responseText.substring(0, 500)}`)

      if (!response.ok) {
        this.logger.error(`Text model API error: ${responseText}`)
        throw new Error(`AI model error (${response.status}): ${responseText}`)
      }

      const data = JSON.parse(responseText)

      let content: string
      if (isGemini) {
        content = data.candidates?.[0]?.content?.parts?.[0]?.text
      } else {
        content = data.choices?.[0]?.message?.content
      }

      if (!content) {
        this.logger.error(`No content in response: ${JSON.stringify(data)}`)
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

    return wines.map((w: any) => ({
      producer: w.producer || '',
      name: w.wineName || w.fullName || '',
      vintageYear: w.vintage ? parseInt(w.vintage, 10) : undefined,
      region: w.region || null,
      country: w.country || null,
      wineType: wineTypeMap[w.wineType] || 'OTHER',
      confidence: confidenceMap[w.confidence] || 0.5,
    }))
    } catch (error) {
      this.logger.error(`recognizeWineFromText error: ${error}`)
      if (error instanceof Error) {
        throw new Error(error.message)
      }
      throw error
    }
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

Верни результат в формате JSON:
{
  "wines": [
    {
      "producer": "Название производителя",
      "name": "Название вина",
      "vintageYear": 2020,
      "region": "Регион",
      "country": "Страна (ISO2 код)",
      "wineType": "RED|WHITE|ROSE|SPARKLING|SWEET|FORTIFIED|OTHER",
      "confidence": 0.95
    }
  ]
}

Если не уверен в каком-то поле — оставь его null. Confidence — от 0 до 1.`
  }
}
