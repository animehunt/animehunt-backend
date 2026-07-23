/* ================================================
   upload.js — ImageKit Image Upload  (FIXED)

   BUG FIXES:
   1. btoa(Uint8Array.reduce) → direct binary FormData upload
      (old code loaded full file into a string — OOM on large images)
   2. deleteOldImage() function added (was missing)
   3. Config imported from config.js

   Auth handled by adminAuth middleware in index.js
================================================ */

import { Hono }   from 'hono'
import config     from './config.js'

const uploadRoute = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })

/* ================= RETRY ================= */
async function retry(fn, attempts = 3) {
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

/* ================= UPLOAD ================= */
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

    const PRIVATE_KEY  = c.env.IMAGEKIT_PRIVATE_KEY
    const URL_ENDPOINT = c.env.IMAGEKIT_URL_ENDPOINT   // not used in upload path but available

    if (!PRIVATE_KEY) {
      return c.json(failure('ImageKit not configured — set IMAGEKIT_PRIVATE_KEY secret'), 500)
    }

    const fileName = `${Date.now()}_${(file.name || 'image').replace(/\s+/g, '_')}`

    /* ─── FIXED: Direct binary upload — no btoa(Uint8Array.reduce) ───
       Old code:
         const buffer = await file.arrayBuffer()
         const base64 = btoa(new Uint8Array(buffer).reduce(...))   ← OOM for >1 MB files
         fd.append('file', `data:${file.type};base64,${base64}`)

       New code: pass the File/Blob object directly — Cloudflare Workers
       FormData supports binary values natively.
       ImageKit upload API accepts both base64 data URIs AND raw binary.
    */
    const uploadFn = async () => {
      // ✅ FIX: short string → btoa is safe for auth token only
      const authToken = btoa(`${PRIVATE_KEY}:`)

      const fd = new FormData()
      fd.append('file',            file)          // ✅ direct binary — no btoa on file content
      fd.append('fileName',        fileName)
      fd.append('useUniqueFileName', 'true')
      fd.append('folder',          '/animehunt')
      fd.append('tags',            'anime-site')
      // Do NOT set Content-Type header — browser/worker sets multipart boundary automatically

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

    const result = await retry(uploadFn, 3)

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


