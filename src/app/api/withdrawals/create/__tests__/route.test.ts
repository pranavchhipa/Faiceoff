// ─────────────────────────────────────────────────────────────────────────────
// POST /api/withdrawals/create — route tests (DEPRECATED endpoint)
// ─────────────────────────────────────────────────────────────────────────────
//
// Creators no longer self-withdraw: the endpoint is retired and returns
// HTTP 410 Gone immediately, before any auth/DB work. The replacement is the
// "Request payout" flow (payout-service — covered by its own tests).
//
// The previous flow (auth gate → Zod min/max → KYC + bank gate → balance →
// withdrawal_requests insert → ledger deductions → Cashfree transfer) lives
// in git history; its tests were retired with it.
//
// Contract asserted here:
//   • 410 { error: "deprecated" } for EVERY request — authenticated or not,
//     valid old payload or garbage
//   • No Supabase client is ever constructed (no DB reads/writes)
//   • No external network calls
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();

// The route must not touch Supabase at all — these spies prove it. If the
// route ever regains DB behavior, these mocks make the tests fail loudly so
// the deprecation contract is revisited deliberately.
vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

async function callRoute(body: unknown) {
  const { POST } = await import("../route");
  const req = new Request("http://localhost/api/withdrawals/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return POST(req as unknown as Parameters<typeof POST>[0]);
}

describe("POST /api/withdrawals/create (deprecated)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => vi.clearAllMocks());

  it("410 for a valid legacy payload", async () => {
    const res = await callRoute({ amount_paise: 50_000 });
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe("deprecated");
    // Points creators at the replacement flow.
    expect(body.message).toContain("Request payout");
  });

  it("410 even for an unauthenticated request (auth is never consulted)", async () => {
    const res = await callRoute({ amount_paise: 50_000 });
    expect(res.status).toBe(410);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("410 even for below-minimum / above-maximum amounts (validation is never consulted)", async () => {
    const below = await callRoute({ amount_paise: 1 });
    expect(below.status).toBe(410);
    const above = await callRoute({ amount_paise: 200_000_000 });
    expect(above.status).toBe(410);
  });

  it("410 even for a garbage body (body is never read)", async () => {
    const res = await callRoute("not-json{{{");
    expect(res.status).toBe(410);
  });

  it("never constructs a Supabase client — no DB reads or writes", async () => {
    await callRoute({ amount_paise: 50_000 });
    expect(createClientMock).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("never makes external network calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await callRoute({ amount_paise: 50_000 });
    expect(res.status).toBe(410);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
