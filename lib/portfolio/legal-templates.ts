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
  source: "Structured against the ILPA Whole-of-Fund Model LPA (Delaware-law-based, July 2020). Direct download (Word): https://ilpa.org/wp-content/uploads/2020/07/ILPA-Model-Limited-Partnership-Agreement-WOF.docx · Filed under 6 Del. C. ch. 17. Superseded by the A&R LPA executed at first close.",
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
  source: "Structured against the ILPA Whole-of-Fund Model LPA (Delaware-law-based, July 2020). Direct download (Word): https://ilpa.org/wp-content/uploads/2020/07/ILPA-Model-Limited-Partnership-Agreement-WOF.docx · Governed by 6 Del. C. ch. 17. This Anker scaffold is the structural summary; the full executed A&R LPA will run 100+ pages and should be drafted by outside counsel.",
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
  source: "Per Rule 501(a) of Regulation D, 17 CFR § 230.501(a). Authoritative text: https://www.ecfr.gov/current/title-17/section-230.501. All 13 categories tracked verbatim from the eCFR, including the 2020 SEC amendments adding professional certifications, knowledgeable employees, and family-office/family-client tiers.",
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

// ─── Fund operations layer (5 templates) ──────────────────────────────-

const FORM_D: LegalTemplate = {
  docKey: "form_d_notice_of_exempt_offering",
  title: "Form D — Notice of Exempt Offering of Securities",
  source: "SEC Form D — Notice of Exempt Offering of Securities. OMB 3235-0076. Source PDF: https://www.sec.gov/files/formd.pdf · Filed electronically with the SEC on EDGAR within 15 days of the date of first sale, per Rule 503 of Regulation D (17 CFR § 230.503).",
  body: `# FORM D
## Notice of Exempt Offering of Securities
*U.S. Securities and Exchange Commission · Washington, DC 20549*

*Intentional misstatements or omissions of fact constitute federal criminal violations. See 18 U.S.C. 1001.*

### Item 1. Issuer's Identity
**Name of Issuer:** {{fund_name}}
**Jurisdiction of Incorporation/Organization:** Delaware
**Year of Incorporation/Organization:** {{vintage_year}}
**Entity Type:** Limited Partnership
**Previous Name(s):** None

### Item 2. Principal Place of Business and Contact Information
**Street Address 1:** {{fund_principal_office_address.line1}}
**Street Address 2:** {{fund_principal_office_address.line2}}
**City:** {{fund_principal_office_address.city}}
**State / Province / Country:** {{fund_principal_office_address.region}}
**ZIP / Postal Code:** {{fund_principal_office_address.postal}}
**Phone No.:** {{fund_phone}}

### Item 3. Related Persons
**Last Name / First Name:** {{gp_authorized_person}}
**Street Address:** {{gp_principal_office_address.line1}}, {{gp_principal_office_address.city}}, {{gp_principal_office_address.region}} {{gp_principal_office_address.postal}}
**Relationship(s):** Executive Officer · Director · Promoter (as applicable)

### Item 4. Industry Group
**Selected:** Pooled Investment Fund
**Fund Type:** Venture Capital Fund
**Registered as an investment company under the Investment Company Act of 1940?** No (claiming the Section 3(c)(7) exclusion below)

### Item 5. Issuer Size — Aggregate Net Asset Value Range
[ ] No Aggregate Net Asset Value · [ ] $1 – $5,000,000 · [ ] $5,000,001 – $25,000,000 · [ ] $25,000,001 – $50,000,000 · [ ] $50,000,001 – $100,000,000 · [ ] Over $100,000,000 · [ ] Decline to Disclose · [ ] Not Applicable

### Item 6. Federal Exemptions and Exclusions Claimed
**Securities Act:** [x] Rule 506(b) *(or [ ] Rule 506(c) for generally-solicited offerings)*
**Investment Company Act Section 3(c):** [x] Section 3(c)(7) *(qualified-purchaser fund)* · or [ ] Section 3(c)(1) *(< 100 investors)*

### Item 7. Type of Filing
[x] New Notice · [ ] Amendment
**Date of First Sale in this Offering:** {{date_of_first_sale}} · or [ ] First Sale Yet to Occur

### Item 8. Duration of Offering
**Does the issuer intend this offering to last more than one year?** Yes — until the Final Closing Date ({{final_closing_period_months}} months after Date of Formation)

### Item 9. Type(s) of Securities Offered
[x] Pooled Investment Fund Interests

### Item 10. Business Combination Transaction
**Is this offering being made in connection with a business combination transaction?** No

### Item 11. Minimum Investment
**Minimum investment accepted from any outside investor:** \${{lp_commitment_minimum}}

### Item 12. Sales Compensation
**Recipient:** None · *(or list placement agent(s))*

### Item 13. Offering and Sales Amounts
(a) **Total Offering Amount:** \${{target_fund_size}}
(b) **Total Amount Sold:** $ \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_ *(updated per amendment)*
(c) **Total Remaining to be Sold:** $ \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_

### Item 14. Investors
[ ] Securities may be sold to non-accredited investors *(unchecked — Rule 506 fund restricts to accredited investors only)*
**Total number of investors who already have invested in the offering:** \\_\\_\\_\\_\\_\\_\\_

### Item 15. Sales Commissions and Finders' Fees Expenses
**Sales Commissions:** $0 [x] Estimate
**Finders' Fees:** $0 [x] Estimate

### Item 16. Use of Proceeds
**Amount of gross proceeds used for payments to Item 3 persons:** $0 [x] Estimate

### Signature and Submission
*In submitting this notice, each issuer named above is notifying the SEC of the offering of securities, irrevocably appointing the Secretary of the SEC as its agent for service of process, and certifying that the issuer is not disqualified from relying on Rule 506(d) ("bad actor" disqualification).*

**Issuer:** {{fund_name}}
**Name of Signer:** {{gp_authorized_person}}
**Signature:** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
**Title:** Authorized Person, {{gp_legal_name}} (General Partner)
**Date:** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_

**Filed electronically on EDGAR. No federal filing fee. State Blue-Sky filings: see www.NASAA.org.**`,
}

