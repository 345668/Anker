import { redirect } from "next/navigation"
/** Keep old fund-directory bookmarks valid. */
export default function LpDirectoryAlias() { redirect("/dashboard/portfolio/fund/partners") }
