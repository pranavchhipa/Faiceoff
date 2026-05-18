/**
 * POST /api/campaigns/suggest-brief — Phase 6a + 6b.
 *
 * Called by the Studio after a successful product image upload. Returns the
 * vision-call output (suggested pills + extracted pack_text + label_bbox)
 * so the Studio can pre-fill its form. Cached by SHA256 of the image bytes
 * so re-uploads of the same image don't re-run the vision call.
 *
 * Input:
 *   { product_image_url: string }
 * Output:
 *   { suggestion: SuggestBriefResult, cache_hit: boolean }
 *
 * Auth: any authenticated user (brand role recommended, but not enforced
 * here — the UI is brand-only and the endpoint doesn't write generation
 * state, just returns a brief draft).
 *
 * Rate limit: 20/min/user (vision calls cost ~$0.001 each and we don't
 * want a runaway page reloader to torch the budget).
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/redis/rate-limiter";
import { suggestBriefFromProduct, type SuggestBriefResult } from "@/lib/ai/brief-suggester";
import { track } from "@/lib/observability/analytics";

export const runtime = "nodejs";
export const maxDuration = 30;

interface CacheRow {
  image_hash: string;
  suggestions: SuggestBriefResult;
  created_at: string;
}

export async function POST(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Rate limit (20/min/user) ────────────────────────────────────────────
  const rl = await rateLimit(`suggest-brief:${user.id}`, 20, "1 m");
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many suggestion requests. Please wait a minute." },
      { status: 429 },
    );
  }

  // ── Parse input ─────────────────────────────────────────────────────────
  let productImageUrl: string;
  try {
    const body = (await request.json()) as { product_image_url?: unknown };
    if (typeof body.product_image_url !== "string" || body.product_image_url.length === 0) {
      return NextResponse.json(
        { error: "product_image_url is required" },
        { status: 400 },
      );
    }
    productImageUrl = body.product_image_url;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Fetch image bytes ───────────────────────────────────────────────────
  let bytes: Uint8Array;
  let mime: string;
  try {
    const res = await fetch(productImageUrl);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch product_image_url (HTTP ${res.status})` },
        { status: 502 },
      );
    }
    bytes = new Uint8Array(await res.arrayBuffer());
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    mime = ct.startsWith("image/") ? ct.split(";")[0].trim() : "image/jpeg";
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch product image" },
      { status: 502 },
    );
  }

  if (bytes.byteLength === 0) {
    return NextResponse.json(
      { error: "Empty image body" },
      { status: 400 },
    );
  }

  // ── Compute SHA256 + check cache ────────────────────────────────────────
  const imageHash = createHash("sha256").update(bytes).digest("hex");
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cached } = (await (admin as any)
    .from("pill_suggestions_cache")
    .select("image_hash, suggestions, created_at")
    .eq("image_hash", imageHash)
    .maybeSingle()) as { data: CacheRow | null };

  if (cached?.suggestions) {
    track(
      "pill_suggestion_requested",
      {
        image_hash: imageHash,
        cache_hit: true,
        product_category: cached.suggestions.productCategory,
      },
      user.id,
    );
    return NextResponse.json({
      suggestion: cached.suggestions,
      cache_hit: true,
    });
  }

  // ── Call vision model ───────────────────────────────────────────────────
  const suggestion = await suggestBriefFromProduct({
    productImageBytes: bytes,
    productImageMime: mime,
    // No generationId yet — Studio calls this BEFORE the gen row exists.
    generationId: null,
  });

  // ── Persist to cache (fire-and-forget; ignore failure) ─────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("pill_suggestions_cache").upsert(
      {
        image_hash: imageHash,
        suggestions: suggestion,
      },
      { onConflict: "image_hash" },
    );
  } catch {
    // not fatal — next call just re-runs the vision step.
  }

  // ── Telemetry ───────────────────────────────────────────────────────────
  const isEmpty =
    !suggestion.productCategory &&
    !suggestion.extractedPackText.primary &&
    suggestion.suggestions.interaction.length === 0;
  if (isEmpty) {
    track("pill_suggestion_failed", { image_hash: imageHash, error_category: "empty_result" }, user.id);
  } else {
    track(
      "pill_suggestion_requested",
      {
        image_hash: imageHash,
        cache_hit: false,
        product_category: suggestion.productCategory,
        confidence: suggestion.confidence,
      },
      user.id,
    );
    if (suggestion.extractedPackText.primary) {
      track(
        "pack_text_auto_extracted",
        {
          text_length:
            (suggestion.extractedPackText.primary?.length ?? 0) +
            (suggestion.extractedPackText.secondary?.length ?? 0),
        },
        user.id,
      );
    }
  }

  return NextResponse.json({ suggestion, cache_hit: false });
}
