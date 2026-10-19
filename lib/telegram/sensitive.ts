/**
 * Which tools read material that stays in the app (docs/architecture/57 section 8): data room, LP records and KYC. An answer that used one of them is not sent through Telegram.
 * The LP matching follow-ups (lp_match_*) read the shared directory and the workspace's own run, not an investor's records, so they may answer there.
 */
export const SENSITIVE_TOOL = /^(dataroom_|lp_(?!match_)|kyc)/
