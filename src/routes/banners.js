import { Hono } from "hono"

const app = new Hono()

app.post("/upload", async (c) => {

  try {

    const body = await c.req.json()

    let file = body.file
    const fileName = body.fileName || Date.now() + ".jpg"

    if (!file) {
      return c.json({ success:false, error:"No file" },400)
    }

    // ✅ REMOVE PREFIX अगर आया हो
    if (file.startsWith("data:")) {
      file = file.split(",")[1]
    }

    // ✅ BASE64 → BLOB
    const binary = Uint8Array.from(atob(file), c => c.charCodeAt(0))
    const blob = new Blob([binary])

    const form = new FormData()
    form.append("file", blob)
    form.append("fileName", fileName)

    const res = await fetch("https://upload.imagekit.io/api/v1/files/upload",{
      method:"POST",
      headers:{
        Authorization:"Basic " + btoa(c.env.IMAGEKIT_PRIVATE_KEY + ":")
      },
      body: form
    })

    const data = await res.json()

    console.log("IMAGEKIT:", data)

    if(!data || !data.url){
      return c.json({
        success:false,
        error:"Upload failed",
        details:data
      },500)
    }

    return c.json({
      success:true,
      url:data.url
    })

  } catch(e){

    return c.json({
      success:false,
      error:"Server error",
      message:e.message
    },500)

  }

})

export default app
