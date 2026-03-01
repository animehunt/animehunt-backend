import { Context, Next } from 'hono'

export async function auth(c: Context, next: Next) {

  const header = c.req.header('Authorization')

  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ message: 'Unauthorized' }, 401)
  }

  const token = header.split(' ')[1]

  // Simple validation
  if (!token || token.length < 10) {
    return c.json({ message: 'Invalid token' }, 401)
  }

  await next()
}
