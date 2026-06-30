import { Controller, Get, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ImageProxyService } from './image-proxy.service'

/** Публичный (без JWT — Coil не шлёт заголовки): нормализация картинок магазинов. */
@Controller('discounts')
export class ImageProxyController {
  constructor(private readonly imageProxy: ImageProxyService) {}

  @Get('image')
  async image(@Query('u') u: string, @Query('s') s: string, @Res() res: Response) {
    const buf = await this.imageProxy.normalize(u, s)
    if (!buf) {
      res.status(404).end()
      return
    }
    res.set('Content-Type', 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=86400, immutable')
    res.send(buf)
  }
}
