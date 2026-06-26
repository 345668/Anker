/**
 * Legal & Compliance — phase 6: the 13 document templates.
 *
 * Each template is a Markdown string with {{handlebars}} slots that
 * map 1:1 to the 94-field legal-fields taxonomy. The renderer in
 * legal-template-renderer.ts substitutes each {{field_key}} with the
 * fund's current value (computed values included) or, when empty,
 * renders an inline `[ Field Label · TBD ]` deep-link back to the
 * editor.
 *
 * Sources (cited per-template under SOURCE):
 *   - Delaware Cert of LLC Formation:
 *     https://corpfiles.delaware.gov/LLC_Forms/LLC%20Formation.pdf
 *   - Delaware Cert of Limited Partnership:
 *     https://corpfiles.delaware.gov/lpform09.pdf
 *   - ILPA Model LPA (Whole-of-Fund + Deal-by-Deal, July 2020):
 *     https://ilpa.org/model-lpa/
 *   - NVCA Model Legal Documents (financing precedent):
 *     https://nvca.org/model-legal-documents/
 *   - SEC Rule 501(a) "Accredited Investor" — 17 CFR § 230.501
 *   - SEC Regulation D (Rules 504, 506(b), 506(c)) — 17 CFR § 230.500-508
 *   - Delaware Limited Liability Company Act — 6 Del. C. ch. 18
 *   - Delaware Revised Uniform Limited Partnership Act — 6 Del. C. ch. 17
 *
 * The Delaware certificates use the state's official form text
 * VERBATIM (those PDFs are public domain — state-published forms).
 * The other 10 templates are professionally drafted scaffolds based
 * on the cited statutes; they are starting points for outside
 * counsel, not legal advice (a banner on every rendered page says so).
 */

export interface LegalTemplate {
  /** Stable doc_key matching DOCUMENT_CATALOGUE. */
  docKey: string
  /** Display title. */
  title: string
  /** Citation block — shown above the body in italic. */
  source: string
  /** Markdown body with {{handlebars}} interpolation slots. */
  body: string
}

// ─── State-statutory: Delaware official forms (verbatim) ─────────────────

const FM_CERT_OF_FORMATION: LegalTemplate = {
  docKey: "fm_certificate_of_formation",
  title: "Certificate of Formation of a Limited Liability Company",
  source: "Delaware Division of Corporations — Official Form (rev. 8/2023). Source: https://corpfiles.delaware.gov/LLC_Forms/LLC%20Formation.pdf · Filed under 6 Del. C. § 18-201.",
  body: `**STATE OF DELAWARE**
**CERTIFICATE OF FORMATION**
**OF LIMITED LIABILITY COMPANY**

The undersigned authorized person, desiring to form a limited liability company pursuant to the Limited Liability Company Act of the State of Delaware, hereby certifies as follows:

**1.** The name of the limited liability company is **{{fm_legal_name}}**.

**2.** The Registered Office of the limited liability company in the State of Delaware is located at **{{fm_registered_office_address.line1}}**, in the City of **{{fm_registered_office_address.city}}**, Zip Code **{{fm_registered_office_address.postal}}**. The name of the Registered Agent at such address upon whom process against this limited liability company may be served is **{{fm_registered_agent}}**.

By: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
**Authorized Person**

Name: **{{fm_authorized_person}}**
*(Print or Type)*

**Filing fee: $110 payable to "Delaware Secretary of State". Annual LLC tax of $300 due June 1 of each year following formation.**`,
}

const GP_CERT_OF_FORMATION: LegalTemplate = {
  docKey: "gp_certificate_of_formation",
  title: "Certificate of Formation of a Limited Liability Company (General Partner)",
  source: "Delaware Division of Corporations — Official Form (rev. 8/2023). Source: https://corpfiles.delaware.gov/LLC_Forms/LLC%20Formation.pdf · Filed under 6 Del. C. § 18-201.",
  body: `**STATE OF DELAWARE**
**CERTIFICATE OF FORMATION**
**OF LIMITED LIABILITY COMPANY**

The undersigned authorized person, desiring to form a limited liability company pursuant to the Limited Liability Company Act of the State of Delaware, hereby certifies as follows:

**1.** The name of the limited liability company is **{{gp_legal_name}}**.

**2.** The Registered Office of the limited liability company in the State of Delaware is located at **{{gp_registered_office_address.line1}}**, in the City of **{{gp_registered_office_address.city}}**, Zip Code **{{gp_registered_office_address.postal}}**. The name of the Registered Agent at such address upon whom process against this limited liability company may be served is **{{gp_registered_agent}}**.

By: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
**Authorized Person**

Name: **{{gp_authorized_person}}**
*(Print or Type)*

**Filing fee: $110 payable to "Delaware Secretary of State". Annual LLC tax of $300 due June 1 of each year following formation.**`,
}

