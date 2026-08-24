/* ============================================================
   src/routes/seoSSR.js
   SERVER-SIDE RENDERING (SSR) FOR SOCIAL MEDIA SEO PREVIEWS
   Intercepts HTML requests for watch.html & details.html,
   fetches meta tags from the DB (with Redis KV Caching), 
   strips old tags, and injects dynamic SEO into <head>.
============================================================ */

import { Hono } from "hono"
import { promises as fs } from "fs"
import path from "path"

const app = new Hono()

// In-memory cache for raw HTML files to prevent continuous disk reading
const htmlFileCache = {}

// Helper to safely truncate descriptions
function safeDesc(desc, title, maxLen = 155) {
  if (desc && desc.trim()) {
    const s = desc.trim()
    return s.length > maxLen ? s.slice(0, maxLen) + "..." : s
  }
  return `Watch ${title || "Anime"} Hindi Dubbed online free on AnimeHunt.`
}

// Read and cache raw HTML files from the frontend directory
async function getRawHtml(filename) {
    if (htmlFileCache[filename]) return htmlFileCache[filename];
    const frontendDir = process.env.FRONTEND_DIR || "../animehunt-frontend";
    const filePath = path.resolve(process.cwd(), frontendDir, filename);
    const html = await fs.readFile(filePath, "utf-8");
    htmlFileCache[filename] = html;
    return html;
}

// Generates the raw HTML meta tags from the Database
async function generateMetaTags(env, slug, season, ep, type) {
  const db = env.DB
  
  // Fetch anime details
  const anime = await db.prepare(
    "SELECT id, title, slug, description, poster, banner, type, status, year, genres, language FROM anime WHERE (slug=? OR id=?) AND active=1 AND is_hidden=0 LIMIT 1"
  ).bind(slug, slug).first().catch(() => null)

  if (!anime) return null

  // Fetch SEO settings templates
  const seoRow = await db.prepare(
    "SELECT canonical, tpl_anime, tpl_movie, tpl_cartoon, tpl_episode FROM seo_settings WHERE id=1"
  ).first().catch(() => null)

  const base = (seoRow?.canonical || "https://animehunt.in").replace(/\/$/, "")

  let metaTitle = ""
  let epDesc = ""

  // Resolve SEO Templates correctly matching publicSEO.js standards
  if (type === "watch" && season && ep) {
      const episodeRow = await db.prepare("SELECT title, description FROM episodes WHERE anime_id=? AND season=? AND episode=? LIMIT 1")
        .bind(anime.id, season, ep).first().catch(() => null)
      
      let epTemplate = seoRow?.tpl_episode || "Watch {anime} Season {season} Episode {ep} - {title}"
      metaTitle = epTemplate
        .replace(/{anime}/g, anime.title || "")
        .replace(/{season}/g, season)
        .replace(/{ep}/g, ep)
        .replace(/{title}/g, episodeRow?.title || `Episode ${ep}`)
        .replace(/{type}/g, anime.type || "anime")
        .replace(/{year}/g, anime.year || "")
        .replace(/{status}/g, anime.status || "")
        
      epDesc = episodeRow?.description || ""
  } else {
      let template = anime.type === "movie" ? (seoRow?.tpl_movie || "{title} Hindi Dubbed Movie")
        : anime.type === "cartoon" ? (seoRow?.tpl_cartoon || "{title} Hindi Dubbed Cartoon")
        : (seoRow?.tpl_anime || "{title} Hindi Dubbed - Watch Free")
        
      metaTitle = template
        .replace(/{title}/g, anime.title || "")
        .replace(/{type}/g, anime.type || "anime")
        .replace(/{year}/g, anime.year || "")
        .replace(/{status}/g, anime.status || "")
  }
  
  metaTitle = metaTitle.slice(0, 65)
  const ogUrl = type === "watch" 
    ? `${base}/watch.html?slug=${anime.slug}&season=${season}&ep=${ep}`
    : `${base}/details.html?slug=${anime.slug}`

  const metaDesc = safeDesc(epDesc || anime.description, anime.title, 160)
  const ogImage = anime.poster || anime.banner || ""
  
  let genres = []
  try { genres = JSON.parse(anime.genres || "[]") } catch {}
  const keywords = [anime.title, `${anime.title} hindi dubbed`, ...genres.slice(0,3), "anime", "animehunt"].filter(Boolean).join(", ")

  return `
<!-- SSR SEO INJECTED BY ANIMEHUNT BACKEND -->
<title>${metaTitle}</title>
<meta name="description" content="${metaDesc}">
<meta name="keywords" content="${keywords}">
<meta property="og:type" content="${type === 'watch' ? 'video.episode' : 'video.tv_show'}">
<meta property="og:title" content="${metaTitle}">
<meta property="og:description" content="${metaDesc}">
<meta property="og:image" content="${ogImage}">
<meta property="og:url" content="${ogUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${metaTitle}">
<meta name="twitter:description" content="${metaDesc}">
<meta name="twitter:image" content="${ogImage}">
`
}

// Master rendering function with Regex stripping & KV Caching
async function renderWithSEO(c, filename, slug, season, ep, type) {
    try {
        let html = await getRawHtml(filename);
        
        if (slug) {
            // Redis KV Caching logic to prevent DB spam from social bots
            const cacheKey = `ssr:seo:${filename}:${slug}:${season || '0'}:${ep || '0'}`;
            let metaTags = null;
            
            if (c.env.KV) {
                metaTags = await c.env.KV.get(cacheKey).catch(() => null);
            }
            
            if (!metaTags) {
                metaTags = await generateMetaTags(c.env, slug, season, ep, type);
                // Cache for 1 hour
                if (metaTags && c.env.KV) {
                    await c.env.KV.put(cacheKey, metaTags, { expirationTtl: 3600 }).catch(() => {});
                }
            }

            if (metaTags) {
                // Strip out existing generic title and description to prevent duplicates
                html = html.replace(/<title>.*?<\/title>/gi, "");
                html = html.replace(/<meta\s+name=["']description["'].*?>/gi, "");
                html = html.replace(/<meta\s+property=["']og:.*?["'].*?>/gi, "");
                html = html.replace(/<meta\s+name=["']twitter:.*?["'].*?>/gi, "");
                
                // Inject the real server-rendered tags right before </head>
                html = html.replace("</head>", `${metaTags}\n</head>`);
            }
        }
        return c.html(html);
    } catch (err) {
        console.error(`[SSR] Error serving ${filename}:`, err.message);
        // Fallback: If reading file fails, return 404 to avoid crashing the server
        return c.text(`Frontend file not found on server. Ensure FRONTEND_DIR is correct in .env`, 404);
    }
}

// Route Interceptors
app.get("/details.html", async (c) => {
    const slug = c.req.query("slug") || c.req.query("id")
    return await renderWithSEO(c, "details.html", slug, null, null, "details")
})

app.get("/watch.html", async (c) => {
    const slug = c.req.query("slug")
    const season = c.req.query("season") || 1
    const ep = c.req.query("ep") || 1
    return await renderWithSEO(c, "watch.html", slug, season, ep, "watch")
})

export default app
