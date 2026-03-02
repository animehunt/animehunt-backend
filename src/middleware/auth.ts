import { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'

export async function auth(c: Context, next: Next) {

  const session = getCookie(c, 'session')

  if (session !== 'admin_logged_in') {
    return c.json({ message: 'Unauthorized' }, 401)
  }

  await next()
}
