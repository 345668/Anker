import { lookup } from "node:dns/promises"
import { BlockList, isIP } from "node:net"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
const blocked=new BlockList()
for(const [address,prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]] as const)blocked.addSubnet(address,prefix,"ipv4")
const globalV6=new BlockList();globalV6.addSubnet("2000::",3,"ipv6")
for(const [address,prefix] of [["2001::",23],["2001:db8::",32],["2002::",16],["3fff::",20]] as const)blocked.addSubnet(address,prefix,"ipv6")
export function isPublicAddress(address:string) {
  const family=isIP(address)
  return family===4?!blocked.check(address,"ipv4"):family===6&&globalV6.check(address,"ipv6")&&!blocked.check(address,"ipv6")
}
export function publicUrl(value:string) {
  const url=new URL(value)
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password||(url.port&&!["80","443"].includes(url.port)))throw new Error("Use a public HTTP(S) URL on a standard port.")
  return url
}
/** Validate every redirect and pin the socket lookup to a validated address. */
export async function fetchPublicText(value:string,signal?:AbortSignal) {
  let url=publicUrl(value)
  const timeout=AbortSignal.timeout(15000),abort=signal?AbortSignal.any([signal,timeout]):timeout
  for(let hop=0;hop<5;hop++) {
    abort.throwIfAborted()
    const host=url.hostname.replace(/^\[|\]$/g,"")
    const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await lookup(host,{all:true})
    if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))throw new Error("Private or reserved network destinations are not allowed.")
    const chosen=addresses[0]
    const result=await new Promise<{text:string;location?:string}>((resolve,reject)=>{
      const request=(url.protocol==="https:"?httpsRequest:httpRequest)(url,{
        signal:abort,agent:false,headers:{"User-Agent":"AnkerResearchBot/1.0","Accept-Encoding":"identity"},
        lookup:((_host:string,options:any,cb:any)=>options?.all?cb(null,[chosen]):cb(null,chosen.address,chosen.family)) as any,
      },response=>{
        const code=response.statusCode??0
        if([301,302,303,307,308].includes(code)&&response.headers.location){response.destroy();resolve({text:"",location:response.headers.location});return}
        if(code<200||code>=300){response.destroy();reject(new Error(`Source returned HTTP ${code}.`));return}
        if(!/text\/|application\/xhtml/.test(String(response.headers["content-type"]??""))||Number(response.headers["content-length"])>1500000||(response.headers["content-encoding"]&&response.headers["content-encoding"]!=="identity")){response.destroy();reject(new Error("Source is not a supported, bounded text page."));return}
        let size=0;const chunks:Buffer[]=[]
        response.on("data",chunk=>{size+=chunk.length;if(size>1500000){response.destroy();reject(new Error("Source exceeds the download limit."))}else chunks.push(chunk)})
        response.on("end",()=>resolve({text:Buffer.concat(chunks).toString("utf8")}));response.on("error",reject)
      });request.on("error",reject);request.end()
    })
    if(result.location){url=publicUrl(new URL(result.location,url).href);continue}
    return {text:result.text,url:url.href}
  }
  throw new Error("Too many redirects.")
}
