/**
 * Logo — single source of truth for the Faiceoff brand mark.
 *
 * ALWAYS use this component (or the raw files it points to) for the logo.
 * NEVER typeset "Faiceoff" as text with a styled dot — that is not the
 * official wordmark.
 *
 * Official assets (in /public, SVG so they never 404 or pixelate):
 *   - logo-mark.svg        — gold starburst mark, works on light + dark (square)
 *   - logo-full-dark.svg   — navy lockup (mark + wordmark) for LIGHT bg
 *   - logo-full-light.svg  — cream lockup (mark + wordmark) for DARK bg
 *
 * Usage:
 *   <Logo variant="mark" className="h-8 w-8" />            // square icon spots
 *   <Logo variant="full" tone="dark" className="h-7" />    // light background
 *   <Logo variant="full" tone="light" className="h-7" />   // dark background
 */

interface LogoProps {
  /** "mark" = square starburst, "full" = mark + wordmark lockup */
  variant?: "mark" | "full";
  /**
   * Only for variant="full". dark = navy (use on light bg), light = cream
   * (use on dark bg). Ignored when `adaptive` is true.
   */
  tone?: "dark" | "light";
  /**
   * Only for variant="full". When true, renders BOTH lockups and shows the
   * correct one based on the next-themes `html.dark` class — for chrome that
   * lives in both light + dark themes (dashboard, etc.). See globals.css
   * `.fco-logo-light` / `.fco-logo-dark`.
   */
  adaptive?: boolean;
  className?: string;
  /** Accessible alt; defaults to "Faiceoff" */
  alt?: string;
}

const SRC = {
  mark: "/logo-mark.svg",
  "full-dark": "/logo-full-dark.svg",
  "full-light": "/logo-full-light.svg",
} as const;

export function Logo({
  variant = "mark",
  tone = "dark",
  adaptive = false,
  className = "",
  alt = "Faiceoff",
}: LogoProps) {
  // Theme-adaptive full lockup — render both, CSS shows the right one.
  if (variant === "full" && adaptive) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={SRC["full-dark"]}
          alt={alt}
          className={`fco-logo-light object-contain ${className}`}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={SRC["full-light"]}
          alt={alt}
          aria-hidden
          className={`fco-logo-dark object-contain ${className}`}
        />
      </>
    );
  }

  const src = variant === "mark" ? SRC.mark : SRC[`full-${tone}`];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={`object-contain ${className}`} />
  );
}
