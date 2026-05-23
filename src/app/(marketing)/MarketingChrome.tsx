"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Marketing chrome switch.
 *
 * Most marketing pages (landing, /pricing, /for-brands index, /for-creators,
 * legal) rely on the shared cream <Nav> + <Footer> rendered by the layout.
 *
 * But the dark editorial SEO cluster ships its OWN header + footer baked into
 * each page:
 *   /creators, /creators/<slug>, /creators/category/<cat>
 *   /earn
 *   /learn, /learn/<article>
 *   /for-brands/<industry>   (NOT the /for-brands index)
 *
 * Rendering the global chrome on those pages stacked two headers (the fixed,
 * transparent Nav bled through onto the page's own dark header → doubled logo
 * + doubled CTA) and two footers. This wrapper hides the global Nav/Footer on
 * those self-contained routes.
 *
 * Nav/Footer are passed in as props (not imported here) so they stay server
 * components — this client wrapper only decides whether to mount them.
 */

function isSelfContained(pathname: string): boolean {
  if (pathname === "/creators" || pathname.startsWith("/creators/")) return true;
  if (pathname === "/earn") return true;
  if (pathname === "/learn" || pathname.startsWith("/learn/")) return true;
  // /for-brands/<industry> is dark + self-contained; the /for-brands index is not.
  if (pathname.startsWith("/for-brands/")) return true;
  return false;
}

export function MarketingChrome({
  nav,
  footer,
  children,
}: {
  nav: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const selfContained = isSelfContained(pathname);

  return (
    <div className="landing-scope relative min-h-screen overflow-hidden">
      {!selfContained && nav}
      <main className="flex-1 w-full overflow-x-hidden">{children}</main>
      {!selfContained && footer}
    </div>
  );
}
