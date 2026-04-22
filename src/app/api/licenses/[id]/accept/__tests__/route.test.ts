// ─────────────────────────────────────────────────────────────────────────────
// POST /api/licenses/[id]/accept — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// The accept route performs the full click-to-accept flow:
//   1. auth → creator role → owns request → status=requested
//   2. flip status to 'accepted' + stamp accepted_at + expires_at
//   3. generateContract → renderContractPdf → uploadContract (R2)
//   4. insert license_contracts audit row (IP + UA + SHA256 + terms_json)
//   5. commitLicenseAcceptance (PL/pgSQL: debits brand, locks escrow, status→active)
//   6. inngest.send('license/accepted', ...)  fire-and-forget
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const generateContractMock = vi.fn();
const renderContractPdfMock = vi.fn();
const uploadContractMock = vi.fn();
const commitLicenseAcceptanceMock = vi.fn();
const inngestSendMock = vi.fn();

interface AdminMocks {
  creatorLookup: ReturnType<typeof vi.fn>;
  requestLookup: ReturnType<typeof vi.fn>;
  requestUpdate: ReturnType<typeof vi.fn>;
  userLookup: ReturnType<typeof vi.fn>;
  brandUserLookup: ReturnType<typeof vi.fn>;
  contractInsert: ReturnType<typeof vi.fn>;
}

let adminMocks: AdminMocks;

function buildAdminClient() {
  return {
    from(table: string) {
      if (table === "creators") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.creatorLookup }),
          }),
        };
      }
      if (table === "license_requests") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.requestLookup }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (col: string, val: string) =>
              (adminMocks.requestUpdate as (
                p: Record<string, unknown>,
                c: string,
                v: string,
              ) => Promise<{ error: unknown }>)(patch, col, val),
          }),
        };
      }
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.userLookup }),
          }),
        };
      }
      if (table === "brands") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.brandUserLookup }),
          }),
        };
      }
      if (table === "license_contracts") {
        return {
          insert: () => ({
            select: () => ({ single: adminMocks.contractInsert }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: getUserMock } }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => buildAdminClient(),
}));

// NOTE: full stub (no importActual) — importActual loads storage.ts which
// evaluates the R2 client at module-init and requires R2_* env vars.
vi.mock("@/lib/contracts", () => ({
  CONTRACT_CONSTANTS: {
    TEMPLATE_VERSION: "v1.2026-04",
    GOVERNING_LAW: "Laws of India",
    JURISDICTION: "Mumbai, Maharashtra, India",
    PLATFORM_ENTITY_NAME: "Faiceoff Platform Pvt. Ltd.",
  },
  generateContract: generateContractMock,
  renderContractPdf: renderContractPdfMock,
  uploadContract: uploadContractMock,
  getSignedContractUrl: vi.fn(),
  DEFAULT_SIGNED_URL_TTL_SECONDS: 3600,
  CONTRACTS_BUCKET_DEFAULT: "faiceoff-contracts",
}));

vi.mock("@/lib/ledger/commit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ledger/commit")>(
    "@/lib/ledger/commit",
  );
  return {
    ...actual,
    commitLicenseAcceptance: commitLicenseAcceptanceMock,
  };
});

vi.mock("@/inngest/client", () => ({
  inngest: { send: inngestSendMock },
}));

async function callAccept(id: string, body: unknown) {
  const { POST } = await import("../route");
  const req = new Request(`http://localhost/api/licenses/${id}/accept`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "vitest/mock",
      "x-forwarded-for": "203.0.113.1",
    },
    body: JSON.stringify(body),
  });
  return POST(req as unknown as Parameters<typeof POST>[0], {
    params: Promise.resolve({ id }),
  } as Parameters<typeof POST>[1]);
}

function defaultMocks(): AdminMocks {
  return {
    creatorLookup: vi.fn().mockResolvedValue({
      data: { id: "creator-1" },
      error: null,
    }),
    requestLookup: vi.fn().mockResolvedValue({
      data: {
        id: "lr-1",
        listing_id: "listing-1",
        creator_id: "creator-1",
        brand_id: "brand-1",
        status: "requested",
        template: "creation",
        base_paise: 600000,
        commission_paise: 108000,
        gst_on_commission_paise: 19440,
        total_paise: 727440,
        image_quota: 25,
        validity_days: 90,
        release_per_image_paise: 24000,
        requested_at: "2026-04-22T00:00:00Z",
        brand_notes: null,
      },
      error: null,
    }),
    requestUpdate: vi.fn().mockResolvedValue({ error: null }),
    userLookup: vi.fn().mockResolvedValue({
      data: {
        id: "user-creator",
        display_name: "Priya",
        email: "priya@example.com",
      },
      error: null,
    }),
    brandUserLookup: vi.fn().mockResolvedValue({
      data: {
        id: "brand-1",
        company_name: "Acme Co",
        gst_number: "29ABCDE1234F1Z5",
        billing_address: "Bengaluru, KA",
        user_id: "user-brand",
        users: { email: "brand@acme.com" },
      },
      error: null,
    }),
    contractInsert: vi.fn().mockResolvedValue({
      data: { id: "contract-1" },
      error: null,
    }),
  };
}