const CERT_OF_LP: LegalTemplate = {
  docKey: "certificate_of_limited_partnership",
  title: "Certificate of Limited Partnership",
  source: "Delaware Division of Corporations — Official Form (rev. 06/04). Source: https://corpfiles.delaware.gov/lpform09.pdf · Filed under 6 Del. C. § 17-201 of the Delaware Revised Uniform Limited Partnership Act.",
  body: `**STATE OF DELAWARE**
**CERTIFICATE OF LIMITED PARTNERSHIP**

The Undersigned, desiring to form a limited partnership pursuant to the Delaware Revised Uniform Limited Partnership Act, 6 Delaware Code, Chapter 17, do hereby certify as follows:

**First:** The name of the limited partnership is **{{fund_name}}**.

**Second:** The address of its registered office in the State of Delaware is **{{fund_registered_office_address.line1}}** in the city of **{{fund_registered_office_address.city}}**. Zip code **{{fund_registered_office_address.postal}}**. The name of the Registered Agent at such address is **{{fund_registered_agent}}**.

**Third:** The name and mailing address of each general partner is as follows:

- **{{gp_managing_member}}** — {{gp_registered_office_address.line1}}, {{gp_registered_office_address.city}}, {{gp_registered_office_address.region}} {{gp_registered_office_address.postal}}

**In Witness Whereof**, the undersigned has executed this Certificate of Limited Partnership as of **{{date_of_formation}}**.

By: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
**General Partner**

Name: **{{gp_authorized_person}}**
*(type or print name)*

**Filing fee: $200 payable to "Delaware Secretary of State". Annual LP tax of $300 due June 1 of each year following formation.**`,
}

// ─── Internal authorizations (Del. § 18-204) ─────────────────────────────

const FM_AUTHORIZATION: LegalTemplate = {
  docKey: "fm_authorization_to_act_as_organizer",
  title: "Authorization to Act as Organizer (Management Company)",
  source: "Drafted pursuant to 6 Del. C. § 18-201(a) authorizing any person to file the certificate of formation. Internal resolution — no state filing required.",
  body: `**AUTHORIZATION TO ACT AS ORGANIZER**

**{{fm_legal_name}}** *(a Delaware limited liability company to be formed)*

The undersigned, being all of the persons proposing to organize the limited liability company referenced above (the "**Company**"), hereby authorize **{{fm_authorized_person}}** (the "**Organizer**"), acting alone and individually, to:

1. Execute and file with the Delaware Secretary of State the Certificate of Formation of the Company pursuant to 6 Del. C. § 18-201;
2. Appoint **{{fm_registered_agent}}** as the registered agent of the Company at **{{fm_registered_office_address.line1}}**, **{{fm_registered_office_address.city}}**, Delaware **{{fm_registered_office_address.postal}}**;
3. Take any and all other actions reasonably necessary or convenient to effect the formation of the Company; and
4. Upon filing of the Certificate of Formation, this authorization shall terminate and the Organizer shall have no further power or authority hereunder.

This authorization may be executed in counterparts.

Executed and effective as of **{{date_of_formation}}**.

\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
**{{fm_managing_member}}**
*Member*`,
}

const GP_AUTHORIZATION: LegalTemplate = {
  docKey: "gp_authorization_to_act_as_organizer",
  title: "Authorization to Act as Organizer (General Partner)",
  source: "Drafted pursuant to 6 Del. C. § 18-201(a). Internal resolution — no state filing required.",
  body: `**AUTHORIZATION TO ACT AS ORGANIZER**

**{{gp_legal_name}}** *(a Delaware limited liability company to be formed)*

The undersigned, being all of the persons proposing to organize the limited liability company referenced above (the "**General Partner**" or "**GP**"), hereby authorize **{{gp_authorized_person}}** (the "**Organizer**"), acting alone and individually, to:

1. Execute and file with the Delaware Secretary of State the Certificate of Formation of the GP pursuant to 6 Del. C. § 18-201;
2. Appoint **{{gp_registered_agent}}** as the registered agent of the GP at **{{gp_registered_office_address.line1}}**, **{{gp_registered_office_address.city}}**, Delaware **{{gp_registered_office_address.postal}}**;
3. Take any and all other actions reasonably necessary or convenient to effect the formation of the GP; and
4. Upon filing of the Certificate of Formation, this authorization shall terminate and the Organizer shall have no further power or authority hereunder.

This authorization may be executed in counterparts.

Executed and effective as of **{{date_of_formation}}**.

\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
**{{gp_managing_member}}**
*Member*`,
}

// ─── LLC operating agreements (Del. § 18-101(9)) ─────────────────────────

