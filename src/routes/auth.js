/* =====================================================
   auth.js — AnimeHunt Admin Panel
   Global Auth object — client-side login guard

   This file belongs in the ADMIN PANEL frontend
   (e.g. admin/js/auth.js), loaded via <script> on every
   protected admin page (dashboard.html, anime.html, etc.)
   It must NEVER live inside the backend repo — it uses
   `window`, `sessionStorage`, `document`, which do not
   exist in the Cloudflare Workers runtime.

   Usage on each protected admin page, right after <body>:
     <script src="/js/auth.js"></script>
     <script>Auth.protect();</script>
===================================================== */

const Auth = {
  TOKEN_KEY:   'admin_access_token',
  REFRESH_KEY: 'admin_refresh_token',

  // sessionStorage (clears on tab close, safer than localStorage for XSS)
  getToken() {
    return sessionStorage.getItem(this.TOKEN_KEY);
  },

  setToken(token, refreshToken) {
    sessionStorage.setItem(this.TOKEN_KEY, token);
    if (refreshToken) sessionStorage.setItem(this.REFRESH_KEY, refreshToken);
  },

  // Returns auth headers object
  headers() {
    const token = this.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  },

  // Verify token via /api/admin/auth/me, try refresh if expired
  async init() {
    const token = this.getToken();
    if (!token) {
      window.location.href = '/admin/Login.html';
      return null;
    }
    try {
      const res = await fetch('/api/admin/auth/me', { headers: this.headers() });
      if (!res.ok) {
        // Token expired — try refresh
        const refreshed = await this.refreshToken();
        if (!refreshed) { this.logout(); return null; }
        // Retry with new token
        const res2 = await fetch('/api/admin/auth/me', { headers: this.headers() });
        if (!res2.ok) { this.logout(); return null; }
        const data2 = await res2.json();
        return data2.data || data2;
      }
      const data = await res.json();
      return data.data || data;
    } catch (err) {
      this.logout();
      return null;
    }
  },

  // Refresh token via /api/admin/auth/refresh
  async refreshToken() {
    const refreshToken = sessionStorage.getItem(this.REFRESH_KEY);
    if (!refreshToken) return false;
    try {
      const res = await fetch('/api/admin/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
      if (!res.ok) return false;
      const data = await res.json();
      const accessToken = data.data?.accessToken || data.accessToken;
      if (accessToken) {
        sessionStorage.setItem(this.TOKEN_KEY, accessToken);
        return true;
      }
      return false;
    } catch { return false; }
  },

  // Check auth + redirect if not logged in — call this at the top of every protected page
  protect() {
    this.init().then(user => {
      if (!user) window.location.href = '/admin/Login.html';
    });
  },

  // Logout and redirect
  logout() {
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.REFRESH_KEY);
    window.location.href = '/admin/Login.html';
  },

  // Decode JWT payload to get user info
  getUser() {
    const token = this.getToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload;
    } catch { return null; }
  },

  // Helper — set username in a DOM element by id
  showUsername(elementId) {
    this.init().then(user => {
      if (user) {
        const el = document.getElementById(elementId);
        if (el) el.textContent = user.username || user.sub || 'Admin';
      }
    });
  }
};
