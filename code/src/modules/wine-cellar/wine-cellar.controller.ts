import { Controller, Post, Get, Put, Delete, Body, UseGuards, Param, UploadedFile, UseInterceptors } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { FileInterceptor } from '@nestjs/platform-express'
import { CurrentUser } from '../../shared/auth/current-user.decorator'
import type { AuthUser } from '../../shared/auth/current-user.decorator'
import { WineCellarService } from './wine-cellar.service'
import type { AddWineToCellarDto } from './wine-cellar.service'

@Controller('wine-cellar')
@UseGuards(AuthGuard('jwt'))
export class WineCellarController {
  constructor(private readonly wineCellarService: WineCellarService) {}

  @Get('items')
  async getItems(@CurrentUser() user: AuthUser) {
    return this.wineCellarService.getCellarItems(user.userId)
  }

  @Post('add')
  async addToCellar(
    @CurrentUser() user: AuthUser,
    @Body() body: AddWineToCellarDto,
  ) {
    return this.wineCellarService.addToCellar(user.userId, body)
  }

  @Put(':id/vivino-url')
  async setVivinoUrl(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { vivinoUrl: string },
  ) {
    return this.wineCellarService.setVivinoUrl(user.userId, id, body.vivinoUrl)
  }

  @Put(':id/wine-searcher-url')
  async setWineSearcherUrl(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { wineSearcherUrl: string },
  ) {
    return this.wineCellarService.setWineSearcherUrl(user.userId, id, body.wineSearcherUrl)
  }

  @Put(':id')
  async updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Partial<AddWineToCellarDto>,
  ) {
    return this.wineCellarService.updateCellarItem(user.userId, id, body)
  }

  @Delete(':id')
  async deleteItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    await this.wineCellarService.deleteCellarItem(user.userId, id)
    return { message: 'Удалено' }
  }

  @Get(':id/note')
  async getNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.wineCellarService.getCellarNote(user.userId, id)
  }

  @Post(':id/note')
  async saveNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { text: string },
  ) {
    return this.wineCellarService.saveCellarNote(user.userId, id, body.text)
  }

  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('photo'))
  async uploadPhoto(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.wineCellarService.uploadCellarPhoto(user.userId, id, file)
  }

  @Post(':id/fetch-photo')
  async fetchPhoto(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { producer: string; name: string; vintageYear?: number },
  ) {
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
