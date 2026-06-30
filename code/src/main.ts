import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { join } from 'path'
import { NestExpressApplication } from '@nestjs/platform-express'
import { json, urlencoded } from 'express'

async function bootstrap() {
  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bodyParser: false,
    })
    // req.protocol учитывает X-Forwarded-Proto (за прокси Render) — для прокси картинок
    app.set('trust proxy', true)

    const rawFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const frontendUrl = rawFrontendUrl.startsWith('http') ? rawFrontendUrl : `https://${rawFrontendUrl}`
    app.enableCors({
      origin: [
        frontendUrl,
        'http://localhost:3000',
        // фронтенд, открытый с других устройств локальной сети (телефон и т.п.)
        /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):5173$/,
      ],
      credentials: true,
    })

    app.use(json({ limit: '50mb' }))
    app.use(urlencoded({ limit: '50mb', extended: true }))

    app.useStaticAssets(join(__dirname, '..', 'uploads'), {
      prefix: '/uploads/',
    })

    const port = process.env.PORT ?? 3000
    await app.listen(port)
    console.log(`Server started on port ${port}`)
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}
bootstrap()