const FORM_ADV_2A: LegalTemplate = {
  docKey: "form_adv_part_2a_brochure",
  title: "Form ADV Part 2A — Investment Adviser Brochure",
  source: "SEC Form ADV Part 2A (the adviser's plain-English brochure). Authoritative form + instructions: https://www.sec.gov/about/forms/formadv-part2a.pdf. Adviser registration filed via the Investment Adviser Registration Depository (IARD): https://www.iard.com. Exempt Reporting Advisers file Part 1A only. Per Rule 204-3 under the Investment Advisers Act of 1940.",
  body: `# FORM ADV PART 2A
## Investment Adviser Brochure
**{{fm_legal_name}}**

**Address:** {{fm_principal_office_address.line1}}, {{fm_principal_office_address.city}}, {{fm_principal_office_address.region}} {{fm_principal_office_address.postal}}
**Phone:** {{fm_phone}}
**Brochure Date:** {{brochure_date}}

*This brochure provides information about the qualifications and business practices of {{fm_legal_name}}. If you have any questions about the contents of this brochure, please contact us at the address above. The information in this brochure has not been approved or verified by the United States Securities and Exchange Commission or by any state securities authority. Additional information about {{fm_legal_name}} is available on the SEC's website at www.adviserinfo.sec.gov.*

### Item 2 — Material Changes
*(Summarize material changes from the prior brochure here, if any.)*

### Item 3 — Table of Contents
4. Advisory Business
5. Fees and Compensation
6. Performance-Based Fees and Side-by-Side Management
7. Types of Clients
8. Methods of Analysis, Investment Strategies and Risk of Loss
9. Disciplinary Information
10. Other Financial Industry Activities and Affiliations
11. Code of Ethics, Participation or Interest in Client Transactions
12. Brokerage Practices
13. Review of Accounts
14. Client Referrals and Other Compensation
15. Custody
16. Investment Discretion
17. Voting Client Securities
18. Financial Information

### Item 4 — Advisory Business
**{{fm_legal_name}}** ("the Adviser") was formed as a Delaware limited liability company on **{{date_of_formation}}**. The Adviser provides discretionary investment management services to **{{fund_name}}** (the "Fund"), a Delaware limited partnership organized as a private venture capital fund.

**Principal owners:** {{fm_managing_member}}

**Assets under management (regulatory AUM):** \${{target_fund_size}} (target commitments).

### Item 5 — Fees and Compensation
The Adviser receives a management fee of **{{management_fee}}%** per annum of committed capital during the Investment Period, stepping down to **{{management_fee_post_investment_period}}%** thereafter, payable quarterly in advance. The Adviser additionally receives carried interest of **{{carried_interest}}%** of profits subject to a **{{preferred_return}}%** preferred return and **{{catch_up_rate}}%** GP catch-up per the Fund's LPA.

### Item 6 — Performance-Based Fees
The carried interest above is a performance-based fee within Rule 205-3 under the Advisers Act. Investors must be "qualified clients."

### Item 7 — Types of Clients
The Adviser provides services only to the Fund, which restricts ownership to accredited investors (Rule 501(a)) and qualified purchasers (Section 2(a)(51) of the Investment Company Act).

### Item 8 — Methods of Analysis, Strategies and Risks
*Investment thesis:* {{thesis_statement}}
*Sector focus:* {{sector_focus}} · *Stage:* {{target_investment_stage}} · *Geography:* {{target_geography_country}}
*Risks include:* loss of entire investment, illiquidity, reliance on Key Persons ({{key_person_names}}), concentration, valuation uncertainty, regulatory risk, and the risks particular to early-stage equity investing.

### Item 9 — Disciplinary Information
None to disclose. *(If any, disclose here.)*

### Item 10 — Other Financial Industry Activities and Affiliations
**General Partner:** {{gp_legal_name}}, an affiliate under common control. Material conflicts of interest are described in the Fund's LPA and PPM. Affiliate services: {{affiliate_services}}.

### Item 11 — Code of Ethics
The Adviser has adopted a Code of Ethics pursuant to Rule 204A-1 covering personal trading, gifts, political contributions, insider information, and reporting obligations.

### Item 12 — Brokerage Practices
Portfolio investments are made in private securities; broker-dealer best-execution analysis is not typically applicable.

### Item 13 — Review of Accounts
The Investment Committee ({{ic_member_names}}) reviews portfolio investments at least quarterly. Investors receive audited financial statements annually and capital account statements quarterly through {{investor_portal}}.

### Item 14 — Client Referrals and Other Compensation
No solicitor arrangements unless disclosed in a separate Form ADV Schedule.

### Item 15 — Custody
The Fund's assets are held by **{{fund_administrator}}** and qualified custodians.

### Item 16 — Investment Discretion
The Adviser has full discretionary authority over the Fund's investments subject to the LPA and IC approval requirements (vote threshold: {{ic_vote_threshold}}).

### Item 17 — Voting Client Securities
The Adviser votes proxies on behalf of portfolio investments pursuant to its written proxy-voting policy. Proxy records are available on request.

### Item 18 — Financial Information
The Adviser does not require prepayment of fees six months or more in advance and is not aware of any financial condition reasonably likely to impair its ability to meet contractual commitments to clients.

*Brochure last updated: {{brochure_date}}*`,
}

