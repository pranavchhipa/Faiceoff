/**
 * GET /api/licenses/[id]/cert
 *
 * Stream the licence certificate PDF for a single licence row.
 *
 * Why this exists (vs. linking the public R2 URL directly):
 *  • Defends against R2 public-URL misconfig — fetches via authenticated
 *    S3 client and re-streams, so the file works even if the bucket isn't
 *    public-read enabled or `R2_PUBLIC_URL` is missing.
 *  • Auth-gates the cert: only the brand or creator on the licence can
 *    download. Public verify still uses /verify/[license_id].
 *  • Sets a clean filename + inline disposition so the PDF previews in-tab
 *    instead of showing the raw R2 path.
 */

import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { r2Client, R2_BUCKET_NAME } from "@/lib/storage/r2-client";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Load the licence + verify caller is the brand or the creator on it
  const { data: lic } = await admin
    .from("licenses")
    .select("id, brand_id, creator_id")
    .eq("id", id)
    .maybeSingle();
  if (!lic) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [{ data: brand }, { data: creator }] = await Promise.all([
    admin.from("brands").select("id").eq("user_id", user.id).maybeSingle(),
    admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
  ]);
  const isParty =
    (brand?.id && brand.id === lic.brand_id) ||
    (creator?.id && creator.id === lic.creator_id);
  if (!isParty) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Fetch the PDF from R2 via the S3 SDK (works regardless of public-read)
  let body: Uint8Array;
  try {
    const cmd = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: `certs/${id}.pdf`,
    });
    const res = await r2Client.send(cmd);
    if (!res.Body) {
      return NextResponse.json(
        { error: "cert_missing", message: "Certificate not yet generated" },
        { status: 404 },
      );
    }
    // Body is a Readable stream in Node
    const stream = res.Body as unknown as {
      transformToByteArray: () => Promise<Uint8Array>;
    };
    body = await stream.transformToByteArray();
  } catch (err) {
    console.error("[licenses/cert] R2 fetch failed", err);
    return NextResponse.json(
      { error: "fetch_failed", message: "Could not retrieve certificate" },
      { status: 502 },
    );
  }

  return new NextResponse(body as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(body.length),
      "Content-Disposition": `inline; filename="faiceoff-license-${id}.pdf"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