const FM_INITIAL_LLCA: LegalTemplate = {
  docKey: "fm_initial_llc_agreement",
  title: "Initial Limited Liability Company Agreement (Management Company)",
  source: "Drafted pursuant to 6 Del. C. § 18-101(9) and § 18-201(d). Initial agreement; superseded by an Amended & Restated agreement upon first capital contribution if applicable.",
  body: `**INITIAL LIMITED LIABILITY COMPANY AGREEMENT**

**of {{fm_legal_name}}**

This **Initial Limited Liability Company Agreement** (this "**Agreement**") of **{{fm_legal_name}}** (the "**Company**"), a Delaware limited liability company, is entered into as of **{{fm_llca_date}}**, by **{{fm_managing_member}}** (the "**Member**").

### 1. Formation.
The Member hereby acknowledges that the Company was formed by the filing of the Certificate of Formation with the Delaware Secretary of State on **{{date_of_formation}}** pursuant to the Delaware Limited Liability Company Act (6 Del. C. ch. 18) (the "**Act**").

### 2. Name; Principal Office.
The name of the Company is **{{fm_legal_name}}**. The principal office of the Company shall be located at **{{fm_principal_office_address.line1}}**, **{{fm_principal_office_address.city}}**, **{{fm_principal_office_address.region}}** **{{fm_principal_office_address.postal}}**, or at such other location as the Member may designate from time to time.

### 3. Registered Agent.
The registered agent of the Company in the State of Delaware is **{{fm_registered_agent}}** at **{{fm_registered_office_address.line1}}**, **{{fm_registered_office_address.city}}**, Delaware **{{fm_registered_office_address.postal}}**.

### 4. Purpose.
The Company is formed for the purpose of providing investment management, advisory and related services to **{{fund_name}}** and any successor or affiliated funds, and engaging in any other lawful business under the Act.

### 5. Term.
The Company shall have perpetual existence unless dissolved in accordance with this Agreement or the Act.

### 6. Member; Capital Contribution.
The sole member is **{{fm_managing_member}}**, holding a 100% membership interest. The Member's initial capital contribution is set forth on the books and records of the Company.

### 7. Management.
The Company shall be member-managed. The Member shall have full, exclusive and complete authority to manage and control the business and affairs of the Company.

### 8. Distributions; Allocations.
All profits and losses of the Company shall be allocated to, and all distributions shall be made to, the Member.

### 9. Limited Liability.
The Member shall have no personal liability for the Company's debts, obligations or liabilities solely by reason of being a member, except as expressly required by the Act.

### 10. Indemnification.
To the fullest extent permitted by the Act, the Company shall indemnify the Member and any officer, agent or employee of the Company against all losses, claims, damages and expenses arising out of the performance of their duties to the Company, except in the case of fraud, willful misconduct or gross negligence.

### 11. Dissolution.
The Company shall be dissolved upon the written election of the Member or the entry of a decree of judicial dissolution under § 18-802 of the Act.

### 12. Governing Law.
This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict-of-laws principles.

**IN WITNESS WHEREOF**, the undersigned has executed this Agreement as of the date first written above.

\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
**{{fm_managing_member}}**
*Member*`,
}

const GP_INITIAL_LLCA: LegalTemplate = {
  docKey: "gp_initial_llc_agreement",
  title: "Initial Limited Liability Company Agreement (General Partner)",
  source: "Drafted pursuant to 6 Del. C. § 18-101(9) and § 18-201(d).",
  body: `**INITIAL LIMITED LIABILITY COMPANY AGREEMENT**

**of {{gp_legal_name}}**

This **Initial Limited Liability Company Agreement** (this "**Agreement**") of **{{gp_legal_name}}** (the "**GP**"), a Delaware limited liability company, is entered into as of **{{gp_llca_date}}**, by **{{gp_managing_member}}** (the "**Member**").

### 1. Formation.
The Member acknowledges that the GP was formed by the filing of the Certificate of Formation with the Delaware Secretary of State on **{{date_of_formation}}** pursuant to the Delaware LLC Act (6 Del. C. ch. 18).

### 2. Name; Principal Office.
The name of the GP is **{{gp_legal_name}}**. The principal office is located at **{{gp_principal_office_address.line1}}**, **{{gp_principal_office_address.city}}**, **{{gp_principal_office_address.region}}** **{{gp_principal_office_address.postal}}**.

### 3. Purpose.
The GP is formed for the exclusive purpose of acting as the general partner of **{{fund_name}}** (the "**Fund**"), a Delaware limited partnership, and any successor or parallel fund vehicles.

### 4. Term.
The GP shall have perpetual existence unless dissolved.

### 5. Member; Capital Contribution.
The sole member is **{{gp_managing_member}}** holding a 100% membership interest.

### 6. Management.
The GP shall be member-managed. The Member shall have full authority to manage the business and affairs of the GP, including the exercise of all rights and powers of the GP as general partner of the Fund.

### 7. Distributions; Allocations.
All distributions received by the GP in its capacity as general partner of the Fund (including carried interest distributions) shall be allocated and distributed to the Member, subject to any internal vesting or revenue-sharing agreements adopted by the Member.

### 8. Limited Liability.
The Member shall have no personal liability for the GP's debts solely by reason of being a member, except as required by the Act.

### 9. Indemnification.
To the fullest extent permitted by the Act, the GP shall indemnify the Member, its principals, officers, agents and employees against all losses, claims, damages and expenses incurred in connection with the GP's role as general partner of the Fund, except in the case of fraud, willful misconduct or gross negligence.

### 10. Governing Law.
Delaware law applies, without regard to conflict-of-laws principles.

**IN WITNESS WHEREOF**, the undersigned has executed this Agreement as of the date first written above.

\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
**{{gp_managing_member}}**
*Member*`,
}

