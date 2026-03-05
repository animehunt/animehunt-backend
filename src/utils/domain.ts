export function getDomain(c:any){

const url = new URL(c.req.url)

return url.origin

}
