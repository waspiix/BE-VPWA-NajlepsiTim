import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'

/**
 * auth middleware that blocks unauthenticated requests
 */
export default class AuthMiddleware {
  /**
   * redirect target when auth fails
   */
  redirectTo = '/login'

  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: {
      guards?: (keyof Authenticators)[]
    } = {}
  ) {
    const { request, response, auth } = ctx

    const wantsJson = !!(
      request.header('accept')?.includes('application/json') ||
      request.header('x-requested-with') === 'XMLHttpRequest' ||
      request.url().startsWith('/api')
    )

    try {
      // try provided guards in order
      if (options.guards && options.guards.length > 0) {
        // stop once one guard authenticates
        let authenticated = false
        for (const g of options.guards) {
          try {
            // auth.use expects guard name string
            await auth.use(g as any).authenticate()
            authenticated = true
            break
          } catch (_) {
            // try next guard
          }
        }

      if (!authenticated) {
        throw new Error('Unauthenticated')
      }
    } else {
        // fallback to default guard
        await auth.authenticate()
      }

      await next()
    } catch (err) {
      if (wantsJson) {
        return response.status(401).send({ error: 'E_UNAUTHORIZED_ACCESS' })
      }

      return response.redirect(this.redirectTo)
    }
  }
}
