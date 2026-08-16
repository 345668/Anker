/**
 * Anker brand mark — Pagani-inspired silhouette (a horizontally-stretched, thin
 * elliptical frame with the "ANKER" wordmark set uppercase at wide letter-
 * spacing) finished in SeAZ-style glossy silver chrome.
 *
 * SVG so it stays crisp at any size:
 *   - variant="default" → glossy silver chrome frame + wordmark, with a thin
 *                         inner bevel highlight (the metallic emblem look). In
 *                         dark mode the oval fills with glossy candy red
 *                         (Microcar-style silver-on-red medallion).
 *   - variant="outline" → transparent oval, currentColor thin frame + wordmark
 *                         (the pure minimalist, theme-aware look)
 *   - variant="filled"  → red-orange fill behind a currentColor wordmark
 *   - variant="silver"  → alias of default (glossy chrome)
 *
 * The wordmark uses the app display font (Outfit) via `font-display`.
 */

export function AnkerLogo({
  className = "h-8 w-auto",
  variant = "default",
  title = "Anker",
}: {
  className?: string
  variant?: "default" | "outline" | "filled" | "silver"
  title?: string
}) {
  const chrome = variant === "default" || variant === "silver"
  const cid = "anker-chrome"
  const ink = chrome ? `url(#${cid})` : "currentColor"
  const stroke = ink
  const fill = variant === "filled" ? "#e5380f" : "none"

  return (
    <svg viewBox="0 0 340 76" className={className} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      {chrome && (
        <defs>
          {/* Glossy chrome: bright top highlight, dark core band with a crisp
              horizon at the midline, a secondary lower sheen, mid at the base. */}
          <linearGradient id={cid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbfcfd" />
            <stop offset="16%" stopColor="#d3d8df" />
            <stop offset="34%" stopColor="#878e98" />
            <stop offset="49%" stopColor="#5c636b" />
            <stop offset="51%" stopColor="#6b727a" />
            <stop offset="70%" stopColor="#a9b0b9" />
            <stop offset="85%" stopColor="#eceef2" />
            <stop offset="100%" stopColor="#aeb4bd" />
          </linearGradient>
          {/* Glossy candy red — Microcar-style: bright top, deep base. Only
              painted in dark mode (see the `hidden dark:block` fill below). */}
          <linearGradient id={`${cid}-red`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f0472e" />
            <stop offset="18%" stopColor="#e0201d" />
            <stop offset="52%" stopColor="#c20d11" />
            <stop offset="100%" stopColor="#7f0a0d" />
          </linearGradient>
        </defs>
      )}

      {/* Dark-mode candy-red medallion fill, inset just inside the chrome frame.
          Hidden in light mode so the mark stays a clean transparent chrome. */}
      {chrome && (
        <ellipse className="hidden dark:block" cx="170" cy="38" rx="163" ry="31" fill={`url(#${cid}-red)`} />
      )}

      <ellipse cx="170" cy="38" rx="166" ry="34" fill={fill} stroke={stroke} strokeWidth="3.5" />
      {/* Thin inner bevel highlight — reads as a polished chrome edge. */}
      {chrome && (
        <ellipse cx="170" cy="38" rx="162.5" ry="30.5" fill="none" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="0.75" />
      )}

      <text
        x="181" y="39"
        textAnchor="middle"
        dominantBaseline="central"
        className="font-display"
        fontSize="34"
        fontWeight={600}
        letterSpacing="21"
        fill={ink}
      >
        ANKER
      </text>
    </svg>
  )
}
