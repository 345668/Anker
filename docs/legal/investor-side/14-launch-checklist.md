# 14. Launch checklist: what is left, in order, and who does it

*As of 2026-10-23. Everything that the code can do is done; what follows needs the founder, counsel or a provider account. Each step says how to know it is done.*

## A. Facts only you can supply (about an hour)
1. **Regions.** In your own shell: `node scripts/legal/read-regions.mjs` (add `RESEND_API_KEY=…` and `SUPABASE_ACCESS_TOKEN=…` and `NEXT_PUBLIC_SUPABASE_URL=…` for the two lookups, or read both from the dashboards). *Done when:* you can write down the region of the database (known: AWS us-east-1), sign-in and email, and have updated the sub-processor register (the `/privacy/subprocessors` page reads it) and the "Where" section of the notice (`lib/investor/terms-text.ts`).
2. **Company details.** Replace `[legal form and registered office in Berlin, Germany]` and `[Postal address]` in `lib/investor/terms-text.ts`. The controller name (Anker AI), the contact addresses and the governing law are taken from the existing privacy page and terms; check they are right.

## B. Decisions
3. **The database.** Decide: open with the US database (and counsel's view on transfers), or move to the EU first (`12-eu-region-runbook.md`). The passport waits for this either way (`investor_passport`, off).
4. **Scanning.** Decide whether launch needs `INVESTOR_SCAN=required`. If yes: a small EU server running `ops/clamav/docker-compose.yml`, then `CLAMAV_HOST` in the hosting environment, `INVESTOR_SCAN=optional`, test with the EICAR file, then `required` (`13-virus-scanning-runbook.md`).
5. **Key.** Confirm the key can stay an environment variable; know where the secret is kept besides the host (`11-key-management.md`).

## C. Counsel
6. **Send the pack** (`Anker-investor-side-counsel-pack.docx`). Questions marked **B** in `00-counsel-brief.md` come first.
7. **Apply counsel's answers** in one place each: wording in `lib/investor/legal.ts` (raise `LEGAL_VERSION`, regenerate with `npx tsx scripts/legal/gen-investor-pack.ts`, update the two pinned hashes in `lib/investor/legal.test.ts`); terms and notice in `lib/investor/terms-text.ts` (raise `INVESTOR_TERMS_VERSION`; set `TERMS_STATUS` to `"approved"` only when no `[bracket]` is left: the tests enforce it); retention periods in `lib/investor/retention-policy.ts`. *Done when:* `pnpm test` passes and the draft banner is gone.

## D. The supervised run (before the first real investor)
Use a throwaway fund and your own addresses; keep the other switches off.
1. **A throwaway fund and workspace.** In a test workspace create a fund, set the fund profile (sectors, geography, stage, minimum commitment, thesis), then on *Investors* set the rules, tick strict mode, and press *Show to investors*. *Check:* the fund appears to an investor and to nobody else.
2. **Open sign-up briefly.** Set `investor_signup` to on (`UPDATE platform_flags SET enabled = true WHERE key = 'investor_signup'`, or the flag tool). Sign up with a fresh address. *Check:* the code email arrives and holds only the code; no account exists before the code; the password step creates the account; you land on `/investor`; the terms and notice links open the draft pages.
3. **Find, ask, talk.** Create an entity with interests; open *Find a fund*; open the fund; send a request. *Check:* the fund workspace gets an in-app notice; accept it; the investor gets a content-free email; exchange messages; attach a PDF and an image (try the EICAR file and an active-content PDF: both must be refused); accept the fund's NDA; share a document from the data room; propose a meeting.
4. **Onboarding.** Press *Invite to onboard*. *Check:* an investor record appears in the fund's LP list; the doc 60 invitation email arrives; the stage follows as you progress.
5. **The passport (only if you decided to open it).** Turn `investor_passport` on; add a document; share it with the fund; take it back; check the fund's copy is deleted if unseen and retained if checked.
6. **Teams.** Invite a second address as *can view* and another as *can act*; check each can do only what the role allows, and the fund never shows them.
7. **Rights.** *Download my data* (check the file); then *Delete my investor account* on a throwaway investor; check the fund's record is anonymised and the sign-in is gone.
8. **Close again.** Set `investor_signup` and the other flags back to off (or leave sign-up open if that is the decision), delete the throwaway fund's listing, and run `GET /api/cron/investor-retention?dry=1` with the cron secret to see the retention counts.

## E. Opening
9. In this order, each as its own decision: `investor_signup`; then a first real fund's *Show to investors*; then, after the counsel answers on it and enough investors exist, `investor_discoverability`; the passport last.
