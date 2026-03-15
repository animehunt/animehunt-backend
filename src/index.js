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
import ads from "./routes/ads.js"
import publicAds from "./routes/publicAds.js"
import adClick from "./routes/adClick.js"
import adsAnalytics from "./routes/adsAnalytics.js"

app.route("/api/admin", ads)
app.route("/api/admin", adsAnalytics)

app.route("/api", publicAds)
app.route("/api", adClick)
import ai from "./routes/ai.js"

app.route("/api/admin", ai)
import { runAIEngines } from "./services/aiScheduler.js"

export default {

fetch: app.fetch,

async scheduled(event, env){

await runAIEngines(env)

}

}
