import { Hono } from 'hono'

const uploadRoute = new Hono()

// Utility: retry wrapper
async function retry(fn, retries = 2) {
  try {
    return await fn()
  } catch (err) {
    if (retries <= 0) throw err
    return retry(fn, retries - 1)
  }
}

// Utility: structured response
const success = (data) => ({
  success: true,
  data
})

const failure = (message, code = "UPLOAD_ERROR") => ({
  success: false,
  message,
  error_code: code
})

// ✅ FIXED ROUTE
uploadRoute.post('/upload', async (c) => {
  try {
    const body = await c.req.parseBody()
    const file = body.file

    if (!file || typeof file === 'string') {
      return c.json(failure("File missing or invalid", "NO_FILE"), 400)
    }

    const arrayBuffer = await file.arrayBuffer()
    const base64 = btoa(
      new Uint8Array(arrayBuffer)
        .reduce((data, byte) => data + String.fromCharCode(byte), '')
    )

    const uploadToImageKit = async () => {
      const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(c.env.IMAGEKIT_PRIVATE_KEY + ":")}`,
        },
        body: new URLSearchParams({
          file: `data:${file.type};base64,${base64}`,
          fileName: file.name || `img_${Date.now()}`,
          useUniqueFileName: "true",
          folder: "/animehunt"
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.message || "Upload failed")
      }

      return data
    }

    const result = await retry(uploadToImageKit, 2)

    return c.json(success({
      url: result.url,
      fileId: result.fileId,
      name: result.name
    }))

  } catch (err) {
    console.error("UPLOAD_ERROR:", err)

    return c.json(
      failure(err.message || "Something went wrong"),
      500
    )
  }
})

export default uploadRoute