// ─── Investment Management Agreement ─────────────────────────────────────

const IMA: LegalTemplate = {
  docKey: "investment_management_agreement",
  title: "Investment Management Agreement",
  source: "Drafted following customary practice for Delaware-domiciled venture funds. Investment-adviser activity governed by the Investment Advisers Act of 1940 (and applicable state adviser laws); review exempt-reporting-adviser status with counsel.",
  body: `**INVESTMENT MANAGEMENT AGREEMENT**

This **Investment Management Agreement** (this "**Agreement**") is entered into as of **{{ima_effective_date}}** by and between:

- **{{fund_name}}**, a Delaware limited partnership (the "**Fund**"), and
- **{{fm_legal_name}}**, a Delaware limited liability company (the "**Manager**").

### Recitals
**WHEREAS**, the Fund desires to engage the Manager to provide investment management, advisory and administrative services; and

**WHEREAS**, the Manager desires to provide such services on the terms set forth herein;

**NOW, THEREFORE**, the parties agree as follows:

### 1. Appointment.
The Fund hereby appoints the Manager, and the Manager hereby accepts the appointment, to act as the Fund's investment manager with the duties and authority set forth in this Agreement and the Fund's Limited Partnership Agreement.

### 2. Services.
The Manager shall:
(a) identify, evaluate, structure, recommend, execute and monitor portfolio investments consistent with the Fund's investment strategy ({{investment_strategy_type}});
(b) furnish all reports and other information as required by the LPA;
(c) maintain books and records of the Fund;
(d) provide all administrative services reasonably necessary to operate the Fund.

### 3. Authority.
Subject to oversight by **{{ic_member_names}}** acting as the Investment Committee (the "**IC**") and to the IC vote threshold of **{{ic_vote_threshold}}**, the Manager shall have full authority to make and dispose of portfolio investments on behalf of the Fund.

### 4. Compensation.
(a) **Management Fee.** The Fund shall pay the Manager a management fee equal to **{{management_fee}}%** per annum of committed capital during the Investment Period, stepping down to **{{management_fee_post_investment_period}}%** per annum thereafter, payable in advance on a quarterly basis.

(b) **Expenses.** The Fund shall reimburse the Manager for fund-level expenses as set forth in the LPA.

### 5. Term; Termination.
This Agreement shall commence on the Effective Date and continue until the dissolution of the Fund, unless earlier terminated:
(a) by the Manager upon **{{notice_period_days}}** days' written notice; or
(b) by the Fund following a vote of the Limited Partners meeting the LPA's removal threshold.

### 6. Standard of Care.
The Manager shall perform its duties with the care, skill, prudence and diligence that a prudent investment manager would use under the circumstances. The Manager shall not be liable to the Fund except in the case of fraud, willful misconduct, gross negligence or material breach.

### 7. Indemnification.
The Fund shall indemnify and hold harmless the Manager, its officers, directors, members, employees and agents from any losses arising out of the performance of services hereunder, except in cases of fraud, willful misconduct or gross negligence.

### 8. Affiliate Services.
{{affiliate_services}}

### 9. Notices.
All notices shall be in writing and delivered to the addresses set forth on the signature page, with copies to **{{fund_administrator}}** and **{{fund_counsel}}**.

### 10. Governing Law.
Delaware law applies, without regard to conflict-of-laws principles. The parties consent to exclusive jurisdiction in the state and federal courts located in Wilmington, Delaware.

**IN WITNESS WHEREOF**, the parties have executed this Agreement as of the date first written above.

**THE FUND:**
**{{fund_name}}**
By: {{gp_legal_name}}, its General Partner
By: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_  Name: **{{gp_authorized_person}}**

**THE MANAGER:**
**{{fm_legal_name}}**
By: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_  Name: **{{fm_authorized_person}}**`,
}

// ─── Fund layer ──────────────────────────────────────────────────────────

