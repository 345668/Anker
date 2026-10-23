# 07. Wording as shipped (generated)

*Generated from `lib/investor/legal.ts`, wording version **2026-10-23**. Do not edit by hand: change the registry, raise the version and regenerate with `npx tsx scripts/legal/gen-investor-pack.ts`. A test fails if this file differs from the registry. Links are written [label](path).*

## Account and sign-up

### signup_consent
*Who sees it:* A person creating an investor account  
*Where:* Sign-up form and 'Create your investor profile' (checkbox label, required)

> I accept the [investor terms](/investor/terms) and have read the [investor privacy notice](/investor/privacy).

### signup_closed_title
*Who sees it:* Anyone  
*Where:* Investor sign-up page while the platform switch is off

> Investor sign-up is not open yet.

### signup_closed_body
*Who sees it:* Anyone  
*Where:* Investor sign-up page while the platform switch is off

> We are not accepting investor accounts yet. If you were invited to a fund, use the link you were sent.

## Listing and browsing funds

### fit_disclaimer
*Who sees it:* An investor browsing funds  
*Where:* 'Funds that fit you' page, above the list

> Funds are ranked by how well their stated focus matches what you say you look for. This is not advice and not a recommendation; check each fund yourself.

### listing_manager_notice
*Who sees it:* A fund manager  
*Where:* Fund workspace, 'Show this fund to investors'

> Investors see a fixed summary taken from your fund and your profile: never documents, your LP list, performance or your CRM. Nothing is shown until you set who may invest and switch it on.

### listing_strict_label
*Who sees it:* A fund manager  
*Where:* Listing form, beside the rules

> Do not accept requests from investors who clearly do not meet these rules

## Requests and linking records

### strict_refusal
*Who sees it:* An investor who does not meet a fund's stated rules  
*Where:* Shown instead of sending the request, when the fund has chosen to refuse such requests

> This fund only takes requests from investors who meet its stated rules, and your details do not. Check the rules on the fund page.

### request_statement
*Who sees it:* An investor asking a fund to talk  
*Where:* Fund page, above the request form

> This is an expression of interest. It is not an offer, a subscription or an obligation. The fund sees what you choose to share below, and your email address only if it accepts.

### claim_intro
*Who sees it:* An investor whose address a fund already holds  
*Where:* Profile page, 'Funds that added you'

> These funds hold a record with your email address. Link one to your profile to follow it here.

## NDA and shared documents

### nda_investor_notice
*Who sees it:* An investor  
*Where:* Conversation, before documents can be opened

> This fund asks you to accept its NDA before you can open documents. Anker records that you accepted the fund’s text; it does not review it, so read it carefully.

### nda_fund_label
*Who sees it:* A fund manager  
*Where:* Listing form, beside the NDA text box

> Text of your NDA (Anker records that an investor accepted it; it does not write or check it)

### nda_fund_refusal
*Who sees it:* A fund manager  
*Where:* Shown when the NDA requirement is on without text

> Paste the text of your NDA, or turn the NDA requirement off. Anker records that an investor accepted your text; it does not write one.

### materials_note
*Who sees it:* An investor  
*Where:* Conversation, under the documents the fund has shared

> The fund can withdraw a document at any time. A copy you have downloaded stays with you.

## Attachments

### attachment_warning
*Who sees it:* Both sides  
*Where:* Conversation, beside the file picker

> Attach up to 3 files (PDF, JPEG or PNG, 4 MB each). Only open files you expect; Anker checks them but is not a virus scanner.

### attachment_warning_scanned
*Who sees it:* Both sides  
*Where:* Conversation, beside the file picker, when the virus scanner is running

> Attach up to 3 files (PDF, JPEG or PNG, 4 MB each). Files are scanned for viruses before they are stored. Still, only open files you expect.

## Teams

### team_note
*Who sees it:* An investor team  
*Where:* Entity dashboard, Team

> People with a role here see this entity’s requests and conversations. Funds never see the team.

## The verification passport

### passport_closed
*Who sees it:* An investor  
*Where:* Shown instead of the passport while the platform has not opened it

> The passport is not open yet. Your fund will ask for any documents it needs in its own onboarding.

### passport_intro
*Who sees it:* An investor  
*Where:* Entity dashboard, Verification passport

> Keep your identity documents here once. Nothing is shared until you choose to share it with one fund; the fund still reviews and decides. Files are encrypted, and no automated system reads what they say. If virus scanning is switched on, a scanner we run ourselves checks each file for viruses and keeps nothing.

### passport_share_consent
*Who sees it:* An investor  
*Where:* Passport, beside 'Share a copy with <fund>' (shown before the button)

