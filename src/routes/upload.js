/* ================================================
   upload.js — ImageKit Image Upload
   Auth handled by adminAuth middleware in index.js
================================================ */

import { Hono } from "hono"

const uploadRoute = new Hono()

const success = (data)  => ({ success: true,  data })
const failure = (msg)   => ({ success: false, message: msg })

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

/* ================= UPLOAD ================= */
uploadRoute.post("/upload", async (c) => {
  try {
    const body = await c.req.parseBody()
    const file = body["file"]

    if (!file || typeof file === "string") {
      return c.json(failure("File missing or invalid"), 400)
    }

    /* Size check — max 10MB */
    if (file.size > 10 * 1024 * 1024) {
      return c.json(failure("File too large — max 10MB"), 400)
    }

    /* Type check */
    const allowed = ["image/jpeg","image/jpg","image/png","image/webp","image/gif"]
    if (!allowed.includes(file.type)) {
      return c.json(failure("Invalid file type — only JPG, PNG, WebP, GIF allowed"), 400)
    }

    const PRIVATE_KEY    = c.env.IMAGEKIT_PRIVATE_KEY
    const URL_ENDPOINT   = c.env.IMAGEKIT_URL_ENDPOINT

    if (!PRIVATE_KEY) {
      return c.json(failure("ImageKit not configured — set IMAGEKIT_PRIVATE_KEY secret"), 500)
    }

    /* Convert to base64 */
    const arrayBuffer = await file.arrayBuffer()
    const base64 = btoa(
      new Uint8Array(arrayBuffer)
        .reduce((acc, byte) => acc + String.fromCharCode(byte), "")
    )

    const fileName  = `${Date.now()}_${(file.name || "image").replace(/\s+/g,"_")}`
    const dataUri   = `data:${file.type};base64,${base64}`

    /* ---- ImageKit Upload using FormData (correct way) ---- */
    const uploadFn = async () => {
      const fd = new FormData()
      fd.append("file",            dataUri)
      fd.append("fileName",        fileName)
      fd.append("useUniqueFileName","true")
      fd.append("folder",          "/animehunt")

      /* Basic auth: privateKey + ":" encoded in base64 */
      const authToken = btoa(`${PRIVATE_KEY}:`)

      const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
        method:  "POST",
        headers: { "Authorization": `Basic ${authToken}` },
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
    console.error("UPLOAD_ERROR:", err)
    return c.json(failure(err.message || "Upload failed"), 500)
  }
})

export default uploadRoute
