/**
 * Scheduled sends are switched off until they have a sender that a person approves first. docs/architecture/46 §1.3 (gap 5), §7 P0.
 *
 * The scheduler's `send_batch` action only marked messages `queued`; no worker anywhere sends a queued or scheduled message, so a scheduled send was accepted,
 * shown as "scheduled", and never went. `send_openers_nudge` created `queued` messages from one fixed text about a past event, which no tenant should be sending.
 * Both are refused at creation and, if a row already exists, failed with this explanation instead of silently doing nothing. They return as authorized, previewed
 * sends (doc 46 P1).
 */
export const SEND_ACTIONS = new Set(["send_batch", "send_openers_nudge"])
export const SCHEDULED_SENDS_OFF = "Scheduled sending is switched off while it is rebuilt so that every send is previewed and approved by a person first. Send from the campaign page; nothing was scheduled."
export const scheduledActionOff = (actionType: string): boolean => SEND_ACTIONS.has(actionType)
