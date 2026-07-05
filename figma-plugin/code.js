// Anker Decks — Figma plugin main thread.
//
// Runs inside Figma. Handles three flows:
//   * scan       — enumerate every text node on the current deck and hand
//                  it to the UI so the user can propose a mapping.
//   * apply      — take a { nodeId: text } dictionary from the UI and write
//                  every node in the current file that matches.
//   * config     — persist base URL + bearer token to clientStorage.
//
// The UI iframe posts messages here; we reply with parent.postMessage.

figma.showUI(__html__, { width: 380, height: 560, themeColors: true })

function getAllTextNodes(root) {
  const out = []
  function walk(node, slide) {
    if (node.type === "TEXT") {
      out.push({
        nodeId: node.id,
        slideIndex: slide,
        characters: node.characters,
        role: guessRole(node),
      })
    }
    if ("children" in node) {
      const nextSlide = /^SECTION|FRAME|SLIDE/i.test(node.type) && node.parent === root ? out.length : slide
      for (const c of node.children) walk(c, nextSlide)
    }
  }
  walk(root, 0)
  return out
}

function guessRole(node) {
  const size = node.fontSize
  if (typeof size === "number" && size >= 32) return "title"
  if (typeof size === "number" && size <= 10) return "footer"
  return "body"
}

async function applyFills(fills) {
  let applied = 0, missing = 0
  for (const [nodeId, text] of Object.entries(fills)) {
    const node = await figma.getNodeByIdAsync(nodeId)
    if (!node || node.type !== "TEXT") { missing++; continue }
    try {
      // Loading fonts is mandatory before touching characters.
      const fonts = node.getRangeAllFontNames(0, node.characters.length)
      await Promise.all(fonts.map((f) => figma.loadFontAsync(f)))
      node.characters = String(text)
      applied++
    } catch (e) {
      console.error("apply failed for", nodeId, e)
    }
  }
  return { applied, missing }
}

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === "get-config") {
      const baseUrl = await figma.clientStorage.getAsync("ankerBaseUrl")
      const token   = await figma.clientStorage.getAsync("ankerToken")
      figma.ui.postMessage({ type: "config", baseUrl: baseUrl || "https://anker.de", hasToken: !!token })
    }
    else if (msg.type === "save-config") {
      if (msg.baseUrl) await figma.clientStorage.setAsync("ankerBaseUrl", msg.baseUrl)
      if (msg.token   != null) await figma.clientStorage.setAsync("ankerToken", msg.token)
      figma.ui.postMessage({ type: "config-saved" })
    }
    else if (msg.type === "scan") {
      const nodes = getAllTextNodes(figma.currentPage)
      figma.ui.postMessage({ type: "scan-result", nodes, fileKey: figma.fileKey })
    }
    else if (msg.type === "apply") {
      const { applied, missing } = await applyFills(msg.fills || {})
      figma.ui.postMessage({ type: "apply-result", applied, missing })
      figma.notify(`Anker: filled ${applied} nodes` + (missing ? ` (${missing} missing)` : ""))
    }
    else if (msg.type === "close") {
      figma.closePlugin()
    }
  } catch (e) {
    figma.ui.postMessage({ type: "error", message: e && e.message ? e.message : String(e) })
  }
}