const INITIAL_LPA: LegalTemplate = {
  docKey: "initial_limited_partnership_agreement",
  title: "Initial Limited Partnership Agreement",
  source: "Drafted pursuant to 6 Del. C. ch. 17 (Delaware Revised Uniform Limited Partnership Act). Superseded by the Amended & Restated LPA executed at first close. ILPA Model LPA reference: https://ilpa.org/model-lpa/.",
  body: `**INITIAL LIMITED PARTNERSHIP AGREEMENT**

**of {{fund_name}}**

This **Initial Limited Partnership Agreement** (this "**Agreement**") of **{{fund_name}}** (the "**Partnership**" or "**Fund**") is entered into as of **{{date_of_formation}}** by and between:

- **{{gp_legal_name}}**, a Delaware limited liability company (the "**General Partner**" or "**GP**"); and
- **{{gp_legal_name}}**, in its capacity as the initial limited partner (the "**Initial Limited Partner**").

### 1. Formation.
The Partnership was formed under the Delaware Revised Uniform Limited Partnership Act (6 Del. C. ch. 17) (the "**Act**") upon the filing of the Certificate of Limited Partnership with the Delaware Secretary of State on **{{date_of_formation}}**.

### 2. Name; Principal Office.
The name of the Partnership is **{{fund_name}}**. The Partnership's principal office is located at **{{fund_principal_office_address.line1}}**, **{{fund_principal_office_address.city}}**, **{{fund_principal_office_address.region}}** **{{fund_principal_office_address.postal}}**.

### 3. Purpose.
The Partnership is formed exclusively for the purpose of making, holding, managing and disposing of venture-capital investments consistent with the Fund's investment thesis: *{{thesis_statement}}*.

### 4. Term.
The Partnership shall continue until the date that is **{{fund_term}}** years after the Final Closing Date, unless extended by the GP pursuant to the A&R LPA or sooner dissolved.

### 5. Initial Capital.
The Initial Limited Partner shall make a nominal capital contribution of $100 to permit the Partnership to commence operations pending the first closing.

### 6. Supersession.
This Initial LPA shall be superseded in its entirety by the Amended & Restated Limited Partnership Agreement to be executed at the first closing of capital commitments from Limited Partners.

### 7. Governing Law.
Delaware law applies, without regard to conflict-of-laws principles.

**IN WITNESS WHEREOF**, the parties have executed this Initial LPA as of the date first written above.

**THE GENERAL PARTNER:**
**{{gp_legal_name}}**
By: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_  Name: **{{gp_authorized_person}}**`,
}

const AR_LPA: LegalTemplate = {
  docKey: "amended_restated_lpa_venture_capital",
  title: "Amended and Restated Limited Partnership Agreement",
  source: "Drafted on the ILPA Model LPA (Whole-of-Fund, July 2020) framework. Source: https://ilpa.org/model-lpa/. Governed by 6 Del. C. ch. 17. This is a structural summary — the full executed A&R LPA will run 100+ pages and should be drafted by outside counsel.",
  body: `**AMENDED AND RESTATED LIMITED PARTNERSHIP AGREEMENT**

**of {{fund_name}}**

This **Amended and Restated Limited Partnership Agreement** (this "**Agreement**") of **{{fund_name}}** (the "**Partnership**" or "**Fund**"), a Delaware limited partnership, is entered into as of the Initial Closing Date by and among the General Partner and each Person admitted as a Limited Partner.

### Article 1 — Definitions
Capitalized terms have the meanings set forth in this Agreement and Schedule A.

### Article 2 — Formation and Purpose
**2.1.** The Partnership was formed under the Act on **{{date_of_formation}}**.
**2.2.** The Partnership's purpose is to make venture-capital investments consistent with the Investment Strategy: {{investment_strategy_type}}; target geography: {{target_geography_country}}; target stage: {{target_investment_stage}}; sectors: {{sector_focus}}.

### Article 3 — Capital Commitments
**3.1.** The Partnership's target size is **{{target_fund_size}} USD** ("**Target Size**").
**3.2.** The General Partner Commitment is **{{gp_commitment_pct}}%** of total commitments (≈ {{gp_commitment_dollars}} USD).
**3.3.** The minimum Limited Partner commitment is **{{lp_commitment_minimum}} USD**, subject to GP waiver.
**3.4.** The Final Closing Date shall be the date that is **{{final_closing_period_months}}** months after the date of formation.

### Article 4 — Investment Period
**4.1.** The Investment Period shall commence on the Initial Closing Date and continue for **{{investment_period}}** years (the "**Commitment Period**"), expiring on **{{commitment_period_anniversary}}**.
**4.2.** The GP may extend the Investment Period by **{{extension_length}}** year(s) with LPAC consent, terminating no later than **{{commitment_period_extension_anniversary}}**.

### Article 5 — Distributions and Allocations (Whole-of-Fund Waterfall)
Distributions of Investment Proceeds shall be made in the following order of priority:
(a) **Return of Capital** — 100% to LPs until each LP has received aggregate distributions equal to its Drawn Commitment;
(b) **Preferred Return** — 100% to LPs until each LP has received a cumulative **{{preferred_return}}%** annual compounded return;
(c) **GP Catch-Up** — **{{catch_up_rate}}%** to the GP until the GP has received **{{carried_interest}}%** of all profits distributed under (b) and (c);
(d) **Carried Interest Split** — **{{carried_interest}}%** to the GP and **{{lp_split_pct}}%** to the LPs thereafter.

### Article 6 — Management Fee
**6.1.** During the Investment Period, the Partnership shall pay the Manager a Management Fee equal to **{{management_fee}}%** per annum of aggregate Commitments.
**6.2.** Following the Investment Period, the Management Fee shall step down to **{{management_fee_post_investment_period}}%** per annum of unreturned invested capital.

### Article 7 — Investment Restrictions
**7.1.** Single-investment cap: **{{investment_size_max}} USD**.
**7.2.** Leverage limit: **{{leverage_limit}}**.
**7.3.** Sector concentration and ESG restrictions are set forth on Schedule B.

### Article 8 — Investment Committee
**8.1.** The IC shall consist of **{{ic_member_names}}**.
**8.2.** Investment decisions require approval of **{{ic_vote_threshold}}** of the IC.

### Article 9 — Key Persons
**9.1.** "**Key Persons**" means **{{key_person_names}}**.
**9.2.** A Key Person Event triggers automatic suspension of the Investment Period pending LP vote.

### Article 10 — Reports and Information Rights
**10.1.** Audited financial statements within 90 days of fiscal year-end.
**10.2.** Quarterly unaudited reports including capital account statements within **{{quarterly_reporting_days}}** days of quarter-end.
**10.3.** Reports shall be delivered through **{{investor_portal}}**.

### Article 11 — Transfers and Withdrawals
LP interests are non-transferable except with GP consent, subject to ERISA, securities-law and tax constraints.

### Article 12 — Dissolution
The Partnership shall dissolve upon the earlier of (a) the expiration of the Fund Term, (b) the sale or distribution of all Investments, or (c) the GP's election with LPAC consent.

### Article 13 — Indemnification
The Partnership shall indemnify Covered Persons except in cases of fraud, willful misconduct or gross negligence. Material Conflicts: {{material_conflicts}}.

### Article 14 — Miscellaneous
**14.1.** Notice cutoff: **{{notice_cutoff_time}}** Eastern time.
**14.2.** Governing law: Delaware.
**14.3.** Fund Counsel: **{{fund_counsel}}**.
**14.4.** Fund Administrator: **{{fund_administrator}}**.

**IN WITNESS WHEREOF**, the parties have executed this A&R LPA as of the Initial Closing Date.

**THE GENERAL PARTNER:** **{{gp_legal_name}}** — By: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_  Name: **{{gp_authorized_person}}**

**THE LIMITED PARTNERS:** Listed on Schedule A and admitted pursuant to executed Subscription Agreements.`,
}

