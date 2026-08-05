/* =========================================================
🤖 ANIMEHUNT DUAL-AUDIO SCRAPER BOT (100% FREE)
   Scrapes Telegram/Web channels for 1080p/720p/480p links 
   and generates CSV for downloadsAdmin.js Bulk Upload.
========================================================= */

import fs from 'fs';
import axios from 'axios';

// Configuration
const ANIME_ID = "YOUR_ANIME_UUID_HERE"; // DB se anime id lo
const SEASON = 1;
const HOST_ID = 2; // Mega/GDrive ka Host ID tumhari `hosts` table se
const OUTPUT_FILE = "import_ready.csv";

// CSV Headers that downloadsAdmin.js expects
const CSV_HEADERS = "anime_id,content_type,season,episode,episode_title,host_id,direct_download,quality,link\n";

async function scrapeTelegramChannel() {
  console.log("🚀 Starting Dual-Audio Bot Scraper...");
  
  // NOTE: For a real private channel, you would use 'telegraf' or 'gramjs' library. 
  // For public channels, we can scrape the web preview (e.g., t.me/s/channel_name)
  const channelUrl = "https://t.me/s/public_anime_channel_example"; 
  
  try {
    // Bypass Bot Protection via basic spoofing (FlareSolverr proxy can be added here if needed)
    const res = await axios.get(channelUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    const html = res.data;
    const episodesData = [];
    
    // Simple Regex to extract Episode Number and Mega/Drive Links
    // Matches patterns like: "Episode 05" ... "1080p - https://mega.nz/..."
    const messageBlocks = html.split('<div class="tgme_widget_message_text');
    
    messageBlocks.forEach((block, index) => {
      if (index === 0) return; // Skip first split
      
      let epMatch = block.match(/Episode\s*(\d+)/i);
      if (!epMatch) return;
      let episodeNum = parseInt(epMatch[1], 10);

      // Extract Qualities
      let link480p = block.match(/480p.*?href="([^"]+)"/)?.[1] || "";
      let link720p = block.match(/720p.*?href="([^"]+)"/)?.[1] || "";
      let link1080p = block.match(/1080p.*?href="([^"]+)"/)?.[1] || "";

      // Push to array if at least one link exists
      if (link480p || link720p || link1080p) {
        episodesData.push({
          episode: episodeNum,
          title: `Episode ${episodeNum} (Hindi)`,
          links: { '480p': link480p, '720p': link720p, '1080p': link1080p }
        });
      }
    });

    console.log(`✅ Extracted ${episodesData.length} episodes. Generating CSV...`);
    generateCSV(episodesData);

  } catch (error) {
    console.error("❌ Scraping Failed. Is Cloudflare blocking?", error.message);
  }
}

function generateCSV(data) {
  let csvContent = CSV_HEADERS;

  data.forEach(ep => {
    // Knight Mode Host Format for qualities
    if (ep.links['1080p']) csvContent += `${ANIME_ID},episode,${SEASON},${ep.episode},${ep.title},${HOST_ID},,1080p,${ep.links['1080p']}\n`;
    if (ep.links['720p'])  csvContent += `${ANIME_ID},episode,${SEASON},${ep.episode},${ep.title},${HOST_ID},,720p,${ep.links['720p']}\n`;
    if (ep.links['480p'])  csvContent += `${ANIME_ID},episode,${SEASON},${ep.episode},${ep.title},${HOST_ID},,480p,${ep.links['480p']}\n`;
  });

  fs.writeFileSync(OUTPUT_FILE, csvContent);
  console.log(`🎉 Success! Saved to ${OUTPUT_FILE}.`);
  console.log(`📤 Upload this file in Admin Panel -> Downloads -> Import CSV.`);
}

scrapeTelegramChannel();
