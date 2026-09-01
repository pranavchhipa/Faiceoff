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

/**
 * VerifiedCheck — the small-size companion to VerifiedSeal.
 *
 * The 8-petal seal carries a check inside, but below ~20px the petals and the
 * check blur into each other and it reads as a gold flower rather than a
 * verification mark. This is the same gold, reduced to the one shape that
 * survives at 12-16px: a filled disc with a thick check knocked out of it.
 *
 * Use VerifiedCheck inline beside a name (top bar, menus, cards, chat) and
 * VerifiedSeal at 24px+ where the petals actually resolve (verify page,
 * public profile hero, licence certificate).
 */
export function VerifiedCheck({
  size = 15,
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
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={title}
      style={{ flexShrink: 0, display: "inline-block", verticalAlign: "middle" }}
    >
      <title>{title}</title>
      <circle cx="12" cy="12" r="11" fill="#c9a96e" />
      <path
        d="M7.5 12.3 L10.6 15.3 L16.5 9"
        fill="none"
        stroke="#1a1512"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * VerifiedAvatarBadge — the check as a corner badge on an avatar.
 *
 * Wrap an avatar in a relatively-positioned span and drop this in. The dark
 * ring matches the surface behind it so the badge reads as a cut-out rather
 * than a sticker. Verification belongs to the FACE, which is the whole
 * product here — a badge on the avatar says that; a mark floating beside the
 * name says something vaguer.
 */
export function VerifiedAvatarBadge({
  size = 12,
  ringColor = "var(--color-card)",
  className,
  title = "Faiceoff verified",
}: {
  size?: number;
  ringColor?: string;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={title}
      style={{ flexShrink: 0, display: "block" }}
    >
      <title>{title}</title>
      <circle cx="12" cy="12" r="12" fill={ringColor} />
      <circle cx="12" cy="12" r="9.5" fill="#c9a96e" />
      <path
        d="M8 12.3 L10.7 14.9 L16 9.4"
        fill="none"
        stroke="#1a1512"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
