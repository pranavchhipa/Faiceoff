/**
 * Logo — the Faiceoff brand mark + wordmark.
 *
 *   <Logo variant="mark" className="h-7 w-7" />            // gold mark only
 *   <Logo variant="full" tone="dark" className="h-7" />    // light background
 *   <Logo variant="full" tone="light" className="h-7" />   // dark background
 *   <Logo variant="full" adaptive className="h-6" />        // inherits text color
 *
 * "full" = the gold mark (logo-mark.png) + "Faiceoff." wordmark, matching the
 * original treatment. `className` sets the height of the lockup; the mark
 * matches that height and the wordmark scales alongside it.
 */

interface LogoProps {
  variant?: "mark" | "full";
  /** full only: dark = dark ink (light bg), light = cream (dark bg) */
  tone?: "dark" | "light";
  /** full only: inherit the surrounding text color (theme-aware chrome) */
  adaptive?: boolean;
  className?: string;
  alt?: string;
}

const MARK_SRC = "/logo-mark.png";

export function Logo({
  variant = "mark",
  tone = "dark",
  adaptive = false,
  className = "",
  alt = "Faiceoff",
}: LogoProps) {
  if (variant === "mark") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={MARK_SRC} alt={alt} className={`object-contain ${className}`} />
    );
  }

  // full lockup — mark + "Faiceoff." wordmark
  const wordColor = adaptive
    ? "currentColor"
    : tone === "light"
      ? "#f5ebd6"
      : "var(--color-foreground)";

  return (
    <span className={`inline-flex items-center gap-2 ${className}`} style={{ color: wordColor }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK_SRC} alt="" aria-hidden className="h-full w-auto object-contain" />
      <span
        className="font-display font-800 leading-none tracking-tight"
        style={{ fontSize: "1.1rem" }}
      >
        Faiceoff<span style={{ color: "var(--color-primary)" }}>.</span>
      </span>
    </span>
  );
}
