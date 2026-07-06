/* ================================================================
   auth.js — Central Frontend Authentication Helper
   AnimeHunt Admin CMS

   ROOT-CAUSE FIX:
   This file did NOT exist in the project at all. Every admin page
   (index.html, anime.html, episodes.html, ... 21 files total) loads:

       <script src="/js/auth.js"></script>

   ...and then calls Auth.protect(), Auth.headers(), Auth.logout(),
   Auth.showUsername(). Because the file 404'd, `Auth` was undefined,
   so `Auth.protect()` threw immediately and the login-gate never ran.
   That's why opening the admin panel went straight to the dashboard
   instead of Login.html — there was never any check at all.

   This file restores Auth with the exact API every page already
   expects, wired to the existing backend routes in
   src/middleware/adminAuth.js (POST /api/admin/auth/login,
   GET /auth/me, POST /auth/refresh, POST /auth/logout).

   Storage keys match what Login.html already writes:
     sessionStorage: admin_access_token, admin_refresh_token
================================================================ */

(function () {

  const API_BASE   = "/api/admin";
  const ACCESS_KEY  = "admin_access_token";
  const REFRESH_KEY = "admin_refresh_token";
  const LOGIN_PAGE  = "Login.html";

  /* ---------------- storage helpers ---------------- */

  function getAccessToken()  { return sessionStorage.getItem(ACCESS_KEY)  || null; }
  function getRefreshToken() { return sessionStorage.getItem(REFRESH_KEY) || null; }

  function setAccessToken(token) {
    if (token) sessionStorage.setItem(ACCESS_KEY, token);
  }

  function clearTokens() {
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
  }

  function isOnLoginPage() {
    return location.pathname.toLowerCase().endsWith("login.html");
  }

  function goToLogin() {
    clearTokens();
    if (!isOnLoginPage()) {
      window.location.replace(LOGIN_PAGE);
    }
  }

  /* ---------------- JWT decode (client-side, display/expiry only —
     the server is the real source of truth / verification) ---------------- */

  function decodeJWT(token) {
    try {
      const payload = token.split(".")[1];
      const json = decodeURIComponent(
        atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
          .split("")
          .map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
          .join("")
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function isExpired(payload, skewSeconds = 5) {
    if (!payload || !payload.exp) return true;
    return Date.now() / 1000 > payload.exp - skewSeconds;
  }

  /* ---------------- silent refresh ---------------- */

  let refreshInFlight = null;

  async function refreshAccessToken() {
    if (refreshInFlight) return refreshInFlight;

    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ refreshToken })
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || !json.success) return false;

        const newToken = json.data && json.data.accessToken;
        if (!newToken) return false;

        setAccessToken(newToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  }

  /* ---------------- proactive auto-refresh while page is open ----------------
     Access tokens last 15 min. Refresh ~1 min before expiry so an admin
     actively working in the CMS doesn't get bounced to login mid-session. */

  let autoRefreshTimer = null;

  function scheduleAutoRefresh() {
    clearTimeout(autoRefreshTimer);

    const token = getAccessToken();
    const payload = token ? decodeJWT(token) : null;
    if (!payload || !payload.exp) return;

    const msUntilRefresh = Math.max(
      (payload.exp - Math.floor(Date.now() / 1000) - 60) * 1000,
      5000
    );

    autoRefreshTimer = setTimeout(async () => {
      const ok = await refreshAccessToken();
      if (ok) scheduleAutoRefresh();
      else goToLogin();
    }, msUntilRefresh);
  }

  /* ================================================================
     Auth.protect() — call at the top of every protected admin page.
     - No access token at all          → redirect to Login.html
     - Access token expired, no usable
       refresh token                   → redirect to Login.html
     - Access token expired, refresh
       token still valid               → refresh in background,
                                          let the page continue
     - Access token valid              → schedule proactive refresh
  ================================================================ */

  function protect() {
    const token = getAccessToken();

    if (!token) {
      goToLogin();
      return false;
    }

    const payload = decodeJWT(token);

    if (!isExpired(payload)) {
      scheduleAutoRefresh();
      return true;
    }

    /* Access token expired — try the refresh token before giving up */
    const refreshToken = getRefreshToken();
    const refreshPayload = refreshToken ? decodeJWT(refreshToken) : null;

    if (!refreshToken || isExpired(refreshPayload)) {
      goToLogin();
      return false;
    }

    /* Valid refresh token: refresh now in the background and keep going */
    refreshAccessToken().then(ok => {
      if (ok) scheduleAutoRefresh();
      else goToLogin();
    });

    return true;
  }

  /* ================================================================
     Auth.headers() — Authorization header for fetch() calls.
     Pages combine this with their own Content-Type when needed:
       { ...Auth.headers(), 'Content-Type': 'application/json' }
  ================================================================ */

  function headers() {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /* ================================================================
     Auth.showUsername(elId) — fills a badge element with the
     logged-in username (and role), e.g. #adminBadge / #adminName
  ================================================================ */

  function showUsername(elId) {
    const el = document.getElementById(elId);
    if (!el) return;

    const token = getAccessToken();
    const payload = token ? decodeJWT(token) : null;

    if (payload && payload.username) {
      el.textContent = payload.role
        ? `${payload.username} (${payload.role})`
        : payload.username;
    }
  }

  /* ================================================================
     Auth.logout() — invalidate refresh token server-side, clear
     local session, send the admin back to Login.html.
  ================================================================ */

  async function logout() {
    clearTimeout(autoRefreshTimer);

    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method:  "POST",
        headers: headers()
      });
    } catch {
      /* ignore network errors — clear local session regardless */
    }

    clearTokens();
    window.location.replace(LOGIN_PAGE);
  }

  /* ---------------- export ---------------- */

  window.Auth = {
    protect,
    headers,
    showUsername,
    logout,
    refresh: refreshAccessToken
  };

})();

