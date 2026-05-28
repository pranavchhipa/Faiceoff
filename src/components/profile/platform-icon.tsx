import type { ReactElement, SVGProps } from "react";
import type { SocialPlatform } from "@/lib/profile/platform-detect";

/**
 * Compact monoline SVG icons for the platforms that get auto-detected by
 * `detectPlatform()`. Inline SVG (not lucide) so a) every platform is covered
 * including the ones lucide-react doesn't ship and b) the icons are tinted
 * via `currentColor` so the surrounding theme controls the colour — perfect
 * for the rust-on-dark public profile aesthetic and the cream dashboard
 * preview row.
 *
 * Strokes: 1.7 px, round caps, 24×24 box. Filled glyphs are the only
 * exception (filled letter marks for X / Pinterest etc. read better at
 * 16-20px display sizes than monoline outlines).
 */
export function PlatformIcon({
  platform,
  ...rest
}: { platform: SocialPlatform } & SVGProps<SVGSVGElement>) {
  const Comp = ICONS[platform] ?? ICONS.website;
  return <Comp aria-hidden {...COMMON} {...rest} />;
}

const COMMON: SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const Instagram = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.7" fill="currentColor" stroke="none" />
  </svg>
);

const YouTube = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <rect x="2" y="5" width="20" height="14" rx="3.5" />
    <path d="M10 9.5v5l4-2.5-4-2.5z" fill="currentColor" stroke="none" />
  </svg>
);

const TikTok = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <path d="M14 4v9.5a3.5 3.5 0 1 1-3.5-3.5" />
    <path d="M14 4c.4 2 1.8 3.6 4 4" />
  </svg>
);

const X = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <path d="M4 4l16 16M20 4L4 20" />
  </svg>
);

const LinkedIn = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 1 1 4 0v4M12 13v4" />
  </svg>
);

const Spotify = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M7 10c3-1 7-.6 10 1M7.5 13c2.5-.8 6-.4 8.5 1M8 16c2-.5 5-.2 6.5.6" />
  </svg>
);

const Pinterest = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v9M10 19l2-7" />
  </svg>
);

const GitHub = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <path d="M9 19c-4 1-4-2-6-2M15 22v-3.5a3 3 0 0 0-1-2.3c3-.3 6-1.5 6-7 0-1.4-.5-2.6-1.5-3.6.1-.5.4-2-.1-3 0 0-1.2-.5-4 1.5a13 13 0 0 0-7 0c-2.8-2-4-1.5-4-1.5-.5 1-.2 2.5-.1 3-1 1-1.5 2.2-1.5 3.6 0 5.5 3 6.7 6 7-.5.5-.8 1.2-1 2v3.5" />
  </svg>
);

const Facebook = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M14 9h2V6h-2.5C12 6 11 7 11 8.5V11H9v3h2v6h3v-6h2l.5-3H14v-1.5c0-.3.2-.5.5-.5z" fill="currentColor" stroke="none" />
  </svg>
);

const Snapchat = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <path d="M12 3c3 0 5 2 5 5.5 0 1.5-.5 3-1 4l1 1c.4.2.7.4 1.5.4l.5.5c0 .5-.5 1-2 1-1 0-1.5.5-1.5 1.5 0 .5-.5 1-1.5 1-.7 0-1 0-2 .6-.5.3-1 .5-2 .5s-1.5-.2-2-.5c-1-.6-1.3-.6-2-.6-1 0-1.5-.5-1.5-1 0-1-.5-1.5-1.5-1.5-1.5 0-2-.5-2-1l.5-.5c.8 0 1.1-.2 1.5-.4l1-1c-.5-1-1-2.5-1-4C7 5 9 3 12 3z" />
  </svg>
);

const Threads = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <path d="M12 21a8 8 0 0 1-8-9 8 8 0 0 1 16 .5c0 4-3 5.5-5.5 5.5-2 0-3-1-3-2.5s1.5-2.5 3-2.5c2 0 3 1 3 2.5" />
  </svg>
);

const WhatsApp = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <path d="M21 12.5A8.5 8.5 0 1 1 8 5.2L3 7l1.8-5A8.5 8.5 0 0 1 21 12.5z" />
    <path d="M8.5 9.5c.5 2.5 3.5 5.5 6 6 .8.2 1.5-.4 1.5-1l-.5-1.5-2 .5c-1-.3-2.2-1.5-2.5-2.5l.5-2L11 8.5c-.6 0-1.2.7-1 1.5l-1.5-.5z" fill="currentColor" stroke="none" />
  </svg>
);

const Telegram = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <path d="M21 4 3 11l5 2 2 6 3.5-4 5 4z" />
  </svg>
);

const Discord = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <path d="M18 6a16 16 0 0 0-4-1l-.4 1A14 14 0 0 0 10 6L9.5 5A16 16 0 0 0 6 6c-2 3-2.5 6-2 9 1.5 1 3 1.5 4.5 2l1-1.5A8 8 0 0 1 8 14M16 14a8 8 0 0 0 1.5 1.5l1 1.5c1.5-.5 3-1 4.5-2 .5-3 0-6-2-9zM9 13.5h.01M15 13.5h.01" />
  </svg>
);

const Mail = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
);

const Phone = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <path d="M22 16.5v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z" />
  </svg>
);

const Globe = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </svg>
);

const ICONS: Record<SocialPlatform, (p: SVGProps<SVGSVGElement>) => ReactElement> = {
  instagram: Instagram,
  youtube:   YouTube,
  tiktok:    TikTok,
  x:         X,
  linkedin:  LinkedIn,
  spotify:   Spotify,
  pinterest: Pinterest,
  github:    GitHub,
  facebook:  Facebook,
  snapchat:  Snapchat,
  threads:   Threads,
  whatsapp:  WhatsApp,
  telegram:  Telegram,
  discord:   Discord,
  email:     Mail,
  phone:     Phone,
  website:   Globe,
};
