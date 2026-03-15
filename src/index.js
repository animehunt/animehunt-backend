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
import { Hono } from 'hono'

import auth from './routes/auth.js'
import dashboard from './routes/dashboard.js'
import system from './routes/system.js'

const app = new Hono()

app.get('/', c => c.json({status:"AnimeHunt API Running"}))

app.route('/api/admin', auth)
app.route('/api/admin', dashboard)
app.route('/api/admin/system', system)

export default app
