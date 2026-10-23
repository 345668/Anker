# 11. Key management and rotation: runbook

*Closes the gap "the encryption key has no rotation procedure" (question 20). Built and tested: `lib/db/secrets.ts` (key ring), `lib/db/key-rotation.ts`, `scripts/oneshot/rotate-keys.ts`. Not yet run on production data: there are no investor files yet.*

## What is encrypted, and how
Identity documents (passport), message attachments and the fund's verification files are encrypted by the application with AES-256-GCM before they reach the database; so are a few personal-data text fields (who owns an entity, a tax number) and some stored secrets. One environment variable, `SECRET_KEY`, is the **current** key; the actual 256-bit key is derived from it. New files carry a short **key id** in their header, so the right key is chosen without guessing; files and values written before this change are still read (the current key, then each previous one).

## Rotating the key
1. **Generate** a new secret (at least 32 random bytes, for example `openssl rand -base64 48`). Keep it in your password manager before using it.
2. **Deploy with both keys.** In the hosting environment set `SECRET_KEY_PREVIOUS` to the old secret (several old secrets may be listed, newest first, comma separated) and `SECRET_KEY` to the new one. After this deploy, nothing becomes unreadable; new writes use the new key.
3. **Dry run:** `npx tsx scripts/oneshot/rotate-keys.ts` with the same two variables and the production database URL in your shell. It prints, per table and column, how many rows would be re-encrypted, which are already current and which cannot be read. Nothing changes.
4. **Rotate:** `npx tsx scripts/oneshot/rotate-keys.ts --apply --yes-production`. Each file is decrypted, its SHA-256 checked against the stored fingerprint, re-encrypted with the new key, read back, and only then written (a row that fails a check is left alone and reported). It is safe to stop and run again.
5. **Verify:** run the dry run again: every line should say "rotated 0" and "failed 0". Open a few documents.
6. **Retire the old key** only when step 5 is clean **and** the other places that use `SECRET_KEY` have been dealt with (below). Then remove `SECRET_KEY_PREVIOUS` and deploy.

## What the job covers, and what it does not
Covered: `passport_documents`, `kyc_document_files`, `relationship_attachments` (files); `lp_verification.owners_enc`, `lp_onboarding_details.tax_id_enc`, `telegram_pending.text_enc`, `telegram_updates.payload_enc`, `telegram_bots.token_enc` (text). **Not covered, but still readable through the previous key:** API keys saved in workspace settings and the privacy-request store. Re-save them (or extend `TEXT_TARGETS` in `lib/db/key-rotation.ts`) before step 6. A separate system (`CONFIG_ENC_KEY`, for runtime configuration) has its own key and is not part of this procedure.

## If a key may have leaked
Treat it as an incident (see the breach runbook in `06`): rotate immediately as above, then assess which data the old key protected and whether anyone could have obtained the ciphertext as well; the ciphertext is in the database, so a key leak alone, without the database, exposes nothing.

## What remains open
The key lives in an environment variable, not in a key-management service; rotation is manual. Counsel and the founder can decide whether that is acceptable for launch (question 20).
