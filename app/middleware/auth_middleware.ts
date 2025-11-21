import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'

/**
 * Auth middleware is used authenticate HTTP requests and deny
 * access to unauthenticated users.
 */
export default class AuthMiddleware {
  /**
   * The URL to redirect to, when authentication fails
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
      // If specific guards are provided, try them in order
      if (options.guards && options.guards.length > 0) {
        // try each guard until one authenticates successfully
        let authenticated = false
        for (const g of options.guards) {
          try {
            // auth.use expects the guard name as string
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
        // default: authenticate using default guard
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