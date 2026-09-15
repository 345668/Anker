import { deckUploadError } from "./deck-upload"
import { MatchingError } from "./access"
export async function readDeckUpload(req: Request) {
  const form = await req.formData()
  const deck = form.get("pitch_deck")
  const documents = form.getAll("data_room")
  if ((deck && !(deck instanceof File)) || documents.some(f => !(f instanceof File))) throw new MatchingError("Invalid file upload.", 400)
  const files = [...(deck ? [deck as File] : []), ...documents as File[]]
  const error = deckUploadError(files)
  if (error) throw new MatchingError(error, 422)
  const parsed = []
  for (const file of files) {
    if (/\.pdf$/i.test(file.name)) {
      const buffer = Buffer.from(await file.arrayBuffer())
      if (buffer.subarray(0, 5).toString() !== "%PDF-") throw new MatchingError(`${file.name} is not a valid PDF.`, 422)
      parsed.push({ name: file.name, contentType: "application/pdf", base64: buffer.toString("base64") })
    } else parsed.push({ name: file.name, contentType: "text/plain", base64: "", text: (await file.text()).slice(0, 200000) })
  }
  return { form, pitchDeck: deck ? parsed[0] : null, dataRoom: deck ? parsed.slice(1) : parsed }
}
