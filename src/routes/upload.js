/* ================================================
   upload.js — ImageKit Image Upload  (FIXED)

   BUG FIXES:
   1. btoa(Uint8Array.reduce) → direct binary FormData upload
      (old code loaded full file into a string — OOM on large images)
   2. deleteOldImage() function added (was missing)
   3. Config imported from config.js

   FEATURE (TMDB auto-add support):
   4. Core "upload this binary payload to ImageKit" logic factored
      out into uploadBufferToImageKit() and exported, so anime.js's
      POST /anime/auto-add can reuse the exact same upload path for
      TMDB poster/backdrop images (downloaded to memory, not a
      browser-submitted multipart file) instead of duplicating it.
      The /upload route below now just validates the incoming file,
      then calls the same shared function.

   Auth handled by adminAuth middleware in index.js
================================================ */

import { Hono }   from 'hono'
import config     from './config.js'

const uploadRoute = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })

/* ================= RETRY ================= */
export async function retry(fn, attempts = 3) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try { return await fn() }
    catch (err) {
      lastErr = err
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, 500 * (i + 1)))
      }
    }
  }
  throw lastErr
}

/* ================= DELETE OLD IMAGE (MISSING FUNCTION — ADDED) ================= */
// Deletes a previously uploaded file from ImageKit by its fileId.
// Silent fail on errors so callers are never blocked.
export async function deleteOldImage(env, fileId) {
  if (!fileId) return

  try {
    // ✅ FIX: btoa only for auth token (short string) — safe here
    const credentials = btoa(`${env.IMAGEKIT_PRIVATE_KEY}:`)

    const res = await fetch(
      `https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`,
      {
        method:  'DELETE',
        headers: { 'Authorization': `Basic ${credentials}` }
      }
    )

    if (!res.ok) {
      console.error(`deleteOldImage: ImageKit returned ${res.status} for fileId=${fileId}`)
    }

    return { success: true, deleted: fileId }
  } catch (err) {
    // Silent fail — deletion failure must never block the upload flow
    console.error('deleteOldImage error:', err)
  }
}

/* ================= SHARED UPLOAD CORE ================= */
/* Uploads a binary payload to ImageKit. `file` can be:
     - a File/Blob (from c.req.parseBody() — the /upload route below)
     - a Buffer/Uint8Array/ArrayBuffer wrapped in a Blob (auto-add,
       after downloading a TMDB image — see anime.js)
   opts.folder/opts.tags let callers namespace uploads (e.g.
   "/animehunt/tmdb" + "tmdb-import" for auto-added images, vs the
   default "/animehunt" + "anime-site" for manual uploads) without
   duplicating the request-building logic below. */
export async function uploadBufferToImageKit(env, file, fileName, opts = {}) {
  const PRIVATE_KEY = env.IMAGEKIT_PRIVATE_KEY
  if (!PRIVATE_KEY) {
    throw new Error('ImageKit not configured — set IMAGEKIT_PRIVATE_KEY secret')
  }

  const folder = opts.folder || '/animehunt'
  const tags   = opts.tags   || 'anime-site'

  const uploadFn = async () => {
    // ✅ short string → btoa is safe for auth token only
    const authToken = btoa(`${PRIVATE_KEY}:`)

    const fd = new FormData()
    fd.append('file',              file, fileName)   // direct binary — no btoa on file content
    fd.append('fileName',          fileName)
    fd.append('useUniqueFileName', 'true')
    fd.append('folder',            folder)
    fd.append('tags',              tags)
    // Do NOT set Content-Type header — fetch sets the multipart boundary automatically

    const res = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method:  'POST',
      headers: { 'Authorization': `Basic ${authToken}` },
      body:    fd
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data?.message || `ImageKit error: ${res.status}`)
    }

    return data
  }

  return retry(uploadFn, 3)
}

/* ================= UPLOAD (browser multipart form) ================= */
uploadRoute.post('/upload', async (c) => {
  try {
    const body = await c.req.parseBody()
    const file = body['file']

    if (!file || typeof file === 'string') {
      return c.json(failure('File missing or invalid'), 400)
    }

    // Size check — use config value (5 MB), not hardcoded 10 MB
    if (file.size > config.UPLOAD.MAX_IMAGE_SIZE) {
      return c.json(failure(`File too large — max ${config.UPLOAD.MAX_IMAGE_SIZE / 1024 / 1024}MB`), 400)
    }

    // Type check
    if (!config.UPLOAD.ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return c.json(failure('Invalid file type — only JPG, PNG, WebP allowed'), 400)
    }

    if (!c.env.IMAGEKIT_PRIVATE_KEY) {
      return c.json(failure('ImageKit not configured — set IMAGEKIT_PRIVATE_KEY secret'), 500)
    }

    const fileName = `${Date.now()}_${(file.name || 'image').replace(/\s+/g, '_')}`

    const result = await uploadBufferToImageKit(c.env, file, fileName)

    return c.json(success({
      url:      result.url,
      fileId:   result.fileId,
      name:     result.name,
      size:     result.size,
      filePath: result.filePath
    }))

  } catch (err) {
    console.error('UPLOAD_ERROR:', err)
    return c.json(failure(err.message || 'Upload failed'), 500)
  }
})

export default uploadRoute


