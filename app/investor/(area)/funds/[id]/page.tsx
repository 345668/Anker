import { FundPage } from "@/components/investor/fund-page"
export const metadata = { title: "Fund" }
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <FundPage fundId={(await params).id} /> }
