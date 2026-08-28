/**
 * LinkedIn action executor.
 *
 * Performs a single outbound action (connect request or message) by injecting a
 * self-contained routine into a LinkedIn tab. Selectors come from the server's
 * remote selector map (getSelectors) so LinkedIn DOM changes are a server edit,
 * not a Web Store re-publish; inline defaults are the fallback when the map isn't
 * cached yet. The injected routines receive their selector object as an argument.
 *
 * Injected functions run in the page's ISOLATED world and must be fully
 * self-contained — no closure over module scope.
 */
import { getSelectors } from "./selectors";

export interface ExecResult {
  ok: boolean;
  detail?: Record<string, unknown>;
  error?: string;
  friction?: "captcha" | "restricted" | "limit" | "unknown";
}

type ConnectSel = {
  connectButton: string; connectButton_re: string;
  moreButton: string; moreButton_re: string; connectInMenu: string;
  addNoteButton: string; addNoteButton_re: string; noteTextarea: string;
  sendButton: string; sendButton_re: string; sendWithoutNote_re: string; alreadyConnected_re: string;
  frictionUrl: string;
};
type MessageSel = {
  composer: string; messageButton: string; messageButton_re: string;
  sendButton: string; sendButton_re: string; frictionUrl: string;
};

const CONNECT_FALLBACK: ConnectSel = {
  connectButton: "button", connectButton_re: "^(connect|vernetzen|se connecter|conectar)$",
  moreButton: "button", moreButton_re: "^(more|mehr|plus|más)", connectInMenu: "div[role='button'], button, span",
  addNoteButton: "button", addNoteButton_re: "add a note|hinweis hinzufügen|ajouter une note",
  noteTextarea: "textarea[name='message'], textarea#custom-message, textarea",
  sendButton: "button", sendButton_re: "^(send|send now|send invitation|senden|einladung senden|envoyer)",
  sendWithoutNote_re: "send without a note|ohne nachricht senden|envoyer sans note",
  alreadyConnected_re: "^(pending|message|nachricht)", frictionUrl: "checkpoint/challenge|/authwall",
};
const MESSAGE_FALLBACK: MessageSel = {
  composer: "div.msg-form__contenteditable[contenteditable='true'], div[role='textbox'][contenteditable='true']",
  messageButton: "button, a", messageButton_re: "^(message|nachricht senden|nachricht|message .*|envoyer un message)",
  sendButton: "button", sendButton_re: "^(send|senden|envoyer)$", frictionUrl: "checkpoint/challenge|/authwall",
};

async function runInTab<A extends any[], R>(tabId: number, fn: (...args: A) => R | Promise<R>, args: A): Promise<R> {
  const results = await chrome.scripting.executeScript({ target: { tabId }, world: "ISOLATED", func: fn as any, args: args as any });
  return results[0]?.result as R;
}

/** Merge the fetched connect selectors over the fallback. */
async function connectSel(): Promise<ConnectSel> {
  const m = await getSelectors().catch(() => null);
  const c = m?.connect || {};
  return { ...CONNECT_FALLBACK, ...c, frictionUrl: m?.friction?.urlPattern || CONNECT_FALLBACK.frictionUrl };
}
async function messageSel(): Promise<MessageSel> {
  const m = await getSelectors().catch(() => null);
  const c = m?.message || {};
  return { ...MESSAGE_FALLBACK, ...c, frictionUrl: m?.friction?.urlPattern || MESSAGE_FALLBACK.frictionUrl };
}

// ── Injected routines ─────────────────────────────────────────────────────────

