import { EntityDashboard } from "@/components/investor/entity-dashboard"
export const metadata = { title: "Entity" }
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <EntityDashboard id={(await params).id} /> }
