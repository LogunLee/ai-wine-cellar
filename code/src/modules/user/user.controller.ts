import {
  Controller,
  Get,
  Post,
  Delete,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname, join } from 'path'
import { CurrentUser } from '../../shared/auth/current-user.decorator'
import type { AuthUser } from '../../shared/auth/current-user.decorator'
import { UserService } from './user.service'

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  async getMe(@CurrentUser() user: AuthUser) {
    return this.userService.getProfile(user.userId)
  }

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: join(__dirname, '../../uploads'),
        filename: (_req, file, cb) => {
          const uniqueName = `${Date.now()}${extname(file.originalname)}`
          cb(null, uniqueName)
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|gif|webp)$/)) {
          cb(new Error('Only image files are allowed'), false)
          return
        }
        cb(null, true)
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    const avatarPath = `/uploads/${file.filename}`
    await this.userService.updateAvatar(user.userId, avatarPath)
    return { avatarPath }
  }

  @Delete('avatar')
  async removeAvatar(@CurrentUser() user: AuthUser) {
    await this.userService.updateAvatar(user.userId, null as any)
    return { message: 'Avatar removed' }
  }
}
