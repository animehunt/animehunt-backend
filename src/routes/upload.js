import { Hono } from "hono"

const app = new Hono()

app.post("/upload", async (c) => {

  try {

    const body = await c.req.json()

    const file = body.file
    const fileName = body.fileName || Date.now() + ".jpg"

    if (!file) {
      return c.json({
        success:false,
        error:"No file received"
      },400)
    }

    const res = await fetch("https://upload.imagekit.io/api/v1/files/upload",{
      method:"POST",
      headers:{
        Authorization:"Basic " + btoa(c.env.IMAGEKIT_PRIVATE_KEY + ":"),
        "Content-Type":"application/json"
      },
      body: JSON.stringify({
        file: file,
        fileName: fileName
      })
    })

    const data = await res.json()

    if(!data || !data.url){
      return c.json({
        success:false,
        error:"ImageKit upload failed",
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
      error:"Upload server error",
      message:e.message
    },500)

  }

})

export default app
