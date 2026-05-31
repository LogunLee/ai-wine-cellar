import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../shared/database/prisma.service'

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new Error('User not found')
    return {
      id: user.id,
      email: user.email,
      login: user.login,
      displayName: user.displayName,
      avatarPath: user.avatarPath,
    }
  }

  async updateAvatar(userId: string, avatarPath: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarPath },
    })
  }
}
