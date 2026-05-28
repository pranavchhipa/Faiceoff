// ─────────────────────────────────────────────────────────────────────────────
// Auto-detect a known social platform from a profile link URL.
// Used by /api/creator/profile/links to tag each saved link with a `platform`
// hint, and by /creators/<slug> to render those tagged links as a row of
// Linktree-style platform icons (separate from the labeled custom buttons).
//
// New platforms slot in here — each entry just needs:
//   - id          (stable string key, also used as the SVG sprite id)
//   - label       (human name, shown on hover / a11y)
//   - hostMatches (lowercased hostnames whose presence flags this platform)
//   - color       (brand-ish hue, optional — falls back to current text color)
// ─────────────────────────────────────────────────────────────────────────────

export type SocialPlatform =
  | "instagram"
  | "youtube"
  | "tiktok"
  | "x"
  | "linkedin"
  | "spotify"
  | "pinterest"
  | "github"
  | "facebook"
  | "snapchat"
  | "threads"
  | "whatsapp"
  | "telegram"
  | "discord"
  | "email"
  | "phone"
  | "website";

interface PlatformDef {
  id: SocialPlatform;
  label: string;
  hostMatches: string[];
  /** Brand hint — UI uses currentColor; this is just metadata. */
  color: string;
}

const PLATFORMS: PlatformDef[] = [
  { id: "instagram", label: "Instagram",   hostMatches: ["instagram.com", "instagr.am"],        color: "#e1306c" },
  { id: "youtube",   label: "YouTube",     hostMatches: ["youtube.com", "youtu.be", "m.youtube.com"], color: "#ff0033" },
  { id: "tiktok",    label: "TikTok",      hostMatches: ["tiktok.com", "vm.tiktok.com"],         color: "#ff0050" },
  { id: "x",         label: "X / Twitter", hostMatches: ["x.com", "twitter.com", "t.co"],        color: "#ffffff" },
  { id: "linkedin",  label: "LinkedIn",    hostMatches: ["linkedin.com", "lnkd.in"],             color: "#0a66c2" },
  { id: "spotify",   label: "Spotify",     hostMatches: ["spotify.com", "open.spotify.com"],     color: "#1db954" },
  { id: "pinterest", label: "Pinterest",   hostMatches: ["pinterest.com", "pin.it"],             color: "#bd081c" },
  { id: "github",    label: "GitHub",      hostMatches: ["github.com"],                          color: "#ffffff" },
  { id: "facebook",  label: "Facebook",    hostMatches: ["facebook.com", "fb.com"],              color: "#1877f2" },
  { id: "snapchat",  label: "Snapchat",    hostMatches: ["snapchat.com"],                        color: "#fffc00" },
  { id: "threads",   label: "Threads",     hostMatches: ["threads.net"],                         color: "#ffffff" },
  { id: "whatsapp",  label: "WhatsApp",    hostMatches: ["wa.me", "whatsapp.com", "chat.whatsapp.com"], color: "#25d366" },
  { id: "telegram",  label: "Telegram",    hostMatches: ["t.me", "telegram.me", "telegram.org"], color: "#0088cc" },
  { id: "discord",   label: "Discord",     hostMatches: ["discord.gg", "discord.com"],           color: "#5865f2" },
];

/**
 * Pull the platform id out of an arbitrary URL. Returns null for things we
 * don't recognise — those render as labeled buttons (the existing pattern),
 * not platform icons.
 *
 * Also handles `mailto:` and `tel:` scheme URLs so a creator can drop their
 * email / phone in as a one-tap contact icon if they want.
 */
export function detectPlatform(rawUrl: string): SocialPlatform | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();

  if (/^mailto:/i.test(trimmed)) return "email";
  if (/^tel:/i.test(trimmed))   return "phone";

  let host: string;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    host = new URL(withProto).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (!host) return null;

  for (const p of PLATFORMS) {
    for (const m of p.hostMatches) {
      if (host === m || host.endsWith(`.${m}`)) return p.id;
    }
  }
  return null;
}

/** Human-readable label for an id — used on hover / a11y. */
export function platformLabel(id: SocialPlatform): string {
  if (id === "email")   return "Email";
  if (id === "phone")   return "Phone";
  if (id === "website") return "Website";
  const def = PLATFORMS.find((p) => p.id === id);
  return def ? def.label : id;
}
