import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaClient } from '@prisma/client'
import { createHash, randomUUID } from 'crypto'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtService: JwtService,
  ) {}

  async validateGoogleUser(profile: {
    id: string
    emails?: { value: string }[]
    displayName?: string
  }) {
    const providerUserId = profile.id
    const email = profile.emails?.[0]?.value
    const displayName = profile.displayName

    let identity = await this.prisma.oAuthIdentity.findUnique({
      where: { provider_providerUserId: { provider: 'GOOGLE', providerUserId } },
      include: { user: true },
    })

    if (identity) {
      return identity.user
    }

    if (!email) {
      throw new Error('Google account has no email')
    }

    let user = await this.prisma.user.findUnique({ where: { email } })

    if (user) {
      await this.prisma.oAuthIdentity.create({
        data: {
          userId: user.id,
          provider: 'GOOGLE',
          providerUserId,
          providerEmail: email,
        },
      })
      return user
    }

    user = await this.prisma.user.create({
      data: {
        email,
        displayName,
        emailVerified: true,
        oauthIdentities: {
          create: {
            provider: 'GOOGLE',
            providerUserId,
            providerEmail: email,
          },
        },
        wineCellars: {
          create: {
            name: 'Мой погреб',
          },
        },
      },
    })

    return user
  }

  async generateTokens(userId: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId },
      { expiresIn: '15m' },
    )

    const rawRefreshToken = randomUUID()
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    })

    return { access_token: accessToken, refresh_token: rawRefreshToken }
  }

  async refreshTokens(refreshToken: string) {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex')

    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    })

    if (!stored) {
      throw new Error('Invalid or expired refresh token')
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })

    const tokens = await this.generateTokens(stored.userId)

    return { ...tokens, user: this.sanitizeUser(stored.user) }
  }

  async revokeRefreshToken(userId: string, refreshToken: string) {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex')
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash },
      data: { revokedAt: new Date() },
    })
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new Error('User not found')
    return this.sanitizeUser(user)
  }

  private sanitizeUser(user: {
    id: string
    email: string
    login?: string | null
    displayName?: string | null
  }) {
    return {
      id: user.id,
      email: user.email,
      login: user.login,
      displayName: user.displayName,
    }
  }
}
