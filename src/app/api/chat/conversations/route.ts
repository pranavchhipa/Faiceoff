/**
 * GET  /api/chat/conversations          — list conversations for the user
 * POST /api/chat/conversations          — create a new conversation (gated)
 *
 * Eligibility for create: there must be at least one approved approval row
 * between this brand and this creator (the "first license issued" gate).
 * Without that, brand can't DM creator (anti-spam).
 */

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface ConversationRow {
  id: string;
  brand_id: string;
  creator_id: string;
  created_at: string;
  last_message_at: string | null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Resolve role(s) — same user can theoretically be both
  const [{ data: brand }, { data: creator }] = await Promise.all([
    admin.from("brands").select("id").eq("user_id", user.id).maybeSingle(),
    admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!brand && !creator) {
    return NextResponse.json({ conversations: [] });
  }

  const orFilters: string[] = [];
  if (brand) orFilters.push(`brand_id.eq.${brand.id}`);
  if (creator) orFilters.push(`creator_id.eq.${creator.id}`);

  const { data: convs, error } = await admin
    .from("conversations")
    .select("id, brand_id, creator_id, created_at, last_message_at")
    .or(orFilters.join(","))
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) {
    Sentry.captureException(error, { tags: { route: "chat/conversations" } });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const rows = (convs ?? []) as ConversationRow[];
  if (rows.length === 0) return NextResponse.json({ conversations: [] });

  // Hydrate with counterparty display name + avatar + unread count
  const brandIds = Array.from(new Set(rows.map((r) => r.brand_id)));
  const creatorIds = Array.from(new Set(rows.map((r) => r.creator_id)));

  const [brandsRes, creatorsRes] = await Promise.all([
    admin.from("brands").select("id, company_name, user_id").in("id", brandIds),
    admin.from("creators").select("id, user_id").in("id", creatorIds),
  ]);

  // Pull display_name + avatar from users for both sides
  const userIds = [
    ...((brandsRes.data ?? []) as { user_id: string }[]).map((b) => b.user_id),
    ...((creatorsRes.data ?? []) as { user_id: string }[]).map((c) => c.user_id),
  ];
  const { data: usersRows } = await admin
    .from("users")
    .select("id, display_name, avatar_url")
    .in("id", userIds);

  const usersById = new Map<string, { display_name: string | null; avatar_url: string | null }>();
  for (const u of (usersRows ?? []) as Array<{
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  }>) {
    usersById.set(u.id, { display_name: u.display_name, avatar_url: u.avatar_url });
  }

  const brandsById = new Map(
    ((brandsRes.data ?? []) as Array<{ id: string; company_name: string | null; user_id: string }>).map(
      (b) => [b.id, b],
    ),
  );
  const creatorsById = new Map(
    ((creatorsRes.data ?? []) as Array<{ id: string; user_id: string }>).map(
      (c) => [c.id, c],
    ),
  );

  // Unread counts in one batch query
  const role = brand ? "brand" : "creator";
  const readCol = role === "brand" ? "read_by_brand" : "read_by_creator";
  const { data: unreadRows } = await admin
    .from("conversation_messages")
    .select("conversation_id")
    .in(
      "conversation_id",
      rows.map((r) => r.id),
    )
    .eq(readCol, false);
  const unreadByConv = new Map<string, number>();
  for (const m of (unreadRows ?? []) as Array<{ conversation_id: string }>) {
    unreadByConv.set(
      m.conversation_id,
      (unreadByConv.get(m.conversation_id) ?? 0) + 1,
    );
  }

  const conversations = rows.map((r) => {
    const brandRow = brandsById.get(r.brand_id);
    const creatorRow = creatorsById.get(r.creator_id);
    const counterpartyUserId =
      role === "brand" ? creatorRow?.user_id : brandRow?.user_id;
    const counterpartyUser = counterpartyUserId
      ? usersById.get(counterpartyUserId)
      : null;
    const counterpartyName =
      role === "brand"
        ? counterpartyUser?.display_name ?? "Creator"
        : brandRow?.company_name ?? counterpartyUser?.display_name ?? "Brand";
    return {
      id: r.id,
      brand_id: r.brand_id,
      creator_id: r.creator_id,
      created_at: r.created_at,
      last_message_at: r.last_message_at,
      counterparty: {
        name: counterpartyName,
        avatar_url: counterpartyUser?.avatar_url ?? null,
      },
      unread_count: unreadByConv.get(r.id) ?? 0,
    };
  });

  return NextResponse.json({ conversations, role });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { brand_id?: string; creator_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { brand_id, creator_id } = body;
  if (!brand_id || !creator_id) {
    return NextResponse.json(
      { error: "brand_id and creator_id required" },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Caller must be either the brand owner OR the creator
  const [{ data: brand }, { data: creator }] = await Promise.all([
    admin.from("brands").select("id, user_id").eq("id", brand_id).maybeSingle(),
    admin.from("creators").select("id, user_id").eq("id", creator_id).maybeSingle(),
  ]);
  if (!brand || !creator) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (brand.user_id !== user.id && creator.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Eligibility: at least one approved approval row between this pair
  const { count: approvedCount } = await admin
    .from("approvals")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brand_id)
    .eq("creator_id", creator_id)
    .eq("status", "approved");

  if (!approvedCount || approvedCount < 1) {
    return NextResponse.json(
      {
        error:
          "Conversation requires at least one approved license between this brand and creator.",
      },
      { status: 412 },
    );
  }

  // Idempotent upsert by (brand_id, creator_id)
  const { data: existing } = await admin
    .from("conversations")
    .select("id")
    .eq("brand_id", brand_id)
    .eq("creator_id", creator_id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ conversation_id: existing.id });
  }

  const { data: created, error } = await admin
    .from("conversations")
    .insert({ brand_id, creator_id })
    .select("id")
    .single();

  if (error || !created) {
    Sentry.captureException(error, { tags: { route: "chat/conversations", phase: "insert" } });
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  return NextResponse.json({ conversation_id: created.id }, { status: 201 });
}
