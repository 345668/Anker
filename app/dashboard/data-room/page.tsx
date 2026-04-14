import { createClient } from "@/lib/supabase/server"
import { DataRoomContent } from "@/components/tesseract/data-room-content"

export default async function DataRoomPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <DataRoomContent user={user!} />
}
