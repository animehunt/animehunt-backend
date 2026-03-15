import { Hono } from "hono"

const app = new Hono()

app.post("/upload", async (c)=>{

const body = await c.req.json()

const file = body.file
const fileName = body.fileName

const res = await fetch("https://upload.imagekit.io/api/v1/files/upload",{

method:"POST",

headers:{
Authorization:"Basic "+btoa(c.env.IMAGEKIT_PRIVATE+":")
},

body:JSON.stringify({
file,
fileName,
publicKey:c.env.IMAGEKIT_PUBLIC
})

})

const data = await res.json()

return c.json({
success:true,
url:data.url
})

})

export default app
