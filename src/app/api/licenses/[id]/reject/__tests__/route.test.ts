// ─────────────────────────────────────────────────────────────────────────────
// POST /api/licenses/[id]/reject — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Pipeline:
//   1. Auth → creator role → owns request → status=requested
//   2. Zod body { reason: 10-500 chars }
//   3. commitCreditReleaseReserve (refunds the brand's held credits)
//   4. UPDATE license_requests SET status='rejected', creator_reject_reason
//   5. Fire-and-forget 'license/rejected' inngest event
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const commitCreditReleaseReserveMock = vi.fn();
const inngestSendMock = vi.fn();

interface AdminMocks {
  creatorLookup: ReturnType<typeof vi.fn>;
  requestLookup: ReturnType<typeof vi.fn>;
  requestUpdate: ReturnType<typeof vi.fn>;
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

vi.mock("@/lib/ledger/commit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ledger/commit")>(
    "@/lib/ledger/commit",
  );
  return {
    ...actual,
    commitCreditReleaseReserve: commitCreditReleaseReserveMock,
  };
});

vi.mock("@/inngest/client", () => ({
  inngest: { send: inngestSendMock },
}));

async function callReject(id: string, body: unknown) {
  const { POST } = await import("../route");
  const req = new Request(`http://localhost/api/licenses/${id}/reject`, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
        creator_id: "creator-1",
        brand_id: "brand-1",
        status: "requested",
        total_paise: 727440,
      },
      error: null,
    }),
    requestUpdate: vi.fn().mockResolvedValue({ error: null }),
  };
}

describe("POST /api/licenses/[id]/reject", () => {
  beforeEach(() => {
    adminMocks = defaultMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-creator" } },
      error: null,
    });
    commitCreditReleaseReserveMock.mockResolvedValue(undefined);
    inngestSendMock.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await callReject("lr-1", {
      reason: "Not a fit for my brand values",
    });
    expect(res.status).toBe(401);
  });

  it("403 when caller is not a creator", async () => {
    adminMocks.creatorLookup.mockResolvedValue({ data: null, error: null });
    const res = await callReject("lr-1", {
      reason: "Not a fit for my brand values",
    });
    expect(res.status).toBe(403);
  });

  it("400 when reason is too short (< 10 chars)", async () => {
    const res = await callReject("lr-1", { reason: "nope" });
    expect(res.status).toBe(400);
  });

  it("400 when reason is too long (> 500 chars)", async () => {
    const res = await callReject("lr-1", { reason: "x".repeat(501) });
    expect(res.status).toBe(400);
  });

  it("404 when request not found", async () => {
    adminMocks.requestLookup.mockResolvedValue({ data: null, error: null });
    const res = await callReject("lr-missing", {
      reason: "Does not apply to me",
    });
    expect(res.status).toBe(404);
  });

  it("403 when request belongs to another creator", async () => {
    adminMocks.requestLookup.mockResolvedValue({
      data: {
        id: "lr-x",
        creator_id: "other-creator",
        brand_id: "brand-1",
        status: "requested",
        total_paise: 727440,
      },
      error: null,
    });
    const res = await callReject("lr-x", {
      reason: "Does not apply to me",
    });
    expect(res.status).toBe(403);
  });

  it("409 when request is not in 'requested' state", async () => {
    adminMocks.requestLookup.mockResolvedValue({
      data: {
        id: "lr-1",
        creator_id: "creator-1",
        brand_id: "brand-1",
        status: "active",
        total_paise: 727440,
      },
      error: null,
    });
    const res = await callReject("lr-1", {
      reason: "Does not apply to me",
    });
    expect(res.status).toBe(409);
  });

  it("happy path: releases reserve, flips status, fires inngest", async () => {
    const res = await callReject("lr-1", {
      reason: "Does not align with my brand values",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.license_request.status).toBe("rejected");

    expect(commitCreditReleaseReserveMock).toHaveBeenCalledWith({
      brandId: "brand-1",
      amountPaise: 727440,
      refType: "license_request",
      refId: "lr-1",
    });
    expect(adminMocks.requestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "rejected",
        creator_reject_reason: "Does not align with my brand values",
      }),
      "id",
      "lr-1",
    );
    expect(inngestSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "license/rejected",
        data: expect.objectContaining({ license_request_id: "lr-1" }),
      }),
    );
  });

  it("500 when commitCreditReleaseReserve fails", async () => {
    commitCreditReleaseReserveMock.mockRejectedValue(
      new Error("commit_credit_release_reserve failed: brand not found"),
    );
    const res = await callReject("lr-1", {
      reason: "Does not align with my brand values",
    });
    expect(res.status).toBe(500);
    // Status flip must not happen if release failed.
    expect(adminMocks.requestUpdate).not.toHaveBeenCalled();
    // Inngest must not fire if release failed.
    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});
