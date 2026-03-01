import { Hono } from 'hono'

const login = new Hono()

login.post('/', async (c) => {

  const { username, password } = await c.req.json()

  if (!username || !password) {
    return c.json({ message: 'Missing credentials' }, 400)
  }

  const user = await c.env.DB
    .prepare('SELECT * FROM admin_users WHERE username = ?')
    .bind(username)
    .first()

  if (!user || user.password !== password) {
    return c.json({ message: 'Invalid credentials' }, 401)
  }

  // Simple token generate
  const token = crypto.randomUUID()

  return c.json({
    token
  })
})

export default login
