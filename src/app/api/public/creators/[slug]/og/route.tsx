import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_CATEGORIES, type DemoCategoryKey } from "@/lib/profile/demo-prompts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export const runtime = "nodejs";

/**
 * GET /api/public/creators/[slug]/og
 *
 * Dynamic 1200×630 OG image for WhatsApp / Twitter / Slack previews.
 * Shows avatar + handle + categories + the platform wordmark.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const admin = createAdminClient() as Admin;

  const { data: creator } = await admin
    .from("creators")
    .select(
      "id, user_id, profile_slug, profile_published, instagram_handle, instagram_followers, instagram_profile_pic_url, selected_categories",
    )
    .eq("profile_slug", slug.toLowerCase())
    .eq("profile_published", true)
    .maybeSingle();

  const fallback = !creator;

  let displayName = "Creator";
  let avatarUrl: string | null = null;
  let handle: string | null = null;
  let followers: number | null = null;
  let categories: DemoCategoryKey[] = [];

  if (creator) {
    const { data: u } = await admin
      .from("users")
      .select("display_name, avatar_url")
      .eq("id", creator.user_id)
      .maybeSingle();
    displayName =
      u?.display_name ?? creator.instagram_handle ?? "Faiceoff Creator";
    avatarUrl = creator.instagram_profile_pic_url ?? u?.avatar_url ?? null;
    handle = creator.instagram_handle;
    followers = creator.instagram_followers;
    categories = (creator.selected_categories ?? []) as DemoCategoryKey[];
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background:
            "linear-gradient(135deg, #1a1410 0%, #2a1f15 50%, #1a1410 100%)",
          color: "#f5e9d3",
          display: "flex",
          flexDirection: "column",
          padding: "60px 70px",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Decorative gradient blob */}
        <div
          style={{
            position: "absolute",
            top: "-200px",
            right: "-200px",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(201,169,110,0.45) 0%, rgba(201,169,110,0) 70%)",
            display: "flex",
          }}
        />

        {/* Brand bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "18px",
            fontWeight: 700,
            letterSpacing: "-0.01em",
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #c9a96e 0%, #8b6914 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              color: "#1a1410",
              fontWeight: 800,
            }}
          >
            F
          </div>
          <span>
            Faiceoff<span style={{ color: "#c9a96e" }}>.</span>
          </span>
          <span style={{ color: "#8b7355", marginLeft: "16px", fontSize: "14px" }}>
            India&apos;s AI face licensing marketplace
          </span>
        </div>

        {fallback ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "48px",
              fontWeight: 800,
            }}
          >
            Creator not found
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: "50px",
              marginTop: "20px",
              zIndex: 1,
            }}
          >
            {/* Avatar */}
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img
                src={avatarUrl}
                width="280"
                height="280"
                style={{
                  width: "280px",
                  height: "280px",
                  borderRadius: "140px",
                  objectFit: "cover",
                  border: "6px solid rgba(201,169,110,0.6)",
                  display: "flex",
                }}
              />
            ) : (
              <div
                style={{
                  width: "280px",
                  height: "280px",
                  borderRadius: "140px",
                  background:
                    "linear-gradient(135deg, #c9a96e 0%, #8b6914 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "110px",
                  fontWeight: 800,
                  color: "#1a1410",
                }}
              >
                {displayName[0]?.toUpperCase()}
              </div>
            )}

            {/* Right column */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "14px",
                  color: "#10b981",
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                ● Verified Creator
              </div>

              <div
                style={{
                  fontSize: "72px",
                  fontWeight: 800,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.0,
                  color: "#f5e9d3",
                  display: "flex",
                }}
              >
                {displayName}
              </div>

              {handle && (
                <div
                  style={{
                    fontSize: "22px",
                    color: "#a89570",
                    display: "flex",
                  }}
                >
                  @{handle}
                  {followers !== null && followers > 0 && (
                    <span style={{ marginLeft: "20px", color: "#8b7355" }}>
                      · {followers.toLocaleString("en-IN")} followers
                    </span>
                  )}
                </div>
              )}

              {/* Category chips */}
              {categories.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    marginTop: "10px",
                  }}
                >
                  {categories.slice(0, 4).map((key) => {
                    const def = DEMO_CATEGORIES[key];
                    return (
                      <div
                        key={key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          background: "rgba(201,169,110,0.15)",
                          border: "1px solid rgba(201,169,110,0.35)",
                          color: "#f5e9d3",
                          padding: "8px 14px",
                          borderRadius: "20px",
                          fontSize: "16px",
                          fontWeight: 600,
                        }}
                      >
                        <span>{def.emoji}</span>
                        {def.label}
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                style={{
                  marginTop: "16px",
                  fontSize: "20px",
                  color: "#a89570",
                  display: "flex",
                }}
              >
                Launch a campaign · Skip the shoot · Pay on approval
              </div>
            </div>
          </div>
        )}

        {/* Footer URL */}
        <div
          style={{
            fontSize: "16px",
            color: "#8b7355",
            fontFamily: "monospace",
            marginTop: "10px",
            zIndex: 1,
            display: "flex",
          }}
        >
          faiceoff.com/creators/{slug}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      // Cache OG images for 1 hour at the edge
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
    },
  );
}
