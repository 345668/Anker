/**
 * Anker brand mark — the "Anker" wordmark inside an elliptical ring.
 *
 * Recreated as SVG so it stays crisp at any size and theme-aware:
 *   - variant="default"  → uses currentColor (adapts to light/dark surfaces)
 *   - variant="silver"   → brushed-silver gradient (the requested silver mark)
 *
 * The wordmark uses the app display font (Outfit) via `font-display`, so it
 * matches the rest of the brand typography.
 */

export function AnkerLogo({
  className = "h-8 w-auto",
  variant = "default",
  title = "Anker",
}: {
  className?: string
  variant?: "default" | "silver"
  title?: string
}) {
  const silver = variant === "silver"
  const gid = "anker-silver-grad"
  return (
    <svg viewBox="0 0 220 96" className={className} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      {silver && (
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e9ebef" />
            <stop offset="45%" stopColor="#b9bec7" />
            <stop offset="55%" stopColor="#9aa0aa" />
            <stop offset="100%" stopColor="#c7ccd4" />
          </linearGradient>
        </defs>
      )}
      <ellipse
        cx="110" cy="48" rx="104" ry="44"
        fill="none"
        stroke={silver ? `url(#${gid})` : "currentColor"}
        strokeWidth="6"
      />
      <text
        x="110" y="49"
        textAnchor="middle"
        dominantBaseline="central"
        className="font-display"
        fontSize="52"
        fontWeight={700}
        letterSpacing="-1"
        fill={silver ? `url(#${gid})` : "currentColor"}
      >
        Anker
      </text>
    </svg>
  )
}
