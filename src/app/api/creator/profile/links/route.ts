import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectPlatform, type SocialPlatform } from "@/lib/profile/platform-detect";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const MAX_LINKS = 10;
const MAX_LABEL_LEN = 40;

interface ProfileLink {
  id: string;
  label: string;
  url: string;
  /**
   * Auto-detected from the URL host (Instagram, YouTube, etc.). The public
   * /creators/<slug> page renders these as Linktree-style platform icons in
   * a row, while links with `platform: null` keep rendering as the existing
   * labeled buttons. Stored in the same JSONB column — no migration needed.
   */
  platform?: SocialPlatform | null;
}

/**
 * Normalize a user-entered URL into something safe + clickable.
 * - Allows http(s), mailto:, tel:, and wa.me / whatsapp shortcuts
 * - Bare domains (instagram.com/x) get https:// prepended
 * - Rejects javascript:/data: and other dangerous schemes
 */
function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Allowed explicit schemes
  if (/^(mailto:|tel:)/i.test(trimmed)) return trimmed;

  // Dangerous schemes — reject
  if (/^(javascript:|data:|vbscript:|file:)/i.test(trimmed)) return null;

  // Already has http(s)
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      // Validate it parses
      new URL(trimmed);
      return trimmed;
    } catch {
      return null;
    }
  }

  // Bare domain / path → prepend https://
  try {
    const withProto = `https://${trimmed}`;
    new URL(withProto);
    // Must contain a dot (basic sanity: "youtube.com" not "foo")
    if (!/\./.test(trimmed)) return null;
    return withProto;
  } catch {
    return null;
  }
}

/**
 * GET /api/creator/profile/links — return current links for the creator.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as Admin;
  const { data: creator } = await admin
    .from("creators")
    .select("profile_links")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ links: creator?.profile_links ?? [] });
}

/**
 * POST /api/creator/profile/links
 * Body: { links: [{ label, url, id? }] }
 *
 * Replaces the entire links array (order preserved). Validates each link,
 * normalizes URLs, assigns ids to new ones, caps at MAX_LINKS.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { links?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.links)) {
    return NextResponse.json({ error: "links must be an array" }, { status: 400 });
  }
  if (body.links.length > MAX_LINKS) {
    return NextResponse.json(
      { error: `Up to ${MAX_LINKS} links allowed` },
      { status: 400 },
    );
  }

  const clean: ProfileLink[] = [];
  for (const raw of body.links) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as { id?: unknown; label?: unknown; url?: unknown };

    const label = typeof r.label === "string" ? r.label.trim() : "";
    const urlRaw = typeof r.url === "string" ? r.url : "";

    if (!label) {
      return NextResponse.json({ error: "Each link needs a label" }, { status: 400 });
    }
    if (label.length > MAX_LABEL_LEN) {
      return NextResponse.json(
        { error: `Label must be ${MAX_LABEL_LEN} characters or fewer` },
        { status: 400 },
      );
    }

    const url = normalizeUrl(urlRaw);
    if (!url) {
      return NextResponse.json(
        { error: `Invalid URL for "${label}". Use a full link like youtube.com/@you` },
        { status: 400 },
      );
    }

    clean.push({
      id: typeof r.id === "string" && r.id ? r.id : randomUUID(),
      label,
      url,
      // Tag the link with the platform it points at so the public profile
      // can split icon-row platforms from labeled buttons. Detection is
      // host-based so we never have to trust client-supplied platform hints.
      platform: detectPlatform(url),
    });
  }

  const admin = createAdminClient() as Admin;
  const { data: creator } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!creator) {
    return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });
  }

  const { error: upErr } = await admin
    .from("creators")
    .update({ profile_links: clean })
    .eq("id", creator.id);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, links: clean });
}
