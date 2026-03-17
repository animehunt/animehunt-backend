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

    // FIX
    if(file.startsWith("data:")){
      file=file.split(",")[1]
    }

    const res = await fetch("https://upload.imagekit.io/api/v1/files/upload",{
      method:"POST",
      headers:{
        Authorization:"Basic "+btoa(c.env.IMAGEKIT_PRIVATE_KEY + ":"),
        "Content-Type":"application/json"
      },
      body: JSON.stringify({
        file:file,
        fileName:fileName
      })
    })

    const data = await res.json()

    if(!data.url){
      return c.json({ success:false, error:"Upload failed", details:data })
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
    })

  }

})

export default app