const SUBSCRIPTION_AGREEMENT: LegalTemplate = {
  docKey: "subscription_agreement_venture_capital",
  title: "Subscription Agreement",
  source: "Drafted following customary venture-fund Subscription Agreement structure, consistent with SEC Reg D (17 CFR § 230.500-508) and the Securities Act § 4(a)(2) private-offering framework.",
  body: `**SUBSCRIPTION AGREEMENT**

**{{fund_name}}**
A Delaware Limited Partnership

The undersigned (the "**Subscriber**") hereby subscribes for an interest in **{{fund_name}}** (the "**Fund**") in the amount and on the terms set forth below.

### 1. Subscription
**Capital Commitment:** $ \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
*(Minimum: {{lp_commitment_minimum}} USD; subject to GP waiver.)*

### 2. Acceptance
This subscription is subject to acceptance by the General Partner in its sole discretion. Upon acceptance, the Subscriber shall be admitted to the Fund as a Limited Partner and shall be bound by the Amended & Restated Limited Partnership Agreement of the Fund (the "**LPA**").

### 3. Representations of the Subscriber
The Subscriber represents and warrants that:
(a) the Subscriber is an "**accredited investor**" within the meaning of Rule 501(a) of Regulation D under the Securities Act of 1933 and qualifies under the categories set forth in the Accredited Investor Certification attached;
(b) the Subscriber is acquiring its interest for investment and not with a view to resale or distribution;
(c) the Subscriber has received and reviewed the Private Placement Memorandum dated **{{ppm_date}}**, the LPA, and such other documents and information as the Subscriber has requested;
(d) the Subscriber understands that the interest has not been registered under the Securities Act and is subject to substantial restrictions on transfer;
(e) the Subscriber has consulted with such legal, tax and investment advisers as the Subscriber considers necessary;
(f) the Subscriber has sufficient financial resources to bear the economic risk of total loss of its investment;
(g) the Subscriber is not a Prohibited Person under U.S. economic-sanctions laws; and
(h) the Subscriber's funds are not derived from any unlawful activity.

### 4. Capital Calls
The Subscriber agrees to fund Capital Contributions in response to Capital Call notices from the General Partner pursuant to the LPA. Failure to fund may result in the remedies set forth in the LPA, including loss of voting rights and forfeiture of the LP interest.

### 5. Side Letter
Any side-letter arrangements with the Subscriber shall be disclosed to the Limited Partners in accordance with the LPA's Most-Favored-Nation provisions.

### 6. Power of Attorney
The Subscriber hereby grants the General Partner a power of attorney solely to execute, file and amend the LPA and any related fund documents on the Subscriber's behalf.

### 7. Confidentiality
The Subscriber agrees to keep confidential all non-public information received from the Fund or its portfolio companies, subject to legal compulsion.

### 8. Notices
Notices shall be delivered through **{{investor_portal}}** to the address set forth on the signature page.

### 9. Governing Law
Delaware law applies. The Subscriber consents to exclusive jurisdiction in Wilmington, Delaware.

**SUBSCRIBER:**
Name: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
Title (if entity): \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
Signature: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
Date: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_

**ACCEPTED BY THE GENERAL PARTNER:**
**{{gp_legal_name}}**
By: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_  Name: **{{gp_authorized_person}}**
Date: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_`,
}

