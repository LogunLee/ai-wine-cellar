import { createParamDecorator, ExecutionContext } from '@nestjs/common'

/** Форма req.user, которую кладёт JwtStrategy.validate() */
export interface AuthUser {
  userId: string
}

/**
 * Достаёт пользователя из запроса, прошедшего AuthGuard('jwt').
 * Заменяет паттерн `const user = (req as any).user as { userId: string }`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
)
