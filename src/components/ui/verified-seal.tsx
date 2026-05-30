/**
 * VerifiedSeal — the Faiceoff golden verified tick.
 *
 * Shown wherever a creator has `is_verified = true` (manually approved by a
 * Control Centre operator). An 8-petal gold sunburst with a white check, on a
 * warm gold radial gradient. Gold is RESERVED for this seal — never a UI accent.
 *
 * Works in both server and client components. Every instance inlines its own
 * <defs>; the shared gradient id is fine because all seals want the identical
 * gradient, and browsers resolve url(#id) to the first matching def.
 */

export function VerifiedSeal({
  size = 16,
  className,
  title = "Faiceoff verified",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title}
      style={{ flexShrink: 0, display: "inline-block", verticalAlign: "middle" }}
    >
      <title>{title}</title>
      <defs>
        <radialGradient
          id="faVerifiedSeal"
          cx="34"
          cy="28"
          r="58"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.4" stopColor="#f0c34a" />
          <stop offset="0.85" stopColor="#c9a96e" />
          <stop offset="1" stopColor="#a3854f" />
        </radialGradient>
      </defs>
      <g fill="url(#faVerifiedSeal)">
        <circle cx="50" cy="50" r="36" />
        <circle cx="50" cy="14" r="9" />
        <circle cx="75.46" cy="24.54" r="9" />
        <circle cx="86" cy="50" r="9" />
        <circle cx="75.46" cy="75.46" r="9" />
        <circle cx="50" cy="86" r="9" />
        <circle cx="24.54" cy="75.46" r="9" />
        <circle cx="14" cy="50" r="9" />
        <circle cx="24.54" cy="24.54" r="9" />
      </g>
      <path
        d="M 34 51 L 45 62 L 67 39"
        fill="none"
        stroke="#ffffff"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