const AIC: LegalTemplate = {
  docKey: "accredited_investor_certification",
  title: "Accredited Investor Certification",
  source: "Drafted per Rule 501(a) of Regulation D, 17 CFR § 230.501(a), as amended (most recently by the 2020 SEC Accredited Investor Definition Amendment). See: https://www.sec.gov/rules-regulations/2020/08/accredited-investor-definition.",
  body: `**ACCREDITED INVESTOR CERTIFICATION**

**{{fund_name}}**

The undersigned (the "**Subscriber**") hereby certifies that it qualifies as an "**accredited investor**" within the meaning of Rule 501(a) of Regulation D under the Securities Act of 1933 by meeting at least one of the categories below. **Check all that apply:**

### A. Natural Persons
- [ ] **A.1.** Individual net worth (or joint net worth with spouse or spousal equivalent) exceeding **$1,000,000**, excluding the value of the primary residence.
- [ ] **A.2.** Individual income exceeding **$200,000** in each of the two most recent years, or joint income with spouse or spousal equivalent exceeding **$300,000**, with reasonable expectation of reaching the same level in the current year.
- [ ] **A.3.** Holder in good standing of one of the following professional certifications, designations or credentials administered by FINRA: Series 7, Series 65, or Series 82 license.
- [ ] **A.4.** "Knowledgeable employee" of the Fund or its affiliated investment-adviser entity, as defined in Rule 3c-5(a)(4) under the Investment Company Act of 1940.
- [ ] **A.5.** Family-office "family client" pursuant to Rule 202(a)(11)(G)-1 under the Investment Advisers Act of 1940, where the family office has assets under management in excess of **$5,000,000**.

### B. Entities
- [ ] **B.1.** Bank, savings & loan association, insurance company, registered investment company, business development company, small business investment company, rural business investment company, or licensed Plan as described in § 501(a)(1).
- [ ] **B.2.** Corporation, partnership, LLC, Massachusetts or similar business trust not formed for the specific purpose of acquiring the securities offered, with **total assets in excess of $5,000,000**.
- [ ] **B.3.** Trust with **total assets in excess of $5,000,000** not formed for the specific purpose of acquiring the securities, whose purchase is directed by a sophisticated person.
- [ ] **B.4.** Entity in which all of the equity owners are accredited investors.
- [ ] **B.5.** Entity, of a type not listed in (B.1)-(B.4), not formed for the specific purpose of acquiring the securities, owning **investments in excess of $5,000,000**.
- [ ] **B.6.** "Family office" as defined in Rule 202(a)(11)(G)-1 under the Advisers Act, with assets under management in excess of $5,000,000, not formed for the specific purpose of acquiring the securities, with investment directed by a person with such knowledge and experience that the family office is capable of evaluating the merits and risks of the prospective investment.

### Certification
The Subscriber certifies under penalty of perjury that the foregoing is true and correct, and acknowledges that the Fund will rely on this certification in determining the Subscriber's eligibility to invest.

**SUBSCRIBER:**
Name: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
Signature: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
Date: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_`,
}

