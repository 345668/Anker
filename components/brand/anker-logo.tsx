/**
 * Anker brand mark — Pagani-inspired: an "ANKER" wordmark set in uppercase with
 * wide letter-spacing, spanning a horizontally-stretched, thin elliptical frame.
 *
 * Recreated as SVG so it stays crisp at any size and theme-aware:
 *   - variant="default" → red-orange oval, currentColor frame + wordmark (so the
 *                         thin ring and letters read on the fill in light + dark)
 *   - variant="silver"  → transparent oval with a brushed-silver frame + wordmark
 *   - variant="outline" → transparent oval, currentColor frame + wordmark (the
 *                         pure minimalist Pagani-style look)
 *
 * The wordmark uses the app display font (Outfit) via `font-display`.
 */

export function AnkerLogo({
  className = "h-8 w-auto",
  variant = "default",
  title = "Anker",
}: {
  className?: string
  variant?: "default" | "silver" | "outline"
  title?: string
}) {
  const silver = variant === "silver"
  const gid = "anker-silver-grad"
  const stroke = silver ? `url(#${gid})` : "currentColor"
  const fill = variant === "default" ? "#e5380f" : "none"
  const ink = silver ? `url(#${gid})` : "currentColor"

  return (
    <svg viewBox="0 0 340 76" className={className} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
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
      <ellipse cx="170" cy="38" rx="166" ry="34" fill={fill} stroke={stroke} strokeWidth="3.25" />
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
