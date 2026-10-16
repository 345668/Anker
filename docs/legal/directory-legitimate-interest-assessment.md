# Legitimate interest assessment: the investor directory (DRAFT for counsel)

Status: **draft prepared from the facts in docs/architecture/54, not legal advice and not signed off.** Counsel completes and signs it. Every statement of fact below can be checked in the directory source register (SAIL, Directory sources) and the sub-processor register.

## 1. Purpose test: what is the interest?
Anker operates a platform that helps founders find investors for their companies and helps funds find investors for their funds. The directory of investor contact details is the data set that makes the matching possible. The interests are Anker's commercial interest in operating the service, the founders' and funds' interest in reaching suitable investors, and the investors' own professional interest in receiving relevant opportunities. These are real, current and lawful interests; none depends on anything unlawful.

## 2. Necessity test: is the processing needed for it?
Matching needs investor identity, firm, investment focus and a way to reach the person. The directory holds business information only: name, title, firm, business email and phone, LinkedIn profile address, location, and investment focus. Less data would not allow a founder to contact the right person. Open question for counsel: whether holding personal business email addresses and phone numbers beyond the firm's published contact is necessary, or whether a firm-level route would do for part of the data.

## 3. Balancing test: do the person's interests override?
Factors in favour of the processing: the data is professional, relates to a person's public investing role, and is used for professional contact; the person would reasonably expect to be approached about investments; every email carries a one-click unsubscribe that stops all contact on every channel; a public page lets the person see, correct, restrict, erase or object, with a 30-day answer; erased people are kept out through an irreversible code; sources are recorded and used only as their terms allow; withdrawn sources are removed.
Factors against: the person did not give the data to Anker and may not know it is held; the directory is large (about 50,000 people) and shared across customers; some data came from commercial lists whose terms limit use (recorded per source; the vendor sample is restricted to internal matching); some sources were gathered before a register existed and are marked "unreviewed" until reviewed; provider regions include countries outside the EEA (see the sub-processor page); email outreach in Germany is subject to the unfair-competition act's rule on unsolicited electronic mail (docs/architecture/37 section 8.3), which is a separate legal question from the data-protection basis and is gated per recipient country in the sending code.
Provisional view: the balance supports the processing for matching and for outreach through the platform for sources that are reviewed and licensed, with the safeguards above. It does not support outreach to people from an unreviewed or restricted source, which the use gate refuses or warns about. **Counsel to confirm or revise.**

## 4. Safeguards in place (as built)
Source and licence register with a use gate (restricted and withdrawn sources are blocked; unreviewed sources warn). Identity hashes and tombstones. Public request page with email confirmation; objection carried out on confirmation; access, correction, restriction, erasure by an operator within 30 days. A retention schedule. A directory notice and a sub-processor page generated from the registers. A per-workspace AI data policy (standard, EU only). An operator audit trail that holds no requester details.

## 5. Open questions for counsel
1. Is legitimate interest the right basis for each source, or is another basis (or the supplier's warranty of lawful collection) needed for the commercial lists?
2. Does Article 14(5)(b) (disproportionate effort) allow the public notice instead of individual notice to everyone in the directory, or must people be notified individually at first contact? Today first contact by Anker-sent email carries the pointer in its footer.
3. The 36-month review rule, and the retention periods in docs/architecture/54 section 8.
4. Whether showing vendor-sourced records to customers counts as "internal use" under the vendor's terms (treated as not permitted until answered).
5. Transfers: the database and hosting are inferred to be in the United States and the default AI provider in Singapore. Which transfer mechanism applies to each, and what must the notice say.
6. The identity check for requesters who cannot receive email at the address we hold.
7. Whether Anker is a controller of the shared directory and a processor for a workspace's own contact copies, and the customer data-processing agreement.
