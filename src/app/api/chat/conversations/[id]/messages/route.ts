/**
 * GET  /api/chat/conversations/[id]/messages?before=<iso>&limit=50
 *   List messages newest-first, paginated via `before` cursor for infinite
 *   upward scroll.
 *
 * POST /api/chat/conversations/[id]/messages
 *   { body: string }
 *   Append a message. Marks it read for the sender's role automatically.
 *   Realtime listeners on conversation_messages get the INSERT instantly.
 */

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/redis/rate-limiter";

export const runtime = "nodejs";

interface ConversationCheck {
  id: string;
  brand_id: string;
  creator_id: string;
  brand_user_id: string;
  creator_user_id: string;
  role: "brand" | "creator";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadConversationForUser(
  admin: any,
  conversationId: string,
  userId: string,
): Promise<ConversationCheck | null> {
  const { data: conv } = await admin
    .from("conversations")
    .select("id, brand_id, creator_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return null;

  const [{ data: brand }, { data: creator }] = await Promise.all([
    admin
      .from("brands")
      .select("id, user_id")
      .eq("id", conv.brand_id)
      .maybeSingle(),
    admin
      .from("creators")
      .select("id, user_id")
      .eq("id", conv.creator_id)
      .maybeSingle(),
  ]);
  if (!brand || !creator) return null;

  let role: "brand" | "creator" | null = null;
  if (brand.user_id === userId) role = "brand";
  else if (creator.user_id === userId) role = "creator";
  if (!role) return null;

  return {
    id: conv.id,
    brand_id: conv.brand_id,
    creator_id: conv.creator_id,
    brand_user_id: brand.user_id,
    creator_user_id: creator.user_id,
    role,
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    100,
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const conv = await loadConversationForUser(admin, id, user.id);
  if (!conv) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let q = admin
    .from("conversation_messages")
    .select(
      "id, conversation_id, sender_user_id, sender_role, body, read_by_brand, read_by_creator, created_at",
    )
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) q = q.lt("created_at", before);

  const { data: rows, error } = await q;
  if (error) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // Mark messages as read for the requesting role (best-effort)
  const readCol = conv.role === "brand" ? "read_by_brand" : "read_by_creator";
  await admin
    .from("conversation_messages")
    .update({ [readCol]: true })
    .eq("conversation_id", id)
    .eq(readCol, false)
    .neq("sender_user_id", user.id);

  return NextResponse.json({
    messages: (rows ?? []).reverse(), // chronological for UI
    role: conv.role,
    has_more: (rows ?? []).length === limit,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 30 messages / minute per user — generous but blocks runaway loops
  const rl = await rateLimit(`chat-send:${user.id}`, 30, "1 m");
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many messages. Slow down." },
      { status: 429 },
    );
  }

  let body: { body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = (body.body ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "empty_body" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json(
      { error: "message_too_long" },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const conv = await loadConversationForUser(admin, id, user.id);
  if (!conv) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Sender's own message is auto-marked read for their side; counterparty
  // sees it as unread until they open the thread.
  const insert = {
    conversation_id: id,
    sender_user_id: user.id,
    sender_role: conv.role,
    body: text,
    read_by_brand: conv.role === "brand",
    read_by_creator: conv.role === "creator",
  };

  const { data: created, error } = await admin
    .from("conversation_messages")
    .insert(insert)
    .select(
      "id, conversation_id, sender_user_id, sender_role, body, read_by_brand, read_by_creator, created_at",
    )
    .single();

  if (error || !created) {
    Sentry.captureException(error, {
      tags: { route: "chat/messages", phase: "insert" },
    });
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }

  return NextResponse.json({ message: created }, { status: 201 });
}
