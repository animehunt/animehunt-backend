/* ============================================================
   src/ai/autoLeecher.js
   THE AUTO-LEECHER & HEALER ENGINE (WITH ADULT FILTER)
   - Auto-fetches latest episodes from Scraper APIs
   - Auto-fills TMDB Metadata for missing anime
   - Blocks 18+ / Hentai / Pornographic content automatically
   - Segregates Dubbing (Muse Asia, CR, etc.) in Servers & Downloads
   - Auto-Heals (Removes/Replaces) Dead Links automatically
============================================================ */
import crypto from 'crypto';

// Tumhara external scraper API endpoint yahan aayega (e.g., Nyaa, Zephyrix, or your Python Bot)
const SCRAPER_API_URL = process.env.SCRAPER_API_URL || "http://127.0.0.1:8000/latest"; 

export async function runAutoLeecher(env) {
    console.log(`[AutoLeecher] 🤖 Engine Started at ${new Date().toISOString()}`);
    let results = { scraped: 0, added: 0, healed: 0, errors: [] };

    try {
        // Step 1: Auto-Heal Dead Links (Fail Count > 4)
        const healedCount = await autoHealDeadLinks(env);
        results.healed = healedCount;

        // Step 2: Fetch Latest Releases from Scraper
        const response = await fetch(SCRAPER_API_URL).catch(() => null);
        if (!response || !response.ok) {
            console.log(`[AutoLeecher] ⚠️ Scraper API not reachable. Skipping scrape phase.`);
            return results;
        }

        const latestReleases = await response.json();
        if (!latestReleases || !latestReleases.data) return results;

        results.scraped = latestReleases.data.length;

        // Step 3: Process Each Release
        for (const item of latestReleases.data) {
            try {
                // item structure expected: { title, tmdbId, season, episode, servers: [], downloads: [] }
                const animeId = await ensureAnimeExists(env, item.tmdbId, item.title);
                if (!animeId) continue;

                const episodeId = await ensureEpisodeExists(env, animeId, item.season, item.episode);
                if (!episodeId) continue;

                // Process Servers with Dub Segregation
                if (item.servers && item.servers.length > 0) {
                    await processServers(env, animeId, episodeId, item.season, item.episode, item.servers);
                }

                // Process Downloads with Dub Segregation
                if (item.downloads && item.downloads.length > 0) {
                    await processDownloads(env, animeId, item.season, item.downloads);
                }

                results.added++;
            } catch (err) {
                console.error(`[AutoLeecher] ❌ Error processing item ${item.title}:`, err.message);
                results.errors.push(item.title);
            }
        }

        console.log(`[AutoLeecher] ✅ Engine Finished. Processed: ${results.added}, Healed: ${results.healed}`);
        return results;

    } catch (globalErr) {
        console.error(`[AutoLeecher] 🔥 Fatal Error:`, globalErr);
        return { success: false, error: globalErr.message };
    }
}

/* ============================================================
   1. AUTO-HEALING MODULE
============================================================ */
async function autoHealDeadLinks(env) {
    const db = env.DB;
    let healed = 0;
    try {
        // Find dead servers (failed 5 or more times consecutively)
        const deadServers = await db.prepare("SELECT id FROM servers WHERE fail_count >= 5").all();
        if (deadServers && deadServers.results && deadServers.results.length > 0) {
            const ids = deadServers.results.map(r => `'${r.id}'`).join(',');
            await db.prepare(`DELETE FROM servers WHERE id IN (${ids})`).run();
            healed += deadServers.results.length;
            console.log(`[AutoHealer] 🗑️ Deleted ${deadServers.results.length} dead servers.`);
        }

        // Future scope: Trigger a re-scrape for the episode IDs of deleted servers here.
    } catch (e) {
        console.error("[AutoHealer] Error:", e);
    }
    return healed;
}

