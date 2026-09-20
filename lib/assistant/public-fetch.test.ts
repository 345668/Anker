import { expect,it } from "vitest"
import { isPublicAddress, publicUrl, fetchPublicText } from "./public-fetch"
it.each(["127.0.0.1","10.1.1.1","169.254.169.254","172.16.0.2","192.168.0.1","100.64.0.1","0.0.0.0","224.0.0.1","::1","::ffff:127.0.0.1","fe80::1","fc00::1","2001:db8::1"])("rejects nonpublic address %s",address=>{expect(isPublicAddress(address)).toBe(false)})
it.each(["8.8.8.8","1.1.1.1","2606:4700:4700::1111"])("accepts public address %s",address=>{expect(isPublicAddress(address)).toBe(true)})
it.each(["file:///etc/passwd","http://user:pass@example.com","https://example.com:8080"])("rejects unsafe URL %s",url=>{expect(()=>publicUrl(url)).toThrow()})
it("normalizes numeric loopback URLs before checking them",async()=>{await expect(fetchPublicText("http://2130706433")).rejects.toThrow("Private")})
