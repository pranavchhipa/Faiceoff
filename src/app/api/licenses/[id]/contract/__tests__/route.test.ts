// ─────────────────────────────────────────────────────────────────────────────
// GET /api/licenses/[id]/contract — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Returns a presigned R2 URL for the contract PDF. Access is gated to
// creator/brand parties + admins. Returns 404 if the contract has not yet
// been generated (i.e. license_request is still in 'requested' state).
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const getSignedContractUrlMock = vi.fn();

interface AdminMocks {
  creatorLookup: ReturnType<typeof vi.fn>;
  brandLookup: ReturnType<typeof vi.fn>;
  userLookup: ReturnType<typeof vi.fn>;
  requestLookup: ReturnType<typeof vi.fn>;
  contractLookup: ReturnType<typeof vi.fn>;
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
      if (table === "brands") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.brandLookup }),
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
      if (table === "license_requests") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.requestLookup }),
          }),
        };
      }
      if (table === "license_contracts") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.contractLookup }),
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

// Full stub — avoid loading storage.ts which requires R2_* env vars at import.
vi.mock("@/lib/contracts", () => ({
  getSignedContractUrl: getSignedContractUrlMock,
  DEFAULT_SIGNED_URL_TTL_SECONDS: 3600,
}));

async function callGet(id: string) {
  const { GET } = await import("../route");
  const req = new Request(`http://localhost/api/licenses/${id}/contract`, {
    method: "GET",
  });
  return GET(req as unknown as Parameters<typeof GET>[0], {
    params: Promise.resolve({ id }),
  } as Parameters<typeof GET>[1]);
}

function defaultMocks(): AdminMocks {
  return {
    creatorLookup: vi.fn().mockResolvedValue({ data: null, error: null }),
    brandLookup: vi
      .fn()
      .mockResolvedValue({ data: { id: "brand-1" }, error: null }),
    userLookup: vi
      .fn()
      .mockResolvedValue({ data: { role: "brand" }, error: null }),
    requestLookup: vi.fn().mockResolvedValue({
      data: {
        id: "lr-1",
        creator_id: "creator-1",
        brand_id: "brand-1",
        status: "active",
      },
      error: null,
    }),
    contractLookup: vi.fn().mockResolvedValue({
      data: {
        id: "contract-1",
        license_request_id: "lr-1",
        pdf_r2_path: "contracts/lr-1/v1.pdf",
        pdf_hash_sha256: "deadbeef".repeat(8),
        template_version: "v1.2026-04",
        creator_accepted_at: "2026-04-22T10:00:00Z",
      },
      error: null,
    }),
  };
}

describe("GET /api/licenses/[id]/contract", () => {
  beforeEach(() => {
    adminMocks = defaultMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-brand" } },
      error: null,
    });
    getSignedContractUrlMock.mockResolvedValue(
      "https://r2.example.com/signed-url",
    );
  });

  afterEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await callGet("lr-1");
    expect(res.status).toBe(401);
  });

  it("404 when license_request does not exist", async () => {
    adminMocks.requestLookup.mockResolvedValue({ data: null, error: null });
    const res = await callGet("lr-missing");
    expect(res.status).toBe(404);
  });

  it("403 when caller is neither party nor admin", async () => {
    adminMocks.brandLookup.mockResolvedValue({ data: null, error: null });
    adminMocks.creatorLookup.mockResolvedValue({ data: null, error: null });
    adminMocks.userLookup.mockResolvedValue({
      data: { role: "brand" },
      error: null,
    });
    const res = await callGet("lr-1");
    expect(res.status).toBe(403);
  });

  it("403 when caller is a different brand", async () => {
    adminMocks.brandLookup.mockResolvedValue({
      data: { id: "different-brand" },
      error: null,
    });
    const res = await callGet("lr-1");
    expect(res.status).toBe(403);
  });

  it("404 when contract does not yet exist", async () => {
    adminMocks.contractLookup.mockResolvedValue({ data: null, error: null });
    const res = await callGet("lr-1");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("contract_not_generated");
  });

  it("happy path: brand party sees signed URL", async () => {
    const res = await callGet("lr-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.signed_url).toBe("https://r2.example.com/signed-url");
    expect(body.contract).toMatchObject({
      id: "contract-1",
      pdf_r2_path: "contracts/lr-1/v1.pdf",
      template_version: "v1.2026-04",
    });
    expect(getSignedContractUrlMock).toHaveBeenCalledWith(
      "contracts/lr-1/v1.pdf",
    );
  });

  it("happy path: creator party sees signed URL", async () => {
    adminMocks.brandLookup.mockResolvedValue({ data: null, error: null });
    adminMocks.creatorLookup.mockResolvedValue({
      data: { id: "creator-1" },
      error: null,
    });
    const res = await callGet("lr-1");
    expect(res.status).toBe(200);
  });

  it("admin sees signed URL regardless of party", async () => {
    adminMocks.brandLookup.mockResolvedValue({ data: null, error: null });
    adminMocks.creatorLookup.mockResolvedValue({ data: null, error: null });
    adminMocks.userLookup.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    });
    const res = await callGet("lr-1");
    expect(res.status).toBe(200);
  });
});