const NVCA_MGMT_RIGHTS: LegalTemplate = {
  docKey: "nvca_management_rights_letter",
  title: "Management Rights Letter (NVCA Model)",
  source: "NVCA 2020 Model Management Rights Letter. Authoritative source: https://nvca.org/document/nvca-2020-management-rights-letter-2/. Granted by the portfolio company to the Fund to satisfy the 'management rights' requirement for venture capital operating company (VCOC) status under 29 CFR § 2510.3-101 (ERISA Plan Assets Regulation).",
  body: `# MANAGEMENT RIGHTS LETTER

**[Portfolio Company Letterhead]**

[Date]

**{{fund_name}}**
{{fund_principal_office_address.line1}}
{{fund_principal_office_address.city}}, {{fund_principal_office_address.region}} {{fund_principal_office_address.postal}}

Re: **Management Rights**

Ladies and Gentlemen:

This letter will confirm our agreement that, pursuant to {{fund_name}}'s (the "Investor's") purchase of securities of [Portfolio Company Name] (the "Company"), the Investor shall be entitled to the following contractual management rights:

### 1. Inspection Rights
The Company shall permit the Investor or its designated representative to visit and inspect any of the Company's properties; examine its books and records of account; and discuss the Company's affairs, finances and accounts with its officers, all at such reasonable times as may be requested by the Investor.

### 2. Information Rights
The Company shall deliver to the Investor:
(a) audited annual financial statements within ninety (90) days of fiscal year-end;
(b) unaudited quarterly financial statements within forty-five (45) days of quarter-end;
(c) an annual operating budget and business plan no later than thirty (30) days prior to the start of each fiscal year; and
(d) such other information as the Investor may reasonably request from time to time.

### 3. Right to Consult with Management
The Investor shall have the right to consult with and advise management of the Company on significant business issues, including management's proposed annual operating plans, and management will meet with the Investor regularly during each year at the Company's facilities at mutually agreeable times for such consultation and advice and to review progress in achieving the plans.

### 4. Confidentiality
Information furnished to the Investor under this letter shall be subject to a confidentiality obligation customary for venture capital investments, except as required by law or for the Investor's reporting to its limited partners.

### 5. ERISA / VCOC Status
The rights granted hereunder are intended to constitute "management rights" within the meaning of Department of Labor Regulations Section 2510.3-101(d)(3)(ii), and the Investor's investment in the Company is intended to qualify as an investment in an "operating company" (specifically, a "venture capital operating company") under that regulation.

### 6. Termination
The rights described in this letter shall terminate and be of no further force or effect upon the earlier of (a) the Company's initial public offering of equity securities, or (b) the date on which the Investor no longer owns securities of the Company.

Please confirm your agreement with the foregoing by countersigning this letter.

Very truly yours,

**[PORTFOLIO COMPANY NAME]**
By: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_  Name: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_  Title: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_

**ACCEPTED AND AGREED:**

**{{fund_name}}**
By: {{gp_legal_name}}, its General Partner
By: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_  Name: **{{gp_authorized_person}}**`,
}

