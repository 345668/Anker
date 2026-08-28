/**
 * LinkedIn DOM selector map — served to the extension at runtime.
 *
 * The extension's executors/scrapers pull these instead of hard-coding LinkedIn
 * selectors, so when LinkedIn changes its DOM we edit this server config (a
 * deploy) instead of re-publishing + waiting on Web Store review. Bump `version`
 * whenever the map changes; the extension caches by version.
 *
 * Values are CSS selectors, or (for the *_re fields) case-insensitive text/aria
 * regex sources matched against an element's aria-label or textContent.
 */
import "server-only"

export const SELECTOR_VERSION = "2026-08-26.1"

export const DEFAULT_SELECTORS = {
  version: SELECTOR_VERSION,
  // Profile page — connect flow.
  connect: {
    connectButton: "button",
    connectButton_re: "^(connect|vernetzen|se connecter|conectar)$",
    moreButton: "button",
    moreButton_re: "^(more|mehr|plus|más)",
    connectInMenu: "div[role='button'], button, span",
    addNoteButton: "button",
    addNoteButton_re: "add a note|hinweis hinzufügen|ajouter une note",
    noteTextarea: "textarea[name='message'], textarea#custom-message, textarea",
    sendButton: "button",
    sendButton_re: "^(send|send now|send invitation|senden|einladung senden|envoyer)",
    sendWithoutNote_re: "send without a note|ohne nachricht senden|envoyer sans note",
    alreadyConnected_re: "^(pending|message|nachricht)",
  },
  // Messaging.
  message: {
    composer: "div.msg-form__contenteditable[contenteditable='true'], div[role='textbox'][contenteditable='true']",
    messageButton: "button, a",
    messageButton_re: "^(message|nachricht senden|nachricht|message .*|envoyer un message)",
    sendButton: "button",
    sendButton_re: "^(send|senden|envoyer)$",
  },
  // Inbox list scrape.
  inbox: {
    listItem: "li.msg-conversation-listitem, .msg-conversations-container__convo-item",
    threadLink: "a.msg-conversation-listitem__link, a[href*='/messaging/thread/']",
    participantName: ".msg-conversation-listitem__participant-names, .msg-conversation-card__participant-names",
    snippet: ".msg-conversation-card__message-snippet, .msg-conversation-listitem__message-snippet-body",
    time: "time, .msg-conversation-listitem__time-stamp",
    unread: ".notification-badge--show, .msg-conversation-card__unread-count, [class*='unread']",
  },
  // Sent-invitations page — pending invites (accepted = no longer here).
  invites: {
    listItem: "li.invitation-card, .mn-invitation-list li, [componentkey*='invitation']",
    profileLink: "a[href*='/in/']",
  },
  // Friction detection (checkpoint / captcha).
  friction: {
    urlPattern: "checkpoint/challenge|/authwall",
  },
} as const

export type SelectorMap = typeof DEFAULT_SELECTORS

/**
 * Resolve the selector map to serve. Defaults for now; a later pass can merge an
 * override from system_settings so selectors are hot-patchable without a deploy.
 */
export async function getSelectorConfig(): Promise<SelectorMap> {
  return DEFAULT_SELECTORS
}