/* ============================================================
   2. ANIME & TMDB AUTO-FILLER (WITH 18+ ADULT FILTER)
============================================================ */
async function ensureAnimeExists(env, tmdbId, fallbackTitle) {
    const db = env.DB;
    // Check if anime already exists by tmdb_id (assuming we store it in tags or a dedicated column)
    // For this CMS, we search by title slug first as fallback
    const slug = fallbackTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    let existing = await db.prepare("SELECT id FROM anime WHERE slug = ? LIMIT 1").bind(slug).first();
    if (existing) return existing.id;

    // Not found -> Fetch from TMDB
    if (!tmdbId || !env.TMDB_API_KEY) {
        console.log(`[AutoLeecher] ⚠️ TMDB ID or API Key missing for ${fallbackTitle}. Skipping.`);
        return null;
    }

    try {
        const tmdbRes = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${env.TMDB_API_KEY}`);
        const tmdbData = await tmdbRes.json();
        
        if (tmdbData.id) {
            const title = tmdbData.name || fallbackTitle;

            // 🛑 STRICT 18+ CONTENT FILTER (HENTAI BLOCKER) 🛑
            if (tmdbData.adult === true) {
                console.log(`[AutoLeecher] 🔞 Blocked Adult/Hentai Title: ${title}`);
                return null; // Return null means bot will ignore this and not upload
            }

            // Genre Based Blocking (If TMDB flags it as Hentai, Erotica, or Porn)
            const blockedGenres = ["hentai", "erotica", "porn"]; 
            const hasBlocked = tmdbData.genres && tmdbData.genres.some(g => 
                blockedGenres.includes(g.name.toLowerCase())
            );

            if (hasBlocked) {
                console.log(`[AutoLeecher] 🔞 Blocked due to Adult Genre: ${title}`);
                return null; 
            }

            // Extract safe genres for our DB
            const safeGenres = tmdbData.genres ? tmdbData.genres.map(g => g.name) : [];
            const genresJson = JSON.stringify(safeGenres);

            const newId = crypto.randomUUID();
            const poster = tmdbData.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : '';
            const banner = tmdbData.backdrop_path ? `https://image.tmdb.org/t/p/w1280${tmdbData.backdrop_path}` : '';
            const desc = tmdbData.overview || '';
            const year = tmdbData.first_air_date ? parseInt(tmdbData.first_air_date.substring(0,4)) : new Date().getFullYear();
            const rating = tmdbData.vote_average || 0;
            const status = tmdbData.status === "Returning Series" ? "ongoing" : "completed";
            
            // Updated INSERT query to include genres column
            await db.prepare(`
                INSERT INTO anime (id, title, slug, type, status, poster, banner, year, rating, description, genres, active)
                VALUES (?, ?, ?, 'anime', ?, ?, ?, ?, ?, ?, ?, 1)
            `).bind(newId, title, slug, status, poster, banner, year, rating, desc, genresJson).run();
            
            console.log(`[AutoLeecher] 🎬 Added new safe anime: ${title}`);
            return newId;
        }
    } catch (e) {
        console.error(`[AutoLeecher] TMDB Fetch failed for ${fallbackTitle}:`, e.message);
    }
    return null;
}

/* ============================================================
   3. EPISODE AUTO-FILLER
============================================================ */
async function ensureEpisodeExists(env, animeId, season, episodeNum) {
    const db = env.DB;
    let existing = await db.prepare("SELECT id FROM episodes WHERE anime_id = ? AND season = ? AND episode = ? LIMIT 1")
        .bind(animeId, season, episodeNum).first();
    
    if (existing) return existing.id;

    const newId = crypto.randomUUID();
    await db.prepare(`
        INSERT INTO episodes (id, anime_id, season, episode, title, active)
        VALUES (?, ?, ?, ?, ?, 1)
    `).bind(newId, animeId, season, episodeNum, `Episode ${episodeNum}`).run();

    return newId;
}

/* ============================================================
   4. SERVERS MODULE (With strict dub segregation)
============================================================ */
async function processServers(env, animeId, episodeId, season, episodeNum, servers) {
    const db = env.DB;
    for (const srv of servers) {
        // srv expected: { name: "Muse Asia (Hindi)", embed: "https...", type: "iframe", priority: 1 }
        // Check if exact server name & embed already exists to avoid duplicates
        let existing = await db.prepare("SELECT id FROM servers WHERE episode_id = ? AND name = ? LIMIT 1")
            .bind(episodeId, srv.name).first();
        
        if (!existing) {
            const newId = crypto.randomUUID();
            await db.prepare(`
                INSERT INTO servers (id, anime_id, episode_id, season, episode, name, embed, type, priority, active, fail_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
            `).bind(newId, animeId, episodeId, season, episodeNum, srv.name, srv.embed, srv.type || 'iframe', srv.priority || 99).run();
        }
    }
}

/* ============================================================
   5. DOWNLOADS MODULE (With strict dub segregation)
============================================================ */
async function processDownloads(env, animeId, season, downloads) {
    const db = env.DB;
    
    // Structure: download_entries -> download_host_entries -> download_links
    // For automation, we ensure entry exists first
    let entry = await db.prepare("SELECT id FROM download_entries WHERE anime_id = ? AND season = ? AND content_type = 'episode' LIMIT 1")
        .bind(animeId, season).first();
    
    let entryId = entry ? entry.id : crypto.randomUUID();
    if (!entry) {
        await db.prepare("INSERT INTO download_entries (id, anime_id, season, content_type) VALUES (?, ?, ?, 'episode')")
            .bind(entryId, animeId, season).run();
    }

    for (const host of downloads) {
        // host expected: { host_name: "Mega", qualities: [ { quality: "1080p (Muse)", link: "..." } ] }
        let hostEntry = await db.prepare("SELECT id FROM download_host_entries WHERE entry_id = ? AND host_name = ? LIMIT 1")
            .bind(entryId, host.host_name).first();
        
        let hostEntryId = hostEntry ? hostEntry.id : crypto.randomUUID();
        if (!hostEntry) {
            await db.prepare("INSERT INTO download_host_entries (id, entry_id, host_name, knight) VALUES (?, ?, ?, 1)")
                .bind(hostEntryId, entryId, host.host_name).run();
        }

        // Insert Qualities
        for (const q of host.qualities) {
            let existingLink = await db.prepare("SELECT id FROM download_links WHERE host_entry_id = ? AND quality = ? LIMIT 1")
                .bind(hostEntryId, q.quality).first();
            
            if (!existingLink) {
                await db.prepare("INSERT INTO download_links (id, host_entry_id, quality, link) VALUES (?, ?, ?, ?)")
                    .bind(crypto.randomUUID(), hostEntryId, q.quality, q.link).run();
            }
        }
    }
}