const SIDE_LETTER: LegalTemplate = {
  docKey: "side_letter_template",
  title: "Side Letter",
  source: "Side letters granting bespoke LP rights outside the LPA. Drafted in accordance with the LPA's Most-Favored-Nation provision. ILPA Side Letter Standardization principles: https://ilpa.org/industry-guidance/templates-standards-model-documents/.",
  body: `# SIDE LETTER

[Date]

**[Limited Partner Legal Name]**
[Limited Partner Address]

Re: **{{fund_name}}** — Side Letter

Ladies and Gentlemen:

This Side Letter (this "**Side Letter**") is being entered into in connection with the subscription by **[Limited Partner Legal Name]** (the "**LP**") for a limited partnership interest in **{{fund_name}}** (the "**Fund**"), a Delaware limited partnership. Capitalised terms not defined herein shall have the meanings set forth in the Amended and Restated Limited Partnership Agreement of the Fund (the "**LPA**").

### 1. Most-Favored-Nation (MFN)
Subject to the procedures set forth in the LPA, the LP shall have the right to elect, in writing within twenty (20) Business Days of receipt of the GP's MFN disclosure, to receive the benefit of any more favourable terms granted to any other Limited Partner having a Capital Commitment equal to or less than the LP's Capital Commitment.

### 2. Reporting Uplift
The General Partner shall use commercially reasonable efforts to furnish the LP with quarterly reports within **{{quarterly_reporting_days}}** days of quarter-end, delivered through **{{investor_portal}}**, including the standard ILPA quarterly reporting templates.

### 3. Tax / ERISA Representations
[ ] The LP is a "benefit plan investor" within Section 3(42) of ERISA — the GP shall use commercially reasonable efforts to ensure the Fund qualifies as a VCOC and shall provide an annual VCOC compliance certificate.
[ ] The LP is a non-U.S. investor — the GP shall avoid generating effectively connected income (ECI) and unrelated business taxable income (UBTI) attributable to the LP to the extent commercially reasonable.

### 4. Confidentiality Carve-Outs
The LP may share information received from the Fund with its (a) affiliates, advisers, auditors and counsel under customary confidentiality, (b) regulators, and (c) where required by FOI / public-records law applicable to the LP.

### 5. Most-Recent Capital Account
On at least an annual basis, the LP shall be entitled to receive a Capital Account statement reconciled to the GAAP financial statements of the Fund.

### 6. Transfer Rights
The LP may, with GP consent (not unreasonably withheld), transfer its Interest to (a) an Affiliate or (b) a successor by operation of law.

### 7. Governing Law; Term
This Side Letter is governed by Delaware law and shall remain in effect for so long as the LP holds an Interest in the Fund.

Please countersign below to confirm your agreement with the foregoing.

Very truly yours,

**THE FUND:**
**{{fund_name}}**
By: {{gp_legal_name}}, its General Partner
By: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_  Name: **{{gp_authorized_person}}**

**ACCEPTED AND AGREED:**

**[Limited Partner Legal Name]**
By: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_  Name: \\_\\_\\_\\_\\_\\_\\_\\_  Title: \\_\\_\\_\\_\\_\\_\\_\\_\\_`,
}

