import { WorkspaceError } from "@/lib/auth/workspace-context"
import { extractPdfText } from "@/lib/ai/pdf"
import { docxText } from "@/lib/files/office-text"
import { attachmentPrefix, BLOB_MAX_BYTES, MAX_ATTACHMENTS, TOTAL_MAX_BYTES, INLINE_MAX_BYTES, type BlobRef } from "./attachment-limits"

/** A private blob the browser uploaded (docs/architecture/36). Refuses another workspace's
 *  path, bounds the bytes actually read, and deletes the blob once it has been read. */
async function readBlob(ref:BlobRef,scopeKey:string):Promise<{name:string;type:string;bytes:Buffer}> {
  const {get,del}=await import("@vercel/blob")
  let pathname:string
  try{pathname=decodeURIComponent(new URL(ref.url).pathname.replace(/^\//,""))}catch{throw new WorkspaceError("That upload link is not valid.",400)}
  if(!pathname.startsWith(attachmentPrefix(scopeKey)))throw new WorkspaceError("That upload belongs to another workspace.",403)
  const blob=await get(ref.url,{access:"private"}).catch(()=>null)
  if(!blob||blob.statusCode!==200||!blob.stream)throw new WorkspaceError("That upload could not be read. Attach it again.",404)
  const chunks:Buffer[]=[];let size=0;const reader=blob.stream.getReader()
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>BLOB_MAX_BYTES){await reader.cancel();throw new WorkspaceError("That file is larger than 25 MB.",413)}chunks.push(Buffer.from(value))}
  await del(ref.url).catch(e=>console.warn("[assistant-upload] blob not deleted:",e?.message??e))
  const name=String(ref.name||pathname.split("/").pop()||"attachment").slice(0,200)
  return {name,type:(blob as any).blob?.contentType??"",bytes:Buffer.concat(chunks)}
}

export async function assistantUploads(files:File[],blobs:BlobRef[]=[],scopeKey="") {
  if(files.length+blobs.length>MAX_ATTACHMENTS)throw new WorkspaceError(`Attach at most ${MAX_ATTACHMENTS} files.`,413)
  if(files.reduce((n,f)=>n+f.size,0)>INLINE_MAX_BYTES+1024*1024)throw new WorkspaceError("These files are too large to send directly. Reload and try again.",413)
  const items:Array<{name:string;type:string;bytes:Buffer}>=[]
  for(const f of files){if(!f.size||f.size>BLOB_MAX_BYTES)throw new WorkspaceError("Each file must be between 1 byte and 25 MB.",413);items.push({name:f.name,type:f.type,bytes:Buffer.from(await f.arrayBuffer())})}
  for(const r of blobs)items.push(await readBlob(r,scopeKey))
  if(items.reduce((n,i)=>n+i.bytes.length,0)>TOTAL_MAX_BYTES)throw new WorkspaceError("Keep the attachments under 40 MB in total.",413)
  const refs:Array<{id:string;name:string;base64:string}>=[],text:string[]=[],processed:Array<{name:string;kind:string}>=[]
  for(const [index,file] of items.entries()) {
    const bytes=file.bytes
    if(!bytes.length)throw new WorkspaceError("One of the files is empty.",400)
    let kind="text"
    if(/\.docx$/i.test(file.name)) {
      kind="docx"
      let doc:string;try{doc=docxText(bytes).text}catch{throw new WorkspaceError("Could not read this Word file. Save it as .docx and try again.",400)}
      if(!doc.trim())throw new WorkspaceError("This Word file has no readable text.",400)
      text.push(`Document ${JSON.stringify(file.name)}: ${doc.slice(0,24000)}`)
    } else if(/\.pdf$/i.test(file.name)||file.type==="application/pdf") {
      kind="pdf"
      let extracted;try{extracted=await extractPdfText(bytes)}catch{throw new WorkspaceError("Could not read this PDF. Upload a text-based PDF.",400)}
      if(!extracted.text.trim())throw new WorkspaceError("This PDF has no extractable text. Upload its pages as images for visual analysis.",400)
      text.push(`Document ${JSON.stringify(file.name)}: ${extracted.text.slice(0,24000)}`)
    } else if(["image/png","image/jpeg","image/webp"].includes(file.type)||/\.(png|jpe?g|webp)$/i.test(file.name)||/\.xlsx$/i.test(file.name)) {
      kind=/\.xlsx$/i.test(file.name)?"xlsx":"image"
      const id=`${kind==="xlsx"?"XLSX":"IMG"}${index+1}`
      refs.push({id,name:file.name,base64:bytes.toString("base64")})
      text.push(`Attachment ${JSON.stringify(file.name)}: use ${kind==="xlsx"?"xlsxBase64":"imageBase64"}: "<<${id}>>" in the appropriate tool. The server resolves the bytes.`)
    } else if(/^text\//.test(file.type)||/\.(txt|md|csv|json|tsv)$/i.test(file.name)) {
      text.push(`Document ${JSON.stringify(file.name)}: ${bytes.toString("utf8").slice(0,24000)}`)
    } else throw new WorkspaceError("Supported files: PDF, Word, Excel, PNG/JPEG/WebP and text. Audio is not supported yet.",400)
    processed.push({name:file.name,kind})
  }
  return {refs,text:text.join("\n\n"),processed}
}
/** Bound actual bytes rather than trusting Content-Length. */
export async function boundedRequest(req:Request) {
  const reader=req.body?.getReader();if(!reader)throw new WorkspaceError("Request body required.",400)
  const chunks:Uint8Array[]=[];let size=0
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12*1024*1024){await reader.cancel();throw new WorkspaceError("Request exceeds 12 MB.",413)}chunks.push(value)}
  return Buffer.concat(chunks)
}
