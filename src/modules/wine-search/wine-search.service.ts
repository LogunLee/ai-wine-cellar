import { Injectable } from '@nestjs/common'
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
  constructor(private readonly aiModelsService: AiModelsService) {}

  async recognizeWinesFromImage(imageBase64: string): Promise<WineRecognitionResult[]> {
    const model = await this.aiModelsService.getDefaultForPurpose('IMAGE_RECOGNITION')

    const promptConfig = (model.promptConfig as Record<string, unknown>) || {}
    const systemPrompt = (promptConfig.systemPrompt as string) || this.getDefaultImagePrompt()

    const baseUrl = model.baseUrl || 'https://api.openai.com/v1'
    const apiKey = model.apiKey

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.name,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
              },
              {
                type: 'text',
                text: 'Распознай вина на этом изображении и верни результат в формате JSON.',
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      throw new Error(`AI model error: ${response.statusText}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('Empty response from AI model')
    }

    const parsed = JSON.parse(content)
    return parsed.wines || []
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
