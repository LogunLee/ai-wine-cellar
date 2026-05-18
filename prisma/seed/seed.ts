import 'dotenv/config'
import { PrismaClient, AiModelPurpose } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const models = [
    {
      name: 'ministral-3b-latest',
      provider: 'Mistral AI',
      purpose: AiModelPurpose.IMAGE_RECOGNITION,
      apiKey: process.env.MISTRAL_API_KEY || '',
      baseUrl: 'https://api.mistral.ai/v1',
      promptConfig: {
        systemPrompt: `Ты — эксперт по распознаванию вин по этикеткам. Проанализируй изображение и определи все вина, которые на нём видны.

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

Если не уверен в каком-то поле — оставь его null. Confidence — от 0 до 1.`,
      },
      isDefault: true,
      isActive: true,
    },
  ]

  for (const model of models) {
    const existing = await prisma.aiModel.findFirst({
      where: { name: model.name, provider: model.provider },
    })

    if (!existing) {
      await prisma.aiModel.create({ data: model })
      console.log(`Created AI model: ${model.name} (${model.provider})`)
    } else {
      console.log(`AI model already exists: ${model.name}`)
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
