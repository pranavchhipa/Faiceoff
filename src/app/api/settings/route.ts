import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* ── GET: fetch profile data ── */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const role = user.user_metadata?.role ?? "creator";

    // Fetch user row + role-specific data in parallel
    const [userResult, roleResult] = await Promise.all([
      admin
        .from("users")
        .select("display_name, email, phone, avatar_url")
        .eq("id", user.id)
        .maybeSingle(),
      role === "creator"
        ? admin
            .from("creators")
            .select("instagram_handle, bio")
            .eq("user_id", user.id)
            .maybeSingle()
        : role === "brand"
          ? admin
              .from("brands")
              .select("company_name, website_url, gst_number, industry")
              .eq("user_id", user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
    ]);

    const userData = userResult.data;
    const profile = {
      display_name: userData?.display_name ?? user.user_metadata?.display_name ?? "",
      email: userData?.email ?? user.email ?? "",
      phone: userData?.phone ?? "",
      avatar_url: userData?.avatar_url ?? "",
    };

    let creator = null;
    let brand = null;

    if (role === "creator" && roleResult.data) {
      const d = roleResult.data as { instagram_handle?: string; bio?: string };
      creator = {
        instagram_handle: d.instagram_handle ?? "",
        bio: d.bio ?? "",
      };
    } else if (role === "brand" && roleResult.data) {
      const d = roleResult.data as { company_name?: string; website_url?: string; gst_number?: string; industry?: string };
      brand = {
        company_name: d.company_name ?? "",
        website_url: d.website_url ?? "",
        gst_number: d.gst_number ?? "",
        industry: d.industry ?? "",
      };
    }

    return NextResponse.json({ role, profile, creator, brand });
  } catch (err) {
    console.error("[settings/GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

/* ── PUT: update profile data ── */
export async function PUT(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const role = user.user_metadata?.role ?? "creator";
    const body = await req.json();

    // Run all updates in parallel
    const updates: Promise<{ error: { message: string } | null }>[] = [];

    if (body.profile) {
      updates.push(
        Promise.resolve(
          admin
            .from("users")
            .update({
              display_name: body.profile.display_name?.trim() || null,
              phone: body.profile.phone?.trim() || null,
            })
            .eq("id", user.id),
        ),
      );
      updates.push(
        supabase.auth.updateUser({
          data: { display_name: body.profile.display_name?.trim() },
        }) as unknown as Promise<{ error: { message: string } | null }>,
      );
    }

    if (role === "creator" && body.creator) {
      updates.push(
        Promise.resolve(
          admin
            .from("creators")
            .update({
              instagram_handle: body.creator.instagram_handle?.trim() || null,
              bio: body.creator.bio?.trim() || null,
            })
            .eq("user_id", user.id),
        ),
      );
    }

    if (role === "brand" && body.brand) {
      updates.push(
        Promise.resolve(
          admin
            .from("brands")
            .update({
              company_name: body.brand.company_name?.trim() || null,
              website_url: body.brand.website_url?.trim() || null,
              industry: body.brand.industry || null,
            })
            .eq("user_id", user.id),
        ),
      );
    }

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error("[settings/PUT] update error:", failed.error.message);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[settings/PUT]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
