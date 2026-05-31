import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy, VerifyCallback } from 'passport-google-oauth20'
import { AuthService } from './auth.service'

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly authService: AuthService,
    config: { clientID: string; clientSecret: string; callbackURL: string },
  ) {
    super({
      ...config,
      scope: ['email', 'profile'],
    })
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    try {
      const user = await this.authService.validateGoogleUser({
        id: profile.id,
        emails: profile.emails,
        displayName: profile.displayName,
      })
      done(null, user)
    } catch (error) {
      done(error as Error)
    }
  }
}