const PPM: LegalTemplate = {
  docKey: "private_placement_memorandum_venture_capital",
  title: "Private Placement Memorandum",
  source: "Drafted under § 4(a)(2) of the Securities Act of 1933 and Rule 506 of Regulation D (17 CFR § 230.506). Confidential — for the use of the named recipient only.",
  body: `# PRIVATE PLACEMENT MEMORANDUM

## {{fund_name}}
*(A Delaware Limited Partnership)*

**Target Fund Size: {{target_fund_size}} USD**
**General Partner: {{gp_legal_name}}**
**Manager: {{fm_legal_name}}**
**Date: {{ppm_date}}**

---

**CONFIDENTIAL — DO NOT DISTRIBUTE**

This Private Placement Memorandum is furnished on a confidential basis to a limited number of accredited investors for the purpose of evaluating an investment in the Fund. The information contained herein is proprietary. Each recipient agrees not to reproduce or distribute this PPM. The interests described herein have not been registered under the Securities Act of 1933 and are subject to substantial restrictions on transfer.

---

## I. Executive Summary

**Thesis.** {{thesis_statement}}

**Why Now.** {{why_now}}

**Target Returns.** Net IRR target: **{{target_net_irr}}%**. Net MOIC target: **{{target_net_moic}}×**.

---

## II. Investment Philosophy

{{investment_philosophy}}

---

## III. Market Opportunity

{{market_opportunity}}

---

## IV. Target Market

{{target_market_description}}

**Sector Focus:** {{sector_focus}}
**Target Stage:** {{target_investment_stage}}
**Target Geography:** {{target_geography_country}}
**Investment Strategy Type:** {{investment_strategy_type}}

---

## V. Investment Process

**Investment Committee.** The IC consists of {{ic_member_names}}. Investment decisions require {{ic_vote_threshold}} of the IC.

**Check size.** \${{investment_size_min}} – \${{investment_size_max}} per portfolio company. Leverage limit: {{leverage_limit}}.

**Diligence.** All investments undergo full commercial, technical, financial and legal diligence with materials retained by Fund Administrator {{fund_administrator}}.

---

## VI. Team

**Key Persons.** {{key_person_names}}

**Investment Manager Experience.** {{investment_manager_experience}}

**Investment Committee Experience.** {{ic_experience}}

---

## VII. Fund Terms (Summary)

| | |
|---|---|
| Target Fund Size | {{target_fund_size}} USD |
| Fund Term | {{fund_term}} years |
| Investment Period | {{investment_period}} years |
| Commitment Period Anniversary | {{commitment_period_anniversary}} |
| Management Fee | {{management_fee}}% during IP / {{management_fee_post_investment_period}}% after |
| Carried Interest | {{carried_interest}}% (LP split: {{lp_split_pct}}%) |
| Catch-Up | {{catch_up_rate}}% |
| Preferred Return | {{preferred_return}}% |
| GP Commitment | {{gp_commitment_pct}}% (~{{gp_commitment_dollars}} USD) |
| LP Commitment Minimum | {{lp_commitment_minimum}} USD |
| Quarterly Reporting | within {{quarterly_reporting_days}} days |
| Investor Portal | {{investor_portal}} |

---

## VIII. Affiliate Services

{{affiliate_services}}

---

## IX. Risk Factors

Investment in the Fund is speculative and involves a high degree of risk. Risks include, without limitation: loss of entire investment; illiquidity; lack of public market; reliance on Key Persons; valuation uncertainty; concentration risk; regulatory risk; tax risk; conflicts of interest including those described under Material Conflicts ({{material_conflicts}}); ERISA and benefit-plan risks; and the risks specific to the Fund's target sectors and geographies. Prospective investors should consult their own legal, tax and financial advisers before subscribing.

---

## X. Subscription Process

Prospective investors must (i) execute a Subscription Agreement, (ii) complete the Accredited Investor Certification, and (iii) deliver such other information as the General Partner may reasonably require. The General Partner reserves the right to reject any subscription in its sole discretion.

**Fund Counsel:** {{fund_counsel}}
**Fund Administrator:** {{fund_administrator}}
**Notice Cutoff:** {{notice_cutoff_time}} Eastern.

---

*This PPM does not constitute an offer to sell or a solicitation of an offer to buy in any jurisdiction where such offer or solicitation would be unlawful. Past performance is not indicative of future results.*`,
}

// ─── catalogue + lookup ────────────────────────────────────────────────-

export const LEGAL_TEMPLATES: LegalTemplate[] = [
  FM_AUTHORIZATION,
  FM_CERT_OF_FORMATION,
  FM_INITIAL_LLCA,
  IMA,
  GP_AUTHORIZATION,
  GP_CERT_OF_FORMATION,
  GP_INITIAL_LLCA,
  CERT_OF_LP,
  INITIAL_LPA,
  AIC,
  PPM,
  AR_LPA,
  SUBSCRIPTION_AGREEMENT,
]

export const TEMPLATE_BY_DOC_KEY: Record<string, LegalTemplate> =
  Object.fromEntries(LEGAL_TEMPLATES.map((t) => [t.docKey, t]))

export function getTemplate(docKey: string): LegalTemplate | null {
  return TEMPLATE_BY_DOC_KEY[docKey] ?? null
}

/** Set of every field_key referenced by at least one template — used by
 *  the renderer to highlight which inputs are still TBD. */
export function fieldsReferencedByTemplate(docKey: string): string[] {
  const t = TEMPLATE_BY_DOC_KEY[docKey]
  if (!t) return []
  const slots = new Set<string>()
  const re = /\{\{([a-z0-9_]+)(?:\.[a-z0-9_]+)?\}\}/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(t.body)) !== null) slots.add(m[1])
  return Array.from(slots)
}

export const TEMPLATE_COUNT = LEGAL_TEMPLATES.length
if (TEMPLATE_COUNT !== 13) {
  console.warn(`[legal-templates] Expected 13 templates, got ${TEMPLATE_COUNT}`)
}
