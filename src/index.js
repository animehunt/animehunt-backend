import { Hono } from 'hono'
import adminAuth from './routes/auth.js'

const app = new Hono()

app.get('/', (c) => {
  return c.json({
    status: "AnimeHunt Backend Running"
  })
})

app.route('/api/admin', adminAuth)

export default app
