import { FundTabs } from "@/components/portfolio/fund-tabs"

/** Wraps every fund sub-page with the Carta-style fund detail tab bar. */
export default function FundLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FundTabs />
      {children}
    </>
  )
}