> By sharing, you give this one fund a copy of the documents you ticked, for its onboarding checks. The fund reviews and decides. You can take a copy back; if the fund has already checked it, the fund keeps it for its legal records and you should ask the fund to remove it.

### passport_taken_deleted
*Who sees it:* An investor  
*Where:* Passport, after taking a share back

> Taken back; the fund’s copy was deleted.

### passport_taken_retained
*Who sees it:* An investor  
*Where:* Passport, after taking a share back

> Taken back. The fund had already checked it and keeps it for its records.

### passport_taken_replaced
*Who sees it:* An investor  
*Where:* Passport, after taking a share back

> Taken back.

### passport_remove_confirm
*Who sees it:* An investor  
*Where:* Passport, confirmation before removing a document

> Remove this document? Copies you shared are taken back first.

## Discoverability

### discovery_pool_notice
*Who sees it:* A fund manager  
*Where:* Fund workspace, 'Find investors', while too few investors have opted in

> Cards are shown only once enough investors have opted in that a card cannot point to one person. That has not happened yet.

### invite_accept_note
*Who sees it:* An investor answering a fund's invitation  
*Where:* Profile page, 'Funds that would like to connect'

> If you accept, the fund sees what you tick below, and your email address.

### discoverability_owner
*Who sees it:* An investor entity's owner  
*Where:* Entity dashboard, 'Let funds find you' (shown only when the platform has opened it)

> If you switch this on, funds whose rules you meet can see a card: the kind of entity, country, your declared category, your cheque range and what you look for. Never your name, email or team. A fund can only invite you to connect; nothing else is shared unless you accept. Switch it off any time.

### discoverability_fund
*Who sees it:* A fund manager  
*Where:* Fund workspace, 'Find investors' (shown only when the platform has opened it)

> Investors who chose to be found, whose category and country meet your rules, best fit first. You see a card, never a name or address. An invitation carries no message; the investor decides whether to accept and what to share.

## The investor's rights

### export_statement
*Who sees it:* An investor  
*Where:* Profile page, 'Your data'

> Download a copy of the data Anker holds about you as a file. It lists your profile, entities, requests, conversations, meetings, passport records and activity. Your passport files are not included; download them one by one from the passport.

### erase_statement
*Who sees it:* An investor  
*Where:* Profile page, 'Your data', before the confirmation box

> Deleting your investor account removes your profile, your entities’ details, your team, your passport files and your sign-in. Funds you have dealt with keep their own records, with your name removed: the fact of the conversation, their own messages and any onboarding records they are required to keep. What you wrote in conversations is replaced by a removal notice and your attachments are deleted. If you own an entity with a team, the team loses access. This cannot be undone.

### erase_confirm_phrase
*Who sees it:* An investor  
*Where:* Profile page, 'Your data', the word to type

> ERASE

## Emails

### email_signup_code
*Who sees it:* The person emailed  
*Where:* Sent to a person starting sign-up

> Subject: Your code: {six-digit code}
> 
> Your Anker code is {six-digit code}
> 
> It is valid for 10 minutes. If you did not ask to sign up, ignore this email: nothing is created without this code.

### email_claim_code
*Who sees it:* The person emailed  
*Where:* Sent to a person linking a record a fund added

> Subject: Your code: {six-digit code}
> 
> Your Anker code is {six-digit code}
> 
> It is valid for 10 minutes. If you did not ask to link an investment, ignore this email.

### email_team_invite
*Who sees it:* The person emailed  
*Where:* Sent to an address invited to an entity's team

> Subject: You have an invitation on Anker
> 
> Someone has invited you to an investor account on Anker.
> 
> Sign in with this email address to see it and answer: {site}/investor
> 
> The invitation is valid for 14 days. If you did not expect it, ignore this email.

### email_fund_invite
*Who sees it:* The person emailed  
*Where:* Sent to an entity's owner and people who can act when a fund invites it

> Subject: You have an invitation on Anker
> 
> A fund would like to connect with one of your investing entities.
> 
> See it and decide here: {site}/investor
> 
> Nothing is shared with the fund unless you accept.

### email_new_message
*Who sees it:* The person emailed  
*Where:* Sent (at most once an hour) when a fund writes, shares a document or proposes a meeting

> Subject: You have a new message on Anker
> 
> A fund you asked to talk to has something for you.
> 
> Read it here: {site}/investor/requests
> 
> If you do not want these emails, mute the conversation there.

### email_quiet
*Who sees it:* The person emailed  
*Where:* Sent once a month to a conversation that has gone quiet

> Subject: Do you want to continue your conversation?
> 
> Your conversation with a fund has been quiet for a month. You can write again or withdraw here: {site}/investor/requests

