import { WorkspaceError } from "@/lib/auth/workspace-context"
import { extractPdfText } from "@/lib/ai/pdf"
export async function assistantUploads(files:File[]) {
  if(files.length>5 || files.reduce((n,f)=>n+f.size,0)>10*1024*1024)throw new WorkspaceError("Upload at most five files totaling 10 MB.",413)
  const refs:Array<{id:string;name:string;base64:string}>=[],text:string[]=[],processed:Array<{name:string;kind:string}>=[]
  for(const [index,file] of files.entries()) {
    if(!file.size || file.size>5*1024*1024)throw new WorkspaceError("Each file must be between 1 byte and 5 MB.",413)
    const bytes=Buffer.from(await file.arrayBuffer())
    let kind="text"
    if(/\.pdf$/i.test(file.name)||file.type==="application/pdf") {
      kind="pdf"
      let extracted;try{extracted=await extractPdfText(bytes)}catch{throw new WorkspaceError("Could not read this PDF. Upload a text-based PDF.",400)}
      if(!extracted.text.trim())throw new WorkspaceError("This PDF has no extractable text. Upload its pages as images for visual analysis.",400)
      text.push(`Document ${JSON.stringify(file.name)}: ${extracted.text.slice(0,24000)}`)
    } else if(["image/png","image/jpeg","image/webp"].includes(file.type)||/\.xlsx$/i.test(file.name)) {
      kind=/\.xlsx$/i.test(file.name)?"xlsx":"image"
      const id=`${kind==="xlsx"?"XLSX":"IMG"}${index+1}`
      refs.push({id,name:file.name,base64:bytes.toString("base64")})
      text.push(`Attachment ${JSON.stringify(file.name)}: use ${kind==="xlsx"?"xlsxBase64":"imageBase64"}: "<<${id}>>" in the appropriate tool. The server resolves the bytes.`)
    } else if(/^text\//.test(file.type)||/\.(txt|md|csv|json|tsv)$/i.test(file.name)) {
      text.push(`Document ${JSON.stringify(file.name)}: ${bytes.toString("utf8").slice(0,24000)}`)
    } else throw new WorkspaceError("Supported files: PDF, PNG/JPEG/WebP, XLSX and text. Word and audio are not supported yet.",400)
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
