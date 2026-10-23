import { LegalDoc } from "@/components/investor/legal-doc"
import { INVESTOR_TERMS_VERSION, NOTICE } from "@/lib/investor/terms-text"

export const metadata = { title: "Investor privacy notice" }
export default function Page() { return <LegalDoc title="Investor privacy notice" version={INVESTOR_TERMS_VERSION} sections={NOTICE} /> }
