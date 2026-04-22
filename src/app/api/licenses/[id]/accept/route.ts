// ─────────────────────────────────────────────────────────────────────────────
// POST /api/licenses/[id]/accept — creator signs the contract
// Ref plan Task 23 / spec §4.3 Step 3 + §6 click-to-accept audit trail
// ─────────────────────────────────────────────────────────────────────────────
//
// Pipeline:
//   1. Auth gate: user signed in; role=creator and owns the request.
//   2. Zod body: { scroll_depth_percent: 0-100 }.
//   3. Load license_request + sibling entity rows (creator user, brand).
//   4. assertTransition(status → 'accepted') — throws 409 if not legal.
//   5. Flip status to 'accepted' + stamp accepted_at + expires_at.
//   6. Generate contract markdown + frozen terms.
//   7. Render PDF via @react-pdf/renderer.
//   8. Upload PDF to R2 → get path + sha256.
//   9. Insert license_contracts row (IP + UA + scroll depth captured).
//  10. commitLicenseAcceptance — PL/pgSQL debits brand + sets status='active'.
//  11. Fire-and-forget 'license/accepted' inngest event.
//  12. Return { license_request: row-with-active-status, contract: row }.
//
// Error handling:
//   - If step 7/8/9 (PDF/R2/insert) fails, we roll back status to 'requested'
//     so the creator can retry. We do NOT release the reserve — that stays
//     until ledger commit actually debits.
//   - If step 10 (ledger commit) fails, we leave status='accepted' so an ops
//     operator can investigate — the contract row is already persisted.
//     Return 500. The inngest event is NOT fired (no successful transition).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/inngest/client";
import {
  AcceptLicenseSchema,
  assertTransition,
  type LicenseRequestRow,
  type LicenseState,
} from "@/domains/license/types";
import {
  generateContract,
  renderContractPdf,
  uploadContract,
  CONTRACT_CONSTANTS,
  type LicenseTemplate as ContractTemplateKey,
} from "@/lib/contracts";
import { commitLicenseAcceptance } from "@/lib/ledger/commit";

