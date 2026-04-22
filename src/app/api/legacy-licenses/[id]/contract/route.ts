// ─────────────────────────────────────────────────────────────────────────────
// GET /api/licenses/[id]/contract — presigned URL for the contract PDF
// Ref plan Task 23 / spec §6 contract audit trail
// ─────────────────────────────────────────────────────────────────────────────
//
// Returns:
//   { signed_url: string,           // 1-hour TTL by default
//     contract: { id, pdf_r2_path, pdf_hash_sha256, template_version, ... } }
//
// Access gate: creator/brand party + platform admins. Returns 404 with
// `error: 'contract_not_generated'` if the license is still in 'requested'
// state (no contract row exists yet). This is distinct from a missing
// license_request itself (→ 404 error: 'not_found').
//
// The presigned URL itself is unauthenticated — anyone holding the URL within
// its TTL can GET the PDF. We gate THIS endpoint so only authorised callers
// ever get a URL.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedContractUrl } from "@/lib/contracts";

interface ContractAdmin {
  from(table: string): {
    select(cols?: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as unknown as ContractAdmin;

  // ── 2. Resolve caller's roles in parallel ──────────────────────────────────
  const [creatorRes, brandRes, userRes, requestRes] = await Promise.all([
    admin
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("brands")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle(),
    admin
      .from("license_requests")
      .select("id, creator_id, brand_id, status")
      .eq("id", id)
      .maybeSingle(),
  ]);

  if (!requestRes.data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const requestRow = requestRes.data as {
    id: string;
    creator_id: string;
    brand_id: string;
    status: string;
  };

  const creatorId = (creatorRes.data as { id?: string } | null)?.id;
  const brandId = (brandRes.data as { id?: string } | null)?.id;
  const isAdmin =
    (userRes.data as { role?: string } | null)?.role === "admin";

  const isParty =
    (creatorId && creatorId === requestRow.creator_id) ||
    (brandId && brandId === requestRow.brand_id);

  if (!isParty && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // ── 3. Load the contract row (404 if not yet generated) ────────────────────
  const { data: contractRow, error: contractError } = await admin
    .from("license_contracts")
    .select(
      "id, license_request_id, pdf_r2_path, pdf_hash_sha256, template_version, creator_accepted_at, creator_accept_ip, creator_accept_user_agent, brand_accepted_at, brand_accept_ip, brand_accept_user_agent, terms_json, created_at",
    )
    .eq("license_request_id", requestRow.id)
    .maybeSingle();
  if (contractError) {
    console.error("[licenses/contract] lookup failed", contractError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!contractRow) {
    return NextResponse.json(
      {
        error: "contract_not_generated",
        message:
          "No contract exists yet for this license request — creator has not accepted.",
      },
      { status: 404 },
    );
  }

  const contract = contractRow as {
    id: string;
    license_request_id: string;
    pdf_r2_path: string;
    pdf_hash_sha256: string;
    template_version: string;
    creator_accepted_at: string;
    brand_accepted_at: string | null;
    terms_json: unknown;
    created_at: string;
  };

  // ── 4. Build a presigned URL for the R2 PDF ────────────────────────────────
  let signed_url: string;
  try {
    signed_url = await getSignedContractUrl(contract.pdf_r2_path);
  } catch (err) {
    console.error("[licenses/contract] presign failed", err);
    return NextResponse.json(
      { error: "presign_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    signed_url,
    contract,
  });
}
