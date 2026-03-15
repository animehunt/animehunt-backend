import { Hono } from 'hono'
import { verifyAdmin } from '../middleware/adminAuth.js'

const app = new Hono()

app.post('/kill',verifyAdmin,async(c)=>{

console.log("EMERGENCY STOP ACTIVATED")

return c.json({
success:true,
message:"Emergency stop activated"
})

})

export default app
