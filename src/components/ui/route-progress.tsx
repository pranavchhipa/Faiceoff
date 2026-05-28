"use client";

/**
 * Top route progress bar — a thin rust strip that animates whenever the
 * pathname changes. Zero external dependencies, zero network requests,
 * fixed to the top of the viewport so it lives above all chrome.
 *
 * App Router doesn't expose a router-events stream the way Pages Router
 * did, so the heuristic is: when usePathname() changes value, paint a
 * quick reveal animation. It's not "navigation start" perfect — it
 * actually paints right as the new route mounts — but combined with the
 * per-route loading skeletons it gives the user a clear "I'm moving"
 * signal in the 80–300ms window where Next.js streams the new tree.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function RouteProgress() {
  const pathname = usePathname();
  const [tick, setTick] = useState(0);

  // Bump the tick whenever the route changes. Each bump replays the bar.
  useEffect(() => {
    setTick((t) => t + 1);
  }, [pathname]);

  if (tick === 0) return null;

  return (
    <div
      key={tick}
      aria-hidden
      className="fixed left-0 right-0 top-0 z-[100] h-[2px] origin-left pointer-events-none"
    >
      <div className="h-full w-full origin-left animate-[fco-route-progress_700ms_cubic-bezier(0.22,1,0.36,1)_forwards] bg-[var(--color-primary)] shadow-[0_0_10px_var(--color-primary)]" />
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes fco-route-progress {
              0%   { transform: scaleX(0);   opacity: 0.9; }
              60%  { transform: scaleX(0.85); opacity: 1; }
              100% { transform: scaleX(1);   opacity: 0; }
            }
          `,
        }}
      />
    </div>
  );
}
