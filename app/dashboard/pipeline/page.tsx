import { createClient } from "@/lib/supabase/server"
import { PipelineContent } from "@/components/tesseract/pipeline-content"

export default async function PipelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <PipelineContent user={user!} />
}
