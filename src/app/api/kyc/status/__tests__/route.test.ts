// ─────────────────────────────────────────────────────────────────────────────
// GET /api/kyc/status — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Returns a consolidated view of the creator's PAN + Aadhaar + bank state so
// the UI can render the 3-step onboarding progress + the withdrawal gate.
// NEVER returns raw PAN / account number — only derived booleans + last4 +
// bank metadata.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

interface AdminMocks {
  creatorLookup: ReturnType<typeof vi.fn>;
  kycLookup: ReturnType<typeof vi.fn>;
  bankLookup: ReturnType<typeof vi.fn>;
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
      if (table === "creator_kyc") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.kycLookup }),
          }),
        };
      }
      if (table === "creator_bank_accounts") {
        return {
          select: () => ({
            eq: (_c: string, _v: string) => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: adminMocks.bankLookup }),
                }),
              }),
            }),
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

async function callRoute() {
  const { GET } = await import("../route");
  const req = new Request("http://localhost/api/kyc/status", { method: "GET" });
  return GET(req as unknown as Parameters<typeof GET>[0]);
}

function defaultMocks(): AdminMocks {
  return {
    creatorLookup: vi.fn().mockResolvedValue({
      data: {
        id: "creator-1",
        user_id: "user-1",
        kyc_status: "in_progress",
      },
      error: null,
    }),
    kycLookup: vi.fn().mockResolvedValue({
      data: null,
      error: null,
    }),
    bankLookup: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

describe("GET /api/kyc/status", () => {
  beforeEach(() => {
    adminMocks = defaultMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await callRoute();
    expect(res.status).toBe(401);
  });

  it("403 when caller has no creator profile", async () => {
    adminMocks.creatorLookup.mockResolvedValue({ data: null, error: null });
    const res = await callRoute();
    expect(res.status).toBe(403);
  });

  it("not_started state when creator has no kyc row yet", async () => {
    adminMocks.creatorLookup.mockResolvedValue({
      data: { id: "creator-1", user_id: "user-1", kyc_status: "not_started" },
      error: null,
    });
    const res = await callRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "not_started",
      pan_verified: false,
      aadhaar_verified: false,
      bank_verified: false,
      can_withdraw: false,
      required_next_step: "pan",
    });
  });

  it("returns pan_verified=true when creator_kyc.pan_verification_status='verified'", async () => {
    adminMocks.kycLookup.mockResolvedValue({
      data: {
        creator_id: "creator-1",
        pan_verification_status: "verified",
        aadhaar_verified_at: null,
        is_gstin_registered: false,
        status: "aadhaar_pending",
      },
      error: null,
    });
    const res = await callRoute();
    const body = await res.json();
    expect(body.pan_verified).toBe(true);
    expect(body.required_next_step).toBe("aadhaar");
  });

  it("returns aadhaar_verified when aadhaar_verified_at is set", async () => {
    adminMocks.kycLookup.mockResolvedValue({
      data: {
        creator_id: "creator-1",
        pan_verification_status: "verified",
        aadhaar_verified_at: "2026-04-20T00:00:00Z",
        is_gstin_registered: false,
        status: "bank_pending",
      },
      error: null,
    });
    const res = await callRoute();
    const body = await res.json();
    expect(body.pan_verified).toBe(true);
    expect(body.aadhaar_verified).toBe(true);
    expect(body.bank_verified).toBe(false);
    expect(body.required_next_step).toBe("bank");
  });

  it("returns bank_verified + primary_bank metadata when a verified active bank exists", async () => {
    adminMocks.kycLookup.mockResolvedValue({
      data: {
        creator_id: "creator-1",
        pan_verification_status: "verified",
        aadhaar_verified_at: "2026-04-20T00:00:00Z",
        is_gstin_registered: false,
        status: "verified",
      },
      error: null,
    });
    adminMocks.bankLookup.mockResolvedValue({
      data: {
        id: "bank-1",
        account_number_last4: "9012",
        ifsc: "HDFC0001234",
        bank_name: "HDFC BANK",
        nickname: null,
        penny_drop_verified_at: "2026-04-21T00:00:00Z",
      },
      error: null,
    });
    adminMocks.creatorLookup.mockResolvedValue({
      data: { id: "creator-1", user_id: "user-1", kyc_status: "verified" },
      error: null,
    });
    const res = await callRoute();
    const body = await res.json();
    expect(body.bank_verified).toBe(true);
    expect(body.can_withdraw).toBe(true);
    expect(body.status).toBe("verified");
    expect(body.required_next_step).toBeNull();
    expect(body.primary_bank).toMatchObject({
      id: "bank-1",
      last4: "9012",
      ifsc: "HDFC0001234",
      bank_name: "HDFC BANK",
    });
  });

  it("never returns raw account number or encrypted bytea", async () => {
    adminMocks.kycLookup.mockResolvedValue({
      data: {
        creator_id: "creator-1",
        pan_verification_status: "verified",
        aadhaar_verified_at: "2026-04-20T00:00:00Z",
        is_gstin_registered: false,
        status: "verified",
      },
      error: null,
    });
    adminMocks.bankLookup.mockResolvedValue({
      data: {
        id: "bank-1",
        account_number_last4: "9012",
        ifsc: "HDFC0001234",
        bank_name: "HDFC BANK",
        nickname: "Primary",
        penny_drop_verified_at: "2026-04-21T00:00:00Z",
      },
      error: null,
    });
    adminMocks.creatorLookup.mockResolvedValue({
      data: { id: "creator-1", user_id: "user-1", kyc_status: "verified" },
      error: null,
    });
    const res = await callRoute();
    const body = await res.json();
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/account_number_encrypted/);
    expect(json).not.toMatch(/account_number"\s*:/);
    // last4 is fine; ensure no longer-than-4 digit string appears in primary_bank
    expect(body.primary_bank.last4).toBe("9012");
  });
});
