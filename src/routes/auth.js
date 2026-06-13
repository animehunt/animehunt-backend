/* ================================================================
   auth.js — CENTRAL AUTHENTICATION MODULE
   AnimeHunt Admin CMS

   ⚠️  SINGLE SOURCE OF TRUTH — Ye file akeli auth handle karegi
   ⚠️  Kisi bhi dusri file mein auth/token/session code NAHI hoga

   Exports (global window.Auth):
     Auth.protect()              — Page ko protect karo, nahi to Login.html
     Auth.logout()               — Token clear + Login.html redirect
     Auth.headers()              — API call ke liye Authorization headers
     Auth.showUsername(elemId)   — Admin username element mein dikhao
     Auth.getToken()             — (internal use) token return karo
     Auth.isLoggedIn()           — Boolean check
================================================================ */

;(function (global) {
  "use strict"

  /* ── CONFIG ─────────────────────────────────────────────────── */
  const TOKEN_KEY    = "ah_token"
  const USERNAME_KEY = "ah_username"
  const LOGIN_PAGE   = "Login.html"
  const ME_API       = "https://animehunt-backend.animehunt715.workers.dev/api/auth/me"

  /* ── HELPERS ─────────────────────────────────────────────────── */

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || null
  }

  function isLoggedIn() {
    return !!getToken()
  }

  function redirectToLogin() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USERNAME_KEY)
    window.location.href = LOGIN_PAGE
  }

  /* ── PROTECT ─────────────────────────────────────────────────── */
  /*
     Har protected page ke INIT mein sirf ek baar call karo:
       Auth.protect()
     Agar token nahi mila — Login.html pe bhej dega.
  */
  function protect() {
    if (!isLoggedIn()) {
      redirectToLogin()
    }
  }

  /* ── HEADERS ─────────────────────────────────────────────────── */
  /*
     Har API fetch call mein:
       { headers: Auth.headers() }
     Returns Authorization + Content-Type headers.
  */
  function headers() {
    return {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${getToken()}`
    }
  }

  /* ── SHOW USERNAME ───────────────────────────────────────────── */
  /*
     Admin name element mein dikhane ke liye:
       Auth.showUsername("adminName")
     Pehle localStorage se dikhata hai (fast),
     phir /me API se verify + update karta hai.
     Agar token invalid hua — Login.html.
  */
  async function showUsername(elemId) {
    const el = document.getElementById(elemId)

    /* Fast render from cache */
    const cached = localStorage.getItem(USERNAME_KEY)
    if (el && cached) el.textContent = cached

    /* Verify with backend */
    try {
      const res  = await fetch(ME_API, { headers: headers() })
      const json = await res.json()

      if (!json.success) {
        redirectToLogin()
        return
      }

      const username = json.data?.username || cached || "Admin"
      localStorage.setItem(USERNAME_KEY, username)
      if (el) el.textContent = username

    } catch {
      /* Network error — token already shown from cache, don't redirect */
    }
  }

  /* ── LOGOUT ──────────────────────────────────────────────────── */
  /*
     Logout button ke onclick mein:
       Auth.logout()
     Token + username clear karke Login.html pe bhej dega.
  */
  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USERNAME_KEY)
    window.location.href = LOGIN_PAGE
  }

  /* ── GLOBAL EXPORT ───────────────────────────────────────────── */
  global.Auth = {
    protect,
    headers,
    showUsername,
    logout,
    getToken,
    isLoggedIn
  }

})(window)