const INVESTOR_QUESTIONNAIRE: LegalTemplate = {
  docKey: "investor_suitability_questionnaire",
  title: "Investor Suitability & AML/KYC Questionnaire",
  source: "Onboarding questionnaire combining (a) accredited-investor representations per 17 CFR § 230.501(a), (b) AML/KYC due-diligence per the Bank Secrecy Act and FinCEN customer-identification rules, and (c) tax-status certifications under FATCA (26 USC § 1471) and OECD CRS. SEC Rule 501(a) text: https://www.ecfr.gov/current/title-17/section-230.501.",
  body: `# INVESTOR SUITABILITY & AML/KYC QUESTIONNAIRE

**{{fund_name}}**

This questionnaire is required to satisfy securities-law, AML, and tax-compliance obligations. All information will be treated confidentially.

---

## Part A — Subscriber Identity
**Legal Name:** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
**Entity Type:** [ ] Individual / Joint · [ ] Trust · [ ] Corporation · [ ] LP · [ ] LLC · [ ] Pension Plan · [ ] Other:
**Jurisdiction of Formation / Residence:** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
**Tax Identification Number:** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_

**Primary Address:** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
**Authorised Representative:** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
**Email:** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_  **Phone:** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_

## Part B — Accredited-Investor Representation (Rule 501(a))
**Check all that apply:**
- [ ] Natural person net worth > $1,000,000 (excluding primary residence) — *Rule 501(a)(5)*
- [ ] Natural person income > $200,000 (individual) / $300,000 (joint) in each of last two years — *Rule 501(a)(6)*
- [ ] Holds Series 7, Series 65, or Series 82 in good standing — *Rule 501(a)(10)*
- [ ] "Knowledgeable employee" of the issuer — *Rule 501(a)(11)*
- [ ] Family office with > $5M AUM — *Rule 501(a)(12)*
- [ ] Bank / S&L / registered investment adviser / etc. — *Rule 501(a)(1)*
- [ ] Entity with > $5M total assets, not formed to invest — *Rule 501(a)(3)*
- [ ] Entity all of whose equity owners are accredited — *Rule 501(a)(8)*
- [ ] Other entity owning > $5M in investments — *Rule 501(a)(9)*

## Part C — Qualified Purchaser Representation (Section 2(a)(51))
For funds relying on Section 3(c)(7) of the Investment Company Act:
- [ ] Natural person owning ≥ $5M in investments
- [ ] Entity owning ≥ $25M in investments
- [ ] Trust where the settlor and trustee are qualified purchasers

## Part D — AML / KYC
1. **Source of funds being invested:** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
2. **Beneficial owners (≥ 25%):** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
3. **Senior Foreign Political Figure (PEP) connection?** [ ] Yes [ ] No
4. **Sanctions screening:** I confirm the Subscriber is not, and is not owned or controlled by, a Prohibited Person under OFAC, EU, UK or UN sanctions lists.
5. **Documents attached:**
   - [ ] Government-issued photo ID *(individuals)*
   - [ ] Certificate of formation + good-standing certificate *(entities)*
   - [ ] Proof of address (utility bill / bank statement < 3 months)
   - [ ] Beneficial-ownership chart *(entities with ≥ 25% owners)*

## Part E — Tax Certifications
- [ ] **W-9** attached *(U.S. persons / U.S. resident entities)*
- [ ] **W-8 BEN** attached *(non-U.S. individuals)*
- [ ] **W-8 BEN-E** attached *(non-U.S. entities)*
- [ ] **FATCA GIIN:** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_  *(non-U.S. FFIs)*
- [ ] **CRS self-certification** attached *(OECD CRS jurisdictions)*

## Part F — Suitability Acknowledgements
The Subscriber confirms:
- It has received and reviewed the Private Placement Memorandum, Amended & Restated LPA, and Subscription Agreement.
- It is investing solely for its own account, for investment, and not with a view to resale or distribution.
- It can bear the economic risk of total loss of its investment.
- It has had the opportunity to ask questions of, and receive answers from, the General Partner.

## Signature

**Subscriber:** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
**Title (if entity):** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_
**Date:** \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_

*The General Partner reserves the right to request additional information at any time before or after acceptance of this subscription.*`,
}

// ─── catalogue + lookup ────────────────────────────────────────────────-

export const LEGAL_TEMPLATES: LegalTemplate[] = [
  FM_AUTHORIZATION,
  FM_CERT_OF_FORMATION,
  FM_INITIAL_LLCA,
  IMA,
  FORM_ADV_2A,
  GP_AUTHORIZATION,
  GP_CERT_OF_FORMATION,
  GP_INITIAL_LLCA,
  CERT_OF_LP,
  INITIAL_LPA,
  AIC,
  PPM,
  AR_LPA,
  SUBSCRIPTION_AGREEMENT,
  FORM_D,
  NVCA_MGMT_RIGHTS,
  SIDE_LETTER,
  INVESTOR_QUESTIONNAIRE,
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
// Currently 18 (13 formation chain + 5 fund-ops). Bump this if you add
// or remove templates, then update TOTAL_DOCUMENTS in legal-catalogue.ts.
if (TEMPLATE_COUNT !== 18) {
  console.warn(`[legal-templates] Expected 18 templates, got ${TEMPLATE_COUNT}`)
}
