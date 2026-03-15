import { Hono } from 'hono'
import { verifyAdmin } from '../middleware/adminAuth.js'

const app = new Hono()

app.get('/dashboard',verifyAdmin, async(c)=>{

const db = c.env.DB

const anime = await db.prepare("SELECT COUNT(*) as total FROM anime").first()
const episodes = await db.prepare("SELECT COUNT(*) as total FROM episodes").first()
const categories = await db.prepare("SELECT COUNT(*) as total FROM categories").first()
const banners = await db.prepare("SELECT COUNT(*) as total FROM banners").first()
const downloads = await db.prepare("SELECT COUNT(*) as total FROM downloads").first()
const servers = await db.prepare("SELECT COUNT(*) as total FROM servers").first()

const trending = await db.prepare("SELECT COUNT(*) as total FROM anime WHERE trending=1").first()
const ongoing = await db.prepare("SELECT COUNT(*) as total FROM anime WHERE status='ongoing'").first()
const topRated = await db.prepare("SELECT COUNT(*) as total FROM anime WHERE rating>=8").first()

return c.json({

core:{
animeCount: anime?.total || 0,
episodeCount: episodes?.total || 0,
categoryCount: categories?.total || 0,
bannerCount: banners?.total || 0,
downloadCount: downloads?.total || 0,
serverCount: servers?.total || 0
},

growth:{
activeAds:3,
todayRevenue:0,
adClicks:0,
trendingAnime: trending?.total || 0,
ongoingAnime: ongoing?.total || 0,
topRated: topRated?.total || 0
},

system:{
cmsStatus:"OK",
serverLoad:"Low",
apiStatus:"Online",
aiStatus:"Active",
searchStatus:"Ready",
backupStatus:"Synced"
}

})

})

export default app
