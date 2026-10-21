# 02. Listing a fund, and "funds that fit you"

*Questions 8 to 11. Wording: `07`, "Listing and browsing funds". Draft; not legal advice.*

## What the product does *(tested)*
- **A fund is invisible to investors until its manager lists it.** Listing needs: the fund's rules set, a snapshot taken from the fund and the manager's profile, and the switch on. No fund is listed today. Listing is by the workspace owner or an admin; it is audited.
- **What an investor sees of a listed fund** is a fixed snapshot: fund name, manager name, description, strategy, stages, sectors, geographies, target size and currency, vintage, status, minimum commitment, term, vehicle type, and one sentence "who may invest" built from the rules. **Never** documents, the fund's LP list, performance, the CRM or anyone's contact details. The snapshot is taken when the manager lists or refreshes it; later edits do not appear until refreshed.
- **Eligibility rules the fund sets:** investor categories accepted; allowed countries; excluded countries; minimum cheque; professional only; a daily limit on new requests; whether an NDA is needed (with its text); and **strict mode**.
- **Ranking.** For one of the investor's entities, listed funds are shown eligible first, then unclear, then ineligible (shown, flagged, never hidden), and within each by fit. Fit is computed only from what both sides state: sectors, stage, geography, cheque size, horizon. A fact that is missing adds nothing and is listed as "not judged"; the score is scaled over what could be judged and carries a confidence. **There is no AI, no performance data and no judgement of a fund's quality** in the ranking. The page says: "Funds are ranked by how well their stated focus matches what you say you look for. This is not advice and not a recommendation; check each fund yourself."
- **Strict mode.** If a fund switches it on, an investor who clearly does not meet its stated rules cannot send a request and is told so; an investor whose eligibility is merely unclear still can. Off by default.
- **Closed funds** (status closed, harvesting, liquidated) take no new requests.

## What the product does not do
- It does not check that a fund may lawfully market in an investor's country beyond the allow and exclude lists the fund itself sets.
- It does not verify what a fund says about itself, or that an investor's self-declared category is true.
- It does not rank by returns, rate funds, or recommend any fund.

## Proposed position
- Anker provides a register and a matching of stated preferences; the fund is responsible for its marketing compliance and its rules; the fund terms contain a warranty that the fund may market to the people its rules admit and an obligation to correct or remove the listing.
- Strict mode offered, and recommended (or required) for funds restricted to professional investors.

## Open points
- Whether a "fits you" ranking is a personal recommendation (question 9) and whether listing is marketing or brokerage (question 8) are the central questions of the whole investor side.
- There is no notice-and-takedown route beyond the fund unlisting itself or the platform operator switching `listed_for_lps` off.
- Fund-facing terms for listing do not exist yet; the fund agrees to the platform's general terms.