function connectRoutine(note: string | null, sel: ConnectSel): Promise<ExecResult> {
  return (async (): Promise<ExecResult> => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const jitter = (min: number, max: number) => sleep(min + Math.random() * (max - min));
    const rx = (s: string) => new RegExp(s, "i");
    const visible = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).offsetParent !== null;
    const byText = (root: ParentNode, selector: string, re: RegExp): HTMLElement | null => {
      for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
        const label = (el.getAttribute("aria-label") || el.textContent || "").trim();
        if (re.test(label) && visible(el)) return el;
      }
      return null;
    };
    const waitFor = async (find: () => HTMLElement | null, timeoutMs = 6000): Promise<HTMLElement | null> => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) { const el = find(); if (el) return el; await sleep(250); }
      return null;
    };

    if (rx(sel.frictionUrl).test(location.href)) return { ok: false, friction: "captcha", error: "LinkedIn checkpoint/challenge page" };

    let connectBtn = byText(document, sel.connectButton, rx(sel.connectButton_re));
    if (!connectBtn) {
      const moreBtn = byText(document, sel.moreButton, rx(sel.moreButton_re));
      if (moreBtn) { moreBtn.click(); await jitter(600, 1200); connectBtn = byText(document, sel.connectInMenu, rx(sel.connectButton_re)) || null; }
    }
    if (!connectBtn) {
      if (byText(document, "button, span", rx(sel.alreadyConnected_re))) return { ok: false, error: "Already connected or invite pending" };
      return { ok: false, error: "Connect button not found" };
    }
    connectBtn.click();
    await jitter(700, 1400);

    if (note && note.trim()) {
      const addNote = await waitFor(() => byText(document, sel.addNoteButton, rx(sel.addNoteButton_re)), 3000);
      if (addNote) {
        addNote.click(); await jitter(500, 1000);
        const textarea = document.querySelector<HTMLTextAreaElement>(sel.noteTextarea);
        if (textarea && visible(textarea)) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
          setter?.call(textarea, note.slice(0, 300));
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          await jitter(400, 900);
        }
      }
    }
    const sendBtn =
      (await waitFor(() => byText(document, sel.sendButton, rx(sel.sendButton_re)), 3000)) ||
      byText(document, sel.sendButton, rx(sel.sendWithoutNote_re));
    if (!sendBtn) return { ok: false, error: "Send button not found in invite modal" };
    sendBtn.click();
    await jitter(800, 1500);
    return { ok: true, detail: { invited: true, withNote: !!(note && note.trim()) } };
  })();
}

function messageRoutine(message: string, sel: MessageSel): Promise<ExecResult> {
  return (async (): Promise<ExecResult> => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const jitter = (min: number, max: number) => sleep(min + Math.random() * (max - min));
    const rx = (s: string) => new RegExp(s, "i");
    const visible = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).offsetParent !== null;
    const byText = (root: ParentNode, selector: string, re: RegExp): HTMLElement | null => {
      for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
        const label = (el.getAttribute("aria-label") || el.textContent || "").trim();
        if (re.test(label) && visible(el)) return el;
      }
      return null;
    };
    const waitFor = async (find: () => HTMLElement | null, timeoutMs = 6000): Promise<HTMLElement | null> => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) { const el = find(); if (el) return el; await sleep(250); }
      return null;
    };

    if (rx(sel.frictionUrl).test(location.href)) return { ok: false, friction: "captcha", error: "LinkedIn checkpoint/challenge page" };
    if (!message || !message.trim()) return { ok: false, error: "Empty message" };

    let box = document.querySelector<HTMLElement>(sel.composer);
    if (!box || !visible(box)) {
      const msgBtn = byText(document, sel.messageButton, rx(sel.messageButton_re));
      if (!msgBtn) return { ok: false, error: "Message button not found" };
      msgBtn.click();
      box = await waitFor(() => document.querySelector<HTMLElement>(sel.composer), 6000);
    }
    if (!box || !visible(box)) return { ok: false, error: "Message composer did not open" };

    box.focus();
    await jitter(300, 700);
    document.execCommand("insertText", false, message);
    box.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await jitter(500, 1100);

    const sendBtn = await waitFor(() => byText(document, sel.sendButton, rx(sel.sendButton_re)) as HTMLElement | null, 3000);
    if (!sendBtn) return { ok: false, error: "Send button not found / disabled" };
    if ((sendBtn as HTMLButtonElement).disabled) return { ok: false, error: "Send button disabled (empty draft?)" };
    sendBtn.click();
    await jitter(700, 1400);
    return { ok: true, detail: { messaged: true, chars: message.length } };
  })();
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function executeConnect(tabId: number, note: string | null): Promise<ExecResult> {
  try { return await runInTab(tabId, connectRoutine, [note, await connectSel()]); }
  catch (e: any) { return { ok: false, error: e?.message || "inject failed" }; }
}

export async function executeMessage(tabId: number, message: string): Promise<ExecResult> {
  try { return await runInTab(tabId, messageRoutine, [message, await messageSel()]); }
  catch (e: any) { return { ok: false, error: e?.message || "inject failed" }; }
}
