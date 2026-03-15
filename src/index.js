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
import analyticsTrack from "./routes/analyticsTrack.js"
import analyticsAdmin from "./routes/analyticsAdmin.js"
import deploy from "./routes/deploy.js"

app.route("/api/admin", deploy)
app.route("/api", analyticsTrack)
app.route("/api/admin", analyticsAdmin)
import anime from "./routes/anime.js"

app.route("/api/admin", anime)
import banners from "./routes/banners.js"
import publicBanners from "./routes/publicBanners.js"

app.route("/api/admin", banners)
app.route("/api", publicBanners)
import episodes from "./routes/episodes.js"

app.route("/api/admin", episodes)
import publicEpisodes from "./routes/publicEpisodes.js"

app.route("/api", publicEpisodes)
import categories from "./routes/categories.js"

app.route("/api/admin", categories)
import publicCategories from "./routes/publicCategories.js"

app.route("/api", publicCategories)
import downloads from "./routes/downloads.js"

app.route("/api/admin", downloads)
import footer from "./routes/footer.js"

app.route("/api/admin", footer)
import homepage from "./routes/homepage.js"

app.route("/api/admin", homepage)
import system from "./routes/system.js"

app.route("/api/admin", system)
import performance from "./routes/performance.js"

app.route("/api/admin", performance)
import searchAdmin from "./routes/searchAdmin.js"
import searchPublic from "./routes/searchPublic.js"

app.route("/api/admin", searchAdmin)
app.route("/api", searchPublic)
