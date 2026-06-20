/**
 * Logo — the official Faiceoff brand lockup.
 *
 *   <Logo variant="mark" className="h-11 w-11" />            // self-contained mark tile
 *   <Logo variant="full" tone="dark"  className="h-7 w-auto" />  // black lockup — light bg
 *   <Logo variant="full" tone="light" className="h-7 w-auto" />  // white lockup — dark bg
 *   <Logo variant="full" adaptive     className="h-6 w-auto" />  // dark chrome → white lockup
 *
 * "full" renders the real Faiceoff lockup IMAGE (burst mark + "Faiceoff"
 * wordmark) — white on dark surfaces, black on light. `className` sets the
 * height; keep `w-auto` so the ~3:1 lockup scales without distortion.
 * "mark" stays the square self-contained tile (works on any background) —
 * used for the favicon/app-icon, sidebars, emails + the licence PDF.
 */

interface LogoProps {
  variant?: "mark" | "full";
  /** full only: dark = black lockup (light bg), light = white lockup (dark bg) */
  tone?: "dark" | "light";
  /** full only: app chrome is dark-only → render the white lockup */
  adaptive?: boolean;
  className?: string;
  alt?: string;
}

const MARK_SRC = "/logo-mark.png";
const LOCKUP_WHITE = "/images/logo-light.png"; // light-coloured lockup → dark backgrounds
const LOCKUP_BLACK = "/images/logo-dark.png"; // dark-coloured lockup → light backgrounds

export function Logo({
  variant = "mark",
  tone = "dark",
  adaptive = false,
  className = "",
  alt = "Faiceoff",
}: LogoProps) {
  if (variant === "mark") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={MARK_SRC} alt={alt} className={`object-contain ${className}`} />;
  }

  // full lockup image — white on dark surfaces, black on light surfaces.
  const onDark = adaptive || tone === "light";
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={onDark ? LOCKUP_WHITE : LOCKUP_BLACK}
      alt={alt}
      className={`object-contain ${className}`}
    />
  );
}
