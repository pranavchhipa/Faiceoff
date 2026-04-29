import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/creator/approvals
 *
 * Returns the authenticated creator's pending approvals, each joined with its
 * generation and campaign. Uses the admin client to bypass RLS — same pattern
 * as /api/creator/likeness-data. Direct client-side reads against the
 * `approvals` / `creators` tables were silently returning empty arrays because
 * of RLS policies.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 1. Resolve creator.id for this user
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (creatorErr) {
    console.error("[creator/approvals] creator lookup failed", creatorErr);
    return NextResponse.json(
      { error: "Failed to load creator profile" },
      { status: 500 }
    );
  }

  if (!creator) {
    // Not a creator → no approvals to show
    return NextResponse.json({ isCreator: false, approvals: [] });
  }

  // 2. Fetch pending approvals (flat — no joins) to avoid Supabase type-
  //    inference hitting `never`. We bulk-fetch generations + campaigns next.
  const { data: approvalsRaw, error: approvalsErr } = await admin
    .from("approvals")
    .select("id, status, feedback, expires_at, created_at, generation_id")
    .eq("creator_id", creator.id)
    .eq("status", "pending")
    .order("expires_at", { ascending: true });

  if (approvalsErr) {
    console.error("[creator/approvals] approvals lookup failed", approvalsErr);
    return NextResponse.json(
      { error: "Failed to load approvals" },
      { status: 500 }
    );
  }

  const rows = approvalsRaw ?? [];
  const generationIds = rows
    .map((r) => r.generation_id)
    .filter((id): id is string => Boolean(id));

  // 3. Bulk-fetch generations
  // NOTE: Migration 00025 renamed campaign_id → collab_session_id and
  // campaigns → collab_sessions. Updated everywhere accordingly.
  type Gen = {
    id: string;
    assembled_prompt: string | null;
    image_url: string | null;
    structured_brief: Record<string, unknown> | null;
    collab_session_id: string | null;
  };
  const gensById: Record<string, Gen> = {};
  if (generationIds.length > 0) {
    const { data: gens } = await admin
      .from("generations")
      .select(
        "id, assembled_prompt, image_url, structured_brief, collab_session_id",
      )
      .in("id", generationIds);

    (gens ?? []).forEach((g) => {
      gensById[g.id] = {
        id: g.id,
        assembled_prompt: g.assembled_prompt,
        image_url: g.image_url,
        structured_brief:
          (g.structured_brief as Record<string, unknown> | null) ?? null,
        collab_session_id: g.collab_session_id ?? null,
      };
    });
  }

  // 4. Bulk-fetch sessions referenced by these generations
  const sessionIds = Array.from(
    new Set(
      Object.values(gensById)
        .map((g) => g.collab_session_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const sessionsById: Record<string, { id: string; name: string }> = {};
  if (sessionIds.length > 0) {
    const { data: sessions } = await admin
      .from("collab_sessions")
      .select("id, name")
      .in("id", sessionIds);

    (sessions ?? []).forEach((c) => {
      sessionsById[c.id] = c;
    });
  }

  // 5. Shape the response — match the page's ApprovalItem type
  const approvals = rows.map((row) => {
    const gen = row.generation_id ? gensById[row.generation_id] : undefined;
    const campaign = gen?.collab_session_id
      ? sessionsById[gen.collab_session_id]
      : null;

    return {
      id: row.id,
      status: row.status,
      feedback: row.feedback,
      expires_at: row.expires_at,
      created_at: row.created_at,
      generation: gen
        ? {
            id: gen.id,
            assembled_prompt: gen.assembled_prompt,
            image_url: gen.image_url,
            structured_brief: gen.structured_brief,
          }
        : null,
      campaign: campaign ?? null,
    };
  });

  return NextResponse.json({ isCreator: true, approvals });
}
