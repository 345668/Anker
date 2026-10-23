import { LegalDoc } from "@/components/investor/legal-doc"
import { INVESTOR_TERMS_VERSION, TERMS } from "@/lib/investor/terms-text"

export const metadata = { title: "Investor terms" }
export default function Page() { return <LegalDoc title="Investor terms" version={INVESTOR_TERMS_VERSION} sections={TERMS} /> }
