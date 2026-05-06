import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { instagram_handle, instagram_followers, youtube_handle, youtube_subscribers, bio } = await request.json();

  const admin = createAdminClient();

  // Get creator record. maybeSingle() so a missing row returns null
  // instead of throwing — consistent with the self-healing routes.
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (creatorErr) {
    return NextResponse.json({ error: creatorErr.message }, { status: 500 });
  }
  if (!creator) {
    return NextResponse.json(
      { error: "Creator profile not found" },
      { status: 404 },
    );
  }

  // Clean handles (strip leading @)
  const cleanHandle =
    typeof instagram_handle === "string" && instagram_handle.startsWith("@")
      ? instagram_handle.slice(1)
      : instagram_handle || null;

  const cleanYoutubeHandle =
    typeof youtube_handle === "string" && youtube_handle.startsWith("@")
      ? youtube_handle
      : youtube_handle
      ? `@${youtube_handle}`
      : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (admin as any)
    .from("creators")
    .update({
      instagram_handle: cleanHandle,
      instagram_followers: instagram_followers ? Number(instagram_followers) : null,
      youtube_handle: cleanYoutubeHandle,
      youtube_subscribers: youtube_subscribers ? Number(youtube_subscribers) : null,
      bio: bio || null,
    })
    .eq("id", creator.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