describe("POST /api/licenses/[id]/accept", () => {
  beforeEach(() => {
    adminMocks = defaultMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-creator", email: "priya@example.com" } },
      error: null,
    });
    generateContractMock.mockReturnValue({
      markdown: "# License Agreement",
      terms: {
        template_version: "v1.2026-04",
        license_request_id: "lr-1",
        template: "creation",
        base_paise: 600000,
        commission_paise: 108000,
        gst_on_commission_paise: 19440,
        total_paise: 727440,
        image_quota: 25,
        validity_days: 90,
        accepted_at: "2026-04-22T10:00:00Z",
        expires_at: "2026-07-21T10:00:00Z",
        jurisdiction: "Mumbai, Maharashtra, India",
        governing_law: "Laws of India",
      },
    });
    renderContractPdfMock.mockResolvedValue(Buffer.from("PDF-BYTES"));
    uploadContractMock.mockResolvedValue({
      r2Path: "contracts/lr-1/v1.pdf",
      sha256: "deadbeef".repeat(8),
    });
    commitLicenseAcceptanceMock.mockResolvedValue(undefined);
    inngestSendMock.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await callAccept("lr-1", { scroll_depth_percent: 100 });
    expect(res.status).toBe(401);
  });

  it("403 when caller is not a creator", async () => {
    adminMocks.creatorLookup.mockResolvedValue({ data: null, error: null });
    const res = await callAccept("lr-1", { scroll_depth_percent: 100 });
    expect(res.status).toBe(403);
  });

  it("400 when body fails Zod (scroll_depth_percent missing)", async () => {
    const res = await callAccept("lr-1", {});
    expect(res.status).toBe(400);
  });

  it("400 when scroll_depth_percent > 100", async () => {
    const res = await callAccept("lr-1", { scroll_depth_percent: 500 });
    expect(res.status).toBe(400);
  });

  it("404 when license_request not found", async () => {
    adminMocks.requestLookup.mockResolvedValue({ data: null, error: null });
    const res = await callAccept("lr-missing", { scroll_depth_percent: 100 });
    expect(res.status).toBe(404);
  });

  it("403 when request belongs to different creator", async () => {
    adminMocks.requestLookup.mockResolvedValue({
      data: {
        id: "lr-x",
        creator_id: "other-creator",
        brand_id: "brand-1",
        status: "requested",
        template: "creation",
        base_paise: 600000,
        commission_paise: 108000,
        gst_on_commission_paise: 19440,
        total_paise: 727440,
        image_quota: 25,
        validity_days: 90,
        release_per_image_paise: 24000,
        requested_at: "2026-04-22T00:00:00Z",
        brand_notes: null,
      },
      error: null,
    });
    const res = await callAccept("lr-x", { scroll_depth_percent: 100 });
    expect(res.status).toBe(403);
  });

  it("409 when status is not 'requested' (already accepted)", async () => {
    adminMocks.requestLookup.mockResolvedValue({
      data: {
        id: "lr-1",
        creator_id: "creator-1",
        brand_id: "brand-1",
        status: "active",
        template: "creation",
        base_paise: 600000,
        commission_paise: 108000,
        gst_on_commission_paise: 19440,
        total_paise: 727440,
        image_quota: 25,
        validity_days: 90,
        release_per_image_paise: 24000,
        requested_at: "2026-04-22T00:00:00Z",
        brand_notes: null,
      },
      error: null,
    });
    const res = await callAccept("lr-1", { scroll_depth_percent: 100 });
    expect(res.status).toBe(409);
  });

  it("happy path: full accept flow", async () => {
    const res = await callAccept("lr-1", { scroll_depth_percent: 100 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.license_request.status).toBe("active");
    expect(body.contract).toMatchObject({
      id: "contract-1",
      pdf_r2_path: "contracts/lr-1/v1.pdf",
    });

    // Flow order:
    //   requestUpdate status→accepted
    //   generateContract
    //   renderContractPdf
    //   uploadContract
    //   contractInsert
    //   commitLicenseAcceptance
    //   inngest.send
    expect(generateContractMock).toHaveBeenCalled();
    expect(renderContractPdfMock).toHaveBeenCalledWith("# License Agreement");
    expect(uploadContractMock).toHaveBeenCalledWith({
      licenseRequestId: "lr-1",
      pdf: expect.any(Buffer),
    });
    expect(adminMocks.contractInsert).toHaveBeenCalled();
    expect(commitLicenseAcceptanceMock).toHaveBeenCalledWith("lr-1");
    expect(inngestSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "license/accepted",
        data: expect.objectContaining({ license_request_id: "lr-1" }),
      }),
    );
  });

  it("500 when contract upload blows up", async () => {
    uploadContractMock.mockRejectedValue(new Error("R2 is down"));
    const res = await callAccept("lr-1", { scroll_depth_percent: 100 });
    expect(res.status).toBe(500);
    // Ledger commit must NOT be called if upload failed.
    expect(commitLicenseAcceptanceMock).not.toHaveBeenCalled();
  });

  it("500 when commitLicenseAcceptance fails (does not fire inngest)", async () => {
    commitLicenseAcceptanceMock.mockRejectedValue(
      new Error("commit_license_acceptance failed: insufficient credits"),
    );
    const res = await callAccept("lr-1", { scroll_depth_percent: 100 });
    expect(res.status).toBe(500);
    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});
