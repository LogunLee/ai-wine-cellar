import { Controller, Post, Get, Put, Delete, Body, UseGuards, Req, Param, UploadedFile, UseInterceptors } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { FileInterceptor } from '@nestjs/platform-express'
import { WineCellarService } from './wine-cellar.service'
import type { AddWineToCellarDto } from './wine-cellar.service'
import type { Request } from 'express'

@Controller('wine-cellar')
@UseGuards(AuthGuard('jwt'))
export class WineCellarController {
  constructor(private readonly wineCellarService: WineCellarService) {}

  @Get('items')
  async getItems(@Req() req: Request) {
    const user = (req as any).user as { userId: string }
    return this.wineCellarService.getCellarItems(user.userId)
  }

  @Post('add')
  async addToCellar(
    @Req() req: Request,
    @Body() body: AddWineToCellarDto,
  ) {
    const user = (req as any).user as { userId: string }
    return this.wineCellarService.addToCellar(user.userId, body)
  }

  @Put(':id/vivino-url')
  async setVivinoUrl(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { vivinoUrl: string },
  ) {
    const user = (req as any).user as { userId: string }
    return this.wineCellarService.setVivinoUrl(user.userId, id, body.vivinoUrl)
  }

  @Put(':id/wine-searcher-url')
  async setWineSearcherUrl(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { wineSearcherUrl: string },
  ) {
    const user = (req as any).user as { userId: string }
    return this.wineCellarService.setWineSearcherUrl(user.userId, id, body.wineSearcherUrl)
  }

  @Put(':id')
  async updateItem(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: Partial<AddWineToCellarDto>,
  ) {
    const user = (req as any).user as { userId: string }
    return this.wineCellarService.updateCellarItem(user.userId, id, body)
  }

  @Delete(':id')
  async deleteItem(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const user = (req as any).user as { userId: string }
    await this.wineCellarService.deleteCellarItem(user.userId, id)
    return { message: 'Удалено' }
  }

  @Get(':id/note')
  async getNote(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const user = (req as any).user as { userId: string }
    return this.wineCellarService.getCellarNote(user.userId, id)
  }

  @Post(':id/note')
  async saveNote(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { text: string },
  ) {
    const user = (req as any).user as { userId: string }
    return this.wineCellarService.saveCellarNote(user.userId, id, body.text)
  }

  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('photo'))
  async uploadPhoto(
    @Req() req: Request,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = (req as any).user as { userId: string }
    return this.wineCellarService.uploadCellarPhoto(user.userId, id, file)
  }

  @Post(':id/fetch-photo')
  async fetchPhoto(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { producer: string; name: string; vintageYear?: number },
  ) {
    const user = (req as any).user as { userId: string }
    return this.wineCellarService.fetchWinePhoto(user.userId, id, body)
  }
}

@Controller('countries')
export class CountriesController {
  constructor(private readonly wineCellarService: WineCellarService) {}

  @Get()
  async getCountries() {
    return this.wineCellarService.getCountries()
  }
}
