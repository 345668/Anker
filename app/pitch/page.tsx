import { redirect } from "next/navigation"

/**
 * /pitch is retired in favour of the merged founder submission at /apply, which
 * feeds BOTH the deal board (as before) and the campaign engine (assessment →
 * matching → outreach). Kept as a permanent redirect so existing links and
 * bookmarks land on the one form.
 */
export default function PitchRedirect() {
  redirect("/apply")
}
