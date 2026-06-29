// config.js — Central configuration for all modules (NEW FILE)
// Part 2 — Backend Features

const config = {
  // API Base URLs
  API_BASE:       '/api',
  ADMIN_API_BASE: '/api/admin',

  // ImageKit settings (injected via initConfig)
  IMAGEKIT: {
    URL_ENDPOINT: '',
    PUBLIC_KEY:   '',
  },

  // Pagination defaults
  PAGINATION: {
    DEFAULT_LIMIT: 20,
    MAX_LIMIT:     100,
    EPISODE_LIMIT: 50,
  },

  // Cache TTLs (seconds)
  CACHE: {
    ANIME_LIST:    300,   // 5 min
    ANIME_DETAIL:  600,   // 10 min
    EPISODE_LIST:  300,   // 5 min
    HOMEPAGE:      120,   // 2 min
    TRENDING:      900,   // 15 min
    SEARCH:         60,   // 1 min
  },

  // Upload limits
  UPLOAD: {
    MAX_IMAGE_SIZE:       5 * 1024 * 1024,                        // 5 MB
    ALLOWED_IMAGE_TYPES:  ['image/jpeg', 'image/png', 'image/webp'],
    COMPRESSION_QUALITY:  0.8,
  },

  // Player settings
  PLAYER: {
    SESSION_TIMEOUT:    30 * 60,  // 30 min
    STREAM_RATE_LIMIT:  10,       // 10 streams per window
    RATE_LIMIT_WINDOW:  60,       // per minute
  },

  // Ad slots (replaces hardcoded values in ads.html)
  AD_SLOTS: [
    { id: 'top_banner',    name: 'Top Banner',     dimensions: '728x90'  },
    { id: 'sidebar_right', name: 'Right Sidebar',  dimensions: '300x250' },
    { id: 'mid_content',   name: 'Mid Content',    dimensions: '728x90'  },
    { id: 'bottom_banner', name: 'Bottom Banner',  dimensions: '728x90'  },
    { id: 'mobile_top',    name: 'Mobile Top',     dimensions: '320x50'  },
    { id: 'video_overlay', name: 'Video Overlay',  dimensions: '300x250' },
  ],

  // Bulk upload
  BULK_UPLOAD: {
    MAX_CSV_ROWS: 500,
    BATCH_SIZE:    10,
  },
};

// Inject Cloudflare env vars at runtime
export function initConfig(env) {
  if (env) {
    config.IMAGEKIT.URL_ENDPOINT = env.IMAGEKIT_URL_ENDPOINT || '';
    config.IMAGEKIT.PUBLIC_KEY   = env.IMAGEKIT_PUBLIC_KEY   || '';
  }
  return config;
}

export default config;