interface AcceptAdmin {
  from(table: string): {
    select(cols?: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
    update(patch: Record<string, unknown>): {
      eq(col: string, val: string): Promise<{
        error: { message: string } | null;
      }>;
    };
    insert(row: Record<string, unknown>): {
      select(): {
        single(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

interface LicenseRequestWithTemplate {
  id: string;
  creator_id: string;
  brand_id: string;
  status: LicenseState;
  template: ContractTemplateKey;
  base_paise: number;
  commission_paise: number;
  gst_on_commission_paise: number;
  total_paise: number;
  image_quota: number;
  validity_days: number;
  release_per_image_paise: number;
  requested_at: string;
  brand_notes: string | null;
}

function extractClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}

export async function POST(
  req: NextRequest,
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

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = AcceptLicenseSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { scroll_depth_percent } = parsed.data;

  const admin = createAdminClient() as unknown as AcceptAdmin;

  // ── 3. Role: creator ───────────────────────────────────────────────────────
  const { data: creatorRow } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!creatorRow) {
    return NextResponse.json(
      { error: "forbidden", reason: "only_creators_can_accept" },
      { status: 403 },
    );
  }
  const creatorId = (creatorRow as { id: string }).id;

  // ── 4. Load request ────────────────────────────────────────────────────────
  const { data: requestRow, error: requestError } = await admin
    .from("license_requests")
    .select(
      "id, creator_id, brand_id, status, template, base_paise, commission_paise, gst_on_commission_paise, total_paise, image_quota, validity_days, release_per_image_paise, requested_at, brand_notes",
    )
    .eq("id", id)
    .maybeSingle();
  if (requestError) {
    console.error("[licenses/accept] request lookup failed", requestError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!requestRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const request = requestRow as unknown as LicenseRequestWithTemplate;

  if (request.creator_id !== creatorId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // ── 5. State machine gate ──────────────────────────────────────────────────
  try {
    assertTransition(request.status, "accepted", "license accept");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "illegal_transition", message, current_status: request.status },
      { status: 409 },
    );
  }

  // ── 6. Load sibling party details for contract generation ─────────────────
  const { data: creatorUserRow } = await admin
    .from("users")
    .select("id, display_name, email")
    .eq("id", user.id)
    .maybeSingle();
  const creatorProfile = {
    display_name:
      ((creatorUserRow as { display_name?: string | null } | null)
        ?.display_name ??
        user.email?.split("@")[0] ??
        "Creator") as string,
    email: ((creatorUserRow as { email?: string } | null)?.email ??
      user.email ??
      "") as string,
    kyc_verified: true, // acceptance is already gated on KYC elsewhere; treat as verified
  };

  const { data: brandRow } = await admin
    .from("brands")
    .select("id, company_name, gst_number, billing_address, user_id")
    .eq("id", request.brand_id)
    .maybeSingle();
  if (!brandRow) {
    return NextResponse.json(
      { error: "brand_missing", message: "Brand profile not found" },
      { status: 500 },
    );
  }
  const brand = brandRow as {
    company_name?: string | null;
    gst_number?: string | null;
    billing_address?: string | null;
    user_id?: string | null;
  };

  // Pull brand's contact email via users table (1-1 relation on users.id).
  let brandEmail = "";
  if (brand.user_id) {
    const { data: brandUser } = await admin
      .from("users")
      .select("email")
      .eq("id", brand.user_id)
      .maybeSingle();
    brandEmail = ((brandUser as { email?: string } | null)?.email ?? "") as string;
  }

  // ── 7. Flip status to 'accepted' + stamp timestamps ────────────────────────
  const acceptedAt = new Date();
  const expiresAt = new Date(
    acceptedAt.getTime() + request.validity_days * 24 * 60 * 60 * 1000,
  );
  const { error: statusError } = await admin
    .from("license_requests")
    .update({
      status: "accepted",
      accepted_at: acceptedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq("id", request.id);
  if (statusError) {
    console.error("[licenses/accept] status flip failed", statusError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // ── 8-10. Contract generation + PDF + R2 upload ─────────────────────────────
  let contractR2Path: string;
  let contractSha256: string;
  let contractTerms: ReturnType<typeof generateContract>["terms"];
  try {
    const contractInput = {
      licenseRequest: {
        id: request.id,
        template: request.template,
        base_paise: request.base_paise,
        commission_paise: request.commission_paise,
        gst_on_commission_paise: request.gst_on_commission_paise,
        total_paise: request.total_paise,
        image_quota: request.image_quota,
        validity_days: request.validity_days,
        requested_at: request.requested_at,
        accepted_at: acceptedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        brand_notes: request.brand_notes ?? undefined,
      },
      creator: creatorProfile,
      brand: {
        company_name: (brand.company_name ?? "Brand") as string,
        gstin: brand.gst_number ?? undefined,
        address: brand.billing_address ?? undefined,
        contact_email: brandEmail,
      },
    };
    const { markdown, terms } = generateContract(contractInput);
    contractTerms = terms;
    const pdfBuffer = await renderContractPdf(markdown);
    const uploaded = await uploadContract({
      licenseRequestId: request.id,
      pdf: pdfBuffer,
    });
    contractR2Path = uploaded.r2Path;
    contractSha256 = uploaded.sha256;
  } catch (err) {
    console.error("[licenses/accept] contract generation failed", err);
    // Roll back the status flip so the creator can retry.
    await admin
      .from("license_requests")
      .update({
        status: "requested",
        accepted_at: null,
        expires_at: null,
      })
      .eq("id", request.id);
    const message = err instanceof Error ? err.message : "contract_failed";
    return NextResponse.json(
      { error: "contract_failed", message },
      { status: 500 },
    );
  }

  // ── 11. Insert license_contracts audit row ──────────────────────────────────
  const { data: contractRow, error: contractInsertError } = await admin
    .from("license_contracts")
    .insert({
      license_request_id: request.id,
      pdf_r2_path: contractR2Path,
      pdf_hash_sha256: contractSha256,
      template_version: CONTRACT_CONSTANTS.TEMPLATE_VERSION,
      creator_accepted_at: acceptedAt.toISOString(),
      creator_accept_ip: extractClientIp(req),
      creator_accept_user_agent: req.headers.get("user-agent") ?? "unknown",
      terms_json: {
        ...contractTerms,
        scroll_depth_percent,
      },
    })
    .select()
    .single();
  if (contractInsertError || !contractRow) {
    console.error("[licenses/accept] contract insert failed", contractInsertError);
    // Roll back status flip as above.
    await admin
      .from("license_requests")
      .update({
        status: "requested",
        accepted_at: null,
        expires_at: null,
      })
      .eq("id", request.id);
    return NextResponse.json(
      { error: "contract_persist_failed" },
      { status: 500 },
    );
  }

  // ── 12. Ledger commit: debits brand, inserts escrow, flips status → 'active'
  try {
    await commitLicenseAcceptance(request.id);
  } catch (err) {
    console.error("[licenses/accept] ledger commit failed", err);
    const message = err instanceof Error ? err.message : "ledger_failed";
    return NextResponse.json(
      { error: "ledger_failed", message },
      { status: 500 },
    );
  }

  // ── 13. Fire-and-forget inngest event ──────────────────────────────────────
  try {
    await inngest.send({
      name: "license/accepted",
      data: { license_request_id: request.id },
    });
  } catch (err) {
    // Inngest outage should not fail the 200 — the state is already correct.
    console.error("[licenses/accept] inngest send failed (non-fatal)", err);
  }

  // ── 14. Response ───────────────────────────────────────────────────────────
  return NextResponse.json({
    license_request: {
      ...request,
      status: "active" as LicenseState,
      accepted_at: acceptedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      activated_at: acceptedAt.toISOString(),
    } as unknown as LicenseRequestRow,
    contract: {
      id: (contractRow as { id: string }).id,
      pdf_r2_path: contractR2Path,
      pdf_hash_sha256: contractSha256,
      template_version: CONTRACT_CONSTANTS.TEMPLATE_VERSION,
    },
  });
}
