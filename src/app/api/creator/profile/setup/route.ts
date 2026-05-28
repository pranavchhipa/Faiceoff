import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDemoGeneration } from "@/lib/profile/run-demo-generation";
import { defaultSlugFor, validateSlug } from "@/lib/profile/slug";
import {
  isValidCategory,
  MAX_CATEGORIES_PER_CREATOR,
  type DemoCategoryKey,
} from "@/lib/profile/demo-prompts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/**
 * POST /api/creator/profile/setup
 *
 * Body: { categories: string[], slug?: string }
 *
 * - Validates 1..MAX categories from the enum
 * - Picks / validates a slug (default = slugified IG handle)
 * - Ensures slug uniqueness (appends -2, -3, ... on collision)
 * - Replaces selected_categories on the creators row
 * - For each new category (not already a ready demo), inserts a pending
 *   creator_demo_samples row and fires after() → runDemoGeneration
 *
 * Returns: { slug, categories, samples: [{ category, status }] }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { categories?: unknown; slug?: unknown; city?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Validate categories ─────────────────────────────────────────────────
  if (!Array.isArray(body.categories) || body.categories.length === 0) {
    return NextResponse.json(
      { error: "Select at least 1 category" },
      { status: 400 },
    );
  }
  if (body.categories.length > MAX_CATEGORIES_PER_CREATOR) {
    return NextResponse.json(
      { error: `Pick up to ${MAX_CATEGORIES_PER_CREATOR} categories` },
      { status: 400 },
    );
  }
  const categories: DemoCategoryKey[] = [];
  for (const c of body.categories) {
    if (!isValidCategory(c)) {
      return NextResponse.json({ error: `Unknown category: ${c}` }, { status: 400 });
    }
    if (!categories.includes(c)) categories.push(c);
  }

  const admin = createAdminClient() as Admin;

  // ── Resolve creator + existing profile state ────────────────────────────
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select(
      "id, profile_slug, selected_categories, instagram_handle, profile_published, profile_published_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (creatorErr) {
    return NextResponse.json({ error: creatorErr.message }, { status: 500 });
  }
  if (!creator) {
    return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });
  }

  // Guard: must have at least 1 reference photo before generating demos
  const { count: photoCount } = await admin
    .from("creator_reference_photos")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creator.id);
  if (!photoCount || photoCount === 0) {
    return NextResponse.json(
      {
        error: "No reference photos found",
        detail: "Finish creator onboarding (upload at least 1 face photo) before setting up your public profile.",
      },
      { status: 400 },
    );
  }

  // ── Slug: validate custom or derive default ──────────────────────────────
  let slug = "";
  if (typeof body.slug === "string" && body.slug.trim()) {
    slug = body.slug.trim().toLowerCase();
    const v = validateSlug(slug);
    if (!v.ok) {
      return NextResponse.json({ error: v.reason }, { status: 400 });
    }
  } else if (creator.profile_slug) {
    // Keep existing slug if creator already has one
    slug = creator.profile_slug;
  } else {
    slug = defaultSlugFor({
      instagramHandle: creator.instagram_handle,
      displayName: user.user_metadata?.display_name as string | null | undefined,
      userIdShort: user.id.slice(0, 8),
    });
  }

  // ── Ensure uniqueness (append -2, -3, ... on collision) ─────────────────
  // Skip the check if it's already this creator's existing slug.
  if (slug !== creator.profile_slug) {
    let candidate = slug;
    let n = 2;
    // Bound the loop to avoid runaway in pathological cases.
    while (n < 1000) {
      const { data: taken } = await admin
        .from("creators")
        .select("id")
        .eq("profile_slug", candidate)
        .neq("id", creator.id)
        .maybeSingle();
      if (!taken) break;
      candidate = `${slug}-${n}`;
      n += 1;
    }
    slug = candidate;
  }

  // ── Snapshot existing demo samples to know which categories already
  //    have a ready/pending demo. We'll only kick off generations for the
  //    NEW categories (avoids re-generating perfectly good demos when
  //    creator just adds/swaps a category).
  const { data: existingSamples } = await admin
    .from("creator_demo_samples")
    .select("category, status, is_visible")
    .eq("creator_id", creator.id)
    .eq("is_visible", true);

  const existingByCategory = new Map<string, { status: string }>();
  for (const s of (existingSamples ?? []) as Array<{
    category: string;
    status: string;
  }>) {
    existingByCategory.set(s.category, { status: s.status });
  }

  // ── Optional: city ── update inline so the profile setup form can manage
  // the location pin alongside categories + slug in one save.
  let cityToSave: string | null | undefined;
  if (typeof body.city === "string") {
    const trimmed = body.city.trim().slice(0, 80);
    cityToSave = trimmed || null;
  }

  // ── Persist creators row (slug + categories + optional city) ──────────
  const updatePayload: Record<string, unknown> = {
    profile_slug: slug,
    selected_categories: categories,
  };
  if (cityToSave !== undefined) updatePayload.city = cityToSave;

  const { error: upErr } = await admin
    .from("creators")
    .update(updatePayload)
    .eq("id", creator.id);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // ── Mark archived: any visible demos for categories the creator dropped
  const droppedCategories = (existingSamples ?? [])
    .map((s: { category: string }) => s.category)
    .filter((c: string) => !categories.includes(c as DemoCategoryKey));
  if (droppedCategories.length > 0) {
    await admin
      .from("creator_demo_samples")
      .update({ is_visible: false })
      .eq("creator_id", creator.id)
      .in("category", droppedCategories);
  }

  // ── Insert pending rows + fire after() jobs for any category that
  //    doesn't already have a ready demo
  const toGenerate: DemoCategoryKey[] = [];
  for (const cat of categories) {
    const existing = existingByCategory.get(cat);
    if (existing && existing.status === "ready") continue;
    if (existing && existing.status === "pending") continue;
    toGenerate.push(cat);
  }

  const newRows: Array<{ id: string; category: DemoCategoryKey }> = [];
  for (const cat of toGenerate) {
    const { data: inserted, error: insErr } = await admin
      .from("creator_demo_samples")
      .insert({
        creator_id: creator.id,
        category: cat,
        status: "pending",
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      console.error("[profile/setup] insert demo sample failed", insErr);
      continue;
    }
    newRows.push({ id: inserted.id, category: cat });
  }

  // Fire-and-forget: kick off the Gemini jobs after response
  for (const row of newRows) {
    after(async () => {
      try {
        await runDemoGeneration(admin, {
          demoSampleId: row.id,
          creatorId: creator.id,
          category: row.category,
        });
      } catch (err) {
        console.error("[profile/setup] runDemoGeneration crashed", err);
      }
    });
  }

  // ── Return current state of all 4 samples
  const { data: finalSamples } = await admin
    .from("creator_demo_samples")
    .select("category, status, image_url")
    .eq("creator_id", creator.id)
    .eq("is_visible", true)
    .in("category", categories);

  return NextResponse.json({
    slug,
    categories,
    samples: finalSamples ?? [],
    queued: newRows.length,
  });
}
