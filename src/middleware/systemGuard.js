export async function systemGuard(c,next){

const state = await c.env.DB
.prepare("SELECT frozen,emergency FROM deploy_state WHERE id=1")
.first()

if(state.emergency){

return c.json({
error:"System Offline"
},503)

}

await next()

}
