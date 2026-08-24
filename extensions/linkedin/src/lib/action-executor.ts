/**
 * LinkedIn action executor.
 *
 * Performs a single outbound action (connect request or message) by injecting
 * a self-contained routine into a LinkedIn tab — the same tab-then-executeScript
 * shape the crawl worker uses to grab HTML. The injected routine polls for the
 * relevant UI, clicks/types like a person would, and returns a structured result.
 *
 * IMPORTANT: LinkedIn's DOM + copy change often and are localized. The selectors
 * below are best-effort with several fallbacks; they are the piece most likely
 * to need tuning against live LinkedIn. Everything else in the pipeline
 * (queue → approve → claim → report) is stable regardless of these details.
 *
 * Injected functions run in the page's ISOLATED world (full DOM access, no page
 * globals). They must be fully self-contained — no closure over module scope.
 */

export interface ExecResult {
  ok: boolean;
  detail?: Record<string, unknown>;
  error?: string;
  friction?: "captcha" | "restricted" | "limit" | "unknown";
}

/** Inject `fn` into a tab and return its result (or a structured failure). */
async function runInTab<A extends any[], R>(
  tabId: number,
  fn: (...args: A) => R | Promise<R>,
  args: A,
): Promise<R> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    func: fn as any,
    args: args as any,
  });
  return results[0]?.result as R;
}

// ── Connect request ──────────────────────────────────────────────────────────

/** Injected: send a connection request on the currently-open profile page. */
function connectRoutine(note: string | null): Promise<ExecResult> {
  return (async (): Promise<ExecResult> => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const jitter = (min: number, max: number) => sleep(min + Math.random() * (max - min));
    const visible = (el: Element | null): el is HTMLElement =>
      !!el && (el as HTMLElement).offsetParent !== null;
    const byText = (root: ParentNode, selector: string, re: RegExp): HTMLElement | null => {
      for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
        const label = (el.getAttribute("aria-label") || el.textContent || "").trim();
        if (re.test(label) && visible(el)) return el;
      }
      return null;
    };
    const waitFor = async (find: () => HTMLElement | null, timeoutMs = 6000): Promise<HTMLElement | null> => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const el = find();
        if (el) return el;
        await sleep(250);
      }
      return null;
    };

    // Friction: LinkedIn security checkpoint / captcha.
    if (/checkpoint\/challenge|\/authwall/.test(location.href)) {
      return { ok: false, friction: "captcha", error: "LinkedIn checkpoint/challenge page" };
    }

    const CONNECT_RE = /^(connect|vernetzen|se connecter|conectar)$/i;
    const MORE_RE = /^(more|mehr|plus|más)/i;

    // 1) Direct top-card Connect button.
    let connectBtn = byText(document, "button", CONNECT_RE);

    // 2) Fallback: open the "More" overflow, then Connect from the menu.
    if (!connectBtn) {
      const moreBtn = byText(document, "button", MORE_RE);
      if (moreBtn) {
        moreBtn.click();
        await jitter(600, 1200);
        connectBtn =
          byText(document, "div[role='button'], button, span", CONNECT_RE) || null;
      }
    }
    if (!connectBtn) {
      // Already connected / pending?
      if (byText(document, "button, span", /^(pending|message|nachricht)/i)) {
        return { ok: false, error: "Already connected or invite pending" };
      }
      return { ok: false, error: "Connect button not found" };
    }

    connectBtn.click();
    await jitter(700, 1400);

    // Modal: "Add a note" / "Send without a note".
    if (note && note.trim()) {
      const addNote = await waitFor(() => byText(document, "button", /add a note|hinweis hinzufügen|ajouter une note/i), 3000);
      if (addNote) {
        addNote.click();
        await jitter(500, 1000);
        const textarea = document.querySelector<HTMLTextAreaElement>("textarea[name='message'], textarea#custom-message, textarea");
        if (textarea && visible(textarea)) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
          setter?.call(textarea, note.slice(0, 300));
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          await jitter(400, 900);
        }
      }
    }

    const sendBtn =
      (await waitFor(() => byText(document, "button", /^(send|send now|send invitation|senden|einladung senden|envoyer)/i), 3000)) ||
      byText(document, "button", /send without a note|ohne nachricht senden|envoyer sans note/i);
    if (!sendBtn) return { ok: false, error: "Send button not found in invite modal" };
    sendBtn.click();
    await jitter(800, 1500);

    return { ok: true, detail: { invited: true, withNote: !!(note && note.trim()) } };
  })();
}

// ── Message ──────────────────────────────────────────────────────────────────

/** Injected: send a DM from the currently-open profile/conversation page. */
function messageRoutine(message: string): Promise<ExecResult> {
  return (async (): Promise<ExecResult> => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const jitter = (min: number, max: number) => sleep(min + Math.random() * (max - min));
    const visible = (el: Element | null): el is HTMLElement =>
      !!el && (el as HTMLElement).offsetParent !== null;
    const byText = (root: ParentNode, selector: string, re: RegExp): HTMLElement | null => {
      for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
        const label = (el.getAttribute("aria-label") || el.textContent || "").trim();
        if (re.test(label) && visible(el)) return el;
      }
      return null;
    };
    const waitFor = async (find: () => HTMLElement | null, timeoutMs = 6000): Promise<HTMLElement | null> => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const el = find();
        if (el) return el;
        await sleep(250);
      }
      return null;
    };

    if (/checkpoint\/challenge|\/authwall/.test(location.href)) {
      return { ok: false, friction: "captcha", error: "LinkedIn checkpoint/challenge page" };
    }
    if (!message || !message.trim()) return { ok: false, error: "Empty message" };

    // Open the message composer (profile "Message" button) if not already open.
    let box = document.querySelector<HTMLElement>("div.msg-form__contenteditable[contenteditable='true'], div[role='textbox'][contenteditable='true']");
    if (!box || !visible(box)) {
      const msgBtn = byText(document, "button, a", /^(message|nachricht senden|nachricht|message .*|envoyer un message)/i);
      if (!msgBtn) return { ok: false, error: "Message button not found" };
      msgBtn.click();
      box = await waitFor(
        () => document.querySelector<HTMLElement>("div.msg-form__contenteditable[contenteditable='true'], div[role='textbox'][contenteditable='true']"),
        6000,
      );
    }
    if (!box || !visible(box)) return { ok: false, error: "Message composer did not open" };

    // Focus + insert text as a person would (execCommand keeps LinkedIn's
    // draft state + Send button in sync better than setting textContent).
    box.focus();
    await jitter(300, 700);
    document.execCommand("insertText", false, message);
    box.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await jitter(500, 1100);

    const sendBtn = await waitFor(
      () => byText(document, "button", /^(send|senden|envoyer)$/i) as HTMLElement | null,
      3000,
    );
    if (!sendBtn) return { ok: false, error: "Send button not found / disabled" };
    if ((sendBtn as HTMLButtonElement).disabled) return { ok: false, error: "Send button disabled (empty draft?)" };
    sendBtn.click();
    await jitter(700, 1400);

    return { ok: true, detail: { messaged: true, chars: message.length } };
  })();
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function executeConnect(tabId: number, note: string | null): Promise<ExecResult> {
  try {
    return await runInTab(tabId, connectRoutine, [note]);
  } catch (e: any) {
    return { ok: false, error: e?.message || "inject failed" };
  }
}

export async function executeMessage(tabId: number, message: string): Promise<ExecResult> {
  try {
    return await runInTab(tabId, messageRoutine, [message]);
  } catch (e: any) {
    return { ok: false, error: e?.message || "inject failed" };
  }
}
