import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { initializeApp, cert, App } from 'firebase-admin/app'
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging'
import { PrismaService } from '../../shared/database/prisma.service'
import * as fs from 'fs'

export interface PushNotification {
  title: string
  body: string
  data?: Record<string, string>
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name)
  private app: App | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    try {
      const serviceAccount = this.loadServiceAccount()
      if (!serviceAccount) return
      this.app = initializeApp({ credential: cert(serviceAccount) }, 'merlotic')
      this.logger.log('Firebase Admin initialized')
    } catch (e) {
      this.logger.error('Firebase Admin init failed', e)
    }
  }

  private loadServiceAccount(): object | null {
    // Prefer file path (avoids multiline JSON issues in .env)
    const path = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH')
    if (path) {
      return JSON.parse(fs.readFileSync(path, 'utf8'))
    }
    const json = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON')
    if (json) {
      return JSON.parse(json)
    }
    this.logger.warn('Neither FIREBASE_SERVICE_ACCOUNT_PATH nor FIREBASE_SERVICE_ACCOUNT_JSON is set — push disabled')
    return null
  }

  async registerToken(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      update: { userId },
      create: { userId, token, platform: 'android' },
    })
  }

  async sendToUser(userId: string, notification: PushNotification): Promise<void> {
    if (!this.app) return
    const rows = await this.prisma.deviceToken.findMany({ where: { userId }, select: { token: true } })
    if (!rows.length) return
    await this.multicast(rows.map(r => r.token), notification)
  }

  async sendToAll(notification: PushNotification): Promise<void> {
    if (!this.app) return
    const rows = await this.prisma.deviceToken.findMany({ select: { token: true } })
    if (!rows.length) return
    await this.multicast(rows.map(r => r.token), notification)
  }

  private async multicast(tokens: string[], notification: PushNotification): Promise<void> {
    const messaging = getMessaging(this.app!)
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500)
      const message: MulticastMessage = {
        tokens: batch,
        data: { title: notification.title, body: notification.body, ...notification.data },
      }
      const res = await messaging.sendEachForMulticast(message)
      const stale = batch.filter((_, idx) =>
        !res.responses[idx].success &&
        res.responses[idx].error?.code === 'messaging/registration-token-not-registered',
      )
      if (stale.length) {
        await this.prisma.deviceToken.deleteMany({ where: { token: { in: stale } } })
      }
    }
  }
}
