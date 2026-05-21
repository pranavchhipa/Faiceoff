"use server";

/**
 * Control Centre — support ticket operator actions.
 *
 * Every action re-verifies the CC session (getCurrentSession) before doing
 * anything. They run with the admin client (service role) and write an audit
 * row. Used by the ticket detail page forms.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSession } from "@/lib/cc/session";
import { logAudit } from "@/lib/cc/audit";
import { emitNotification } from "@/lib/notifications/emit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

async function requireOperator() {
  const session = await getCurrentSession();
  if (!session) throw new Error("Not authenticated");
  return session;
}

/** Operator posts a reply on a ticket → notifies the user. */
export async function replyToTicket(formData: FormData): Promise<void> {
  const session = await requireOperator();
  const ticketId = String(formData.get("ticket_id") ?? "");
  const ccSlug = String(formData.get("cc_slug") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!ticketId || !body) return;

  const admin = createAdminClient() as Admin;

  const { data: ticket } = await admin
    .from("support_tickets")
    .select("id, user_id, subject")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return;

  await admin.from("ticket_messages").insert({
    ticket_id: ticketId,
    sender_kind: "operator",
    body,
  });

  await admin
    .from("support_tickets")
    .update({
      status: "waiting_on_user",
      has_unread_for_user: true,
      has_unread_for_operator: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);

  await emitNotification(admin, {
    userId: ticket.user_id,
    type: "ticket_reply",
    title: "Support replied to your ticket",
    body: ticket.subject,
    href: "/support",
  });

  void logAudit({
    action: "ticket.reply",
    sessionId: session.id,
    payload: { ticket_id: ticketId },
  });

  revalidatePath(`/${ccSlug}/tickets/${ticketId}`);
  revalidatePath(`/${ccSlug}/tickets`);
}

/** Update status / priority (triage). */
export async function updateTicketMeta(formData: FormData): Promise<void> {
  const session = await requireOperator();
  const ticketId = String(formData.get("ticket_id") ?? "");
  const ccSlug = String(formData.get("cc_slug") ?? "");
  const status = String(formData.get("status") ?? "");
  const priority = String(formData.get("priority") ?? "");
  if (!ticketId) return;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (["open", "in_progress", "waiting_on_user", "resolved", "closed"].includes(status)) {
    update.status = status;
    if (status === "resolved") update.resolved_at = new Date().toISOString();
  }
  if (["low", "normal", "high", "urgent"].includes(priority)) {
    update.priority = priority;
  }

  const admin = createAdminClient() as Admin;
  await admin.from("support_tickets").update(update).eq("id", ticketId);

  void logAudit({
    action: "ticket.update_meta",
    sessionId: session.id,
    payload: { ticket_id: ticketId, status, priority },
  });

  revalidatePath(`/${ccSlug}/tickets/${ticketId}`);
  revalidatePath(`/${ccSlug}/tickets`);
}

/** Resolve a ticket with a closing note → notify user. */
export async function resolveTicket(formData: FormData): Promise<void> {
  const session = await requireOperator();
  const ticketId = String(formData.get("ticket_id") ?? "");
  const ccSlug = String(formData.get("cc_slug") ?? "");
  const note = String(formData.get("resolution_note") ?? "").trim();
  if (!ticketId) return;

  const admin = createAdminClient() as Admin;
  const { data: ticket } = await admin
    .from("support_tickets")
    .select("id, user_id, subject")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return;

  if (note) {
    await admin.from("ticket_messages").insert({
      ticket_id: ticketId,
      sender_kind: "operator",
      body: note,
      action_tag: "resolution",
    });
  }

  await admin
    .from("support_tickets")
    .update({
      status: "resolved",
      resolution_note: note || null,
      resolved_at: new Date().toISOString(),
      has_unread_for_user: true,
      has_unread_for_operator: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);

  await emitNotification(admin, {
    userId: ticket.user_id,
    type: "ticket_resolved",
    title: "Your support ticket was resolved",
    body: ticket.subject,
    href: "/support",
  });

  void logAudit({
    action: "ticket.resolve",
    sessionId: session.id,
    payload: { ticket_id: ticketId },
  });

  revalidatePath(`/${ccSlug}/tickets/${ticketId}`);
  revalidatePath(`/${ccSlug}/tickets`);
}

/**
 * Remediation: grant credits to the brand that raised the ticket.
 * Increments brands.credits_remaining directly + posts an operator message
 * + notifies the brand.
 */
export async function grantCreditsForTicket(formData: FormData): Promise<void> {
  const session = await requireOperator();
  const ticketId = String(formData.get("ticket_id") ?? "");
  const ccSlug = String(formData.get("cc_slug") ?? "");
  const amount = parseInt(String(formData.get("credits") ?? "0"), 10);
  if (!ticketId || !Number.isFinite(amount) || amount <= 0 || amount > 1000) return;

  const admin = createAdminClient() as Admin;

  const { data: ticket } = await admin
    .from("support_tickets")
    .select("id, user_id, role, subject")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket || ticket.role !== "brand") return;

  // Resolve brand by the raiser's user id
  const { data: brand } = await admin
    .from("brands")
    .select("id, credits_remaining")
    .eq("user_id", ticket.user_id)
    .maybeSingle();
  if (!brand) return;

  const newBalance = (brand.credits_remaining ?? 0) + amount;
  await admin
    .from("brands")
    .update({ credits_remaining: newBalance })
    .eq("id", brand.id);

  // Best-effort ledger row (table may differ — wrap in try)
  try {
    await admin.from("credit_transactions").insert({
      brand_id: brand.id,
      delta: amount,
      balance_after: newBalance,
      reason: "support_grant",
      reference_type: "support_ticket",
      reference_id: ticketId,
    });
  } catch {
    // ledger schema mismatch — balance already updated, non-fatal
  }

  await admin.from("ticket_messages").insert({
    ticket_id: ticketId,
    sender_kind: "operator",
    body: `Granted ${amount} credit${amount === 1 ? "" : "s"} to your account as a goodwill resolution.`,
    action_tag: "credits_granted",
  });

  await admin
    .from("support_tickets")
    .update({
      has_unread_for_user: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);

  await emitNotification(admin, {
    userId: ticket.user_id,
    type: "credits_granted",
    title: `${amount} credit${amount === 1 ? "" : "s"} added to your account`,
    body: `Support granted credits resolving "${ticket.subject}".`,
    href: "/brand/credits",
  });

  void logAudit({
    action: "ticket.grant_credits",
    sessionId: session.id,
    payload: { ticket_id: ticketId, brand_id: brand.id, credits: amount },
  });

  revalidatePath(`/${ccSlug}/tickets/${ticketId}`);
}
