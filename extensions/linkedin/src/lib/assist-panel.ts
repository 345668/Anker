/**
 * Assisted send. LinkedIn only opens its message composer for a genuine (trusted) click, so the extension
 * cannot press Message for the user. Instead the worker opens the profile in front, shows this panel with the
 * approved text, and the PERSON clicks Message, pastes and presses Send, then confirms here.
 *
 * Injected into the page's ISOLATED world: fully self-contained, no module closures.
 */
export function showAssistPanel(actionId: string, targetName: string, text: string): boolean {
  document.getElementById("anker-assist")?.remove();
  const box = document.createElement("div");
  box.id = "anker-assist";
  box.setAttribute("style", "position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:2147483647;width:min(520px,92vw);background:#fff;color:#111;border:2px solid #0a3d62;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.3);font:14px/1.45 system-ui,sans-serif;padding:14px");
  const mk = (tag: string, css: string, txt?: string) => { const e = document.createElement(tag); e.setAttribute("style", css); if (txt != null) e.textContent = txt; return e; };
  box.appendChild(mk("div", "font-weight:700;margin-bottom:4px", `Anker: send this message to ${targetName || "this person"}`));
  box.appendChild(mk("div", "color:#555;margin-bottom:8px", "Approved in Anker. Click Message on the profile, paste the text, and press Send yourself. Then confirm below."));
  const ta = mk("textarea", "width:100%;box-sizing:border-box;height:110px;border:1px solid #bbb;border-radius:6px;padding:8px;font:inherit;resize:vertical") as HTMLTextAreaElement;
  ta.readOnly = true; ta.value = text; box.appendChild(ta);
  const row = mk("div", "display:flex;gap:8px;margin-top:10px;flex-wrap:wrap");
  const btn = (label: string, css: string, on: () => void) => { const b = mk("button", "cursor:pointer;border-radius:16px;padding:7px 14px;font:inherit;border:1px solid #0a3d62;" + css, label) as HTMLButtonElement; b.type = "button"; b.addEventListener("click", on); row.appendChild(b); return b; };
  const copy = btn("Copy text", "background:#fff;color:#0a3d62", async () => { try { await navigator.clipboard.writeText(text); copy.textContent = "Copied"; } catch { ta.select(); document.execCommand("copy"); copy.textContent = "Copied"; } });
  const done = (outcome: "sent" | "skipped") => { try { chrome.runtime.sendMessage({ type: "assistedOutcome", actionId, outcome }); } catch {} box.remove(); };
  btn("I sent it", "background:#0a3d62;color:#fff", () => done("sent"));
  btn("Skip", "background:#fff;color:#a00;border-color:#a00", () => done("skipped"));
  box.appendChild(row);
  box.appendChild(mk("div", "color:#777;font-size:12px;margin-top:8px", "Nothing is sent until you press Send in LinkedIn. This request expires in 8 minutes."));
  document.body.appendChild(box);
  return true;
}
