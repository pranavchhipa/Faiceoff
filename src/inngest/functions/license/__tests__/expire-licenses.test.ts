// ─────────────────────────────────────────────────────────────────────────────
// expire-licenses — unit tests for the pure `runExpireLicenses` helper.
// ─────────────────────────────────────────────────────────────────────────────
//
// We test the extracted helper rather than the Inngest function wrapper
// directly, because the wrapper is 3 lines that pass through to the helper —
// building a fake Inngest function runtime would add no coverage.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runExpireLicenses,
  type ExpireLicensesAdmin,
  type MinimalLogger,
  type MinimalStep,
} from "../expire-licenses";

// Passthrough step: runs the handler synchronously so we can observe calls
// to the admin client directly.
function makeStep(): MinimalStep {
  return {
    async run<T>(_id: string, fn: () => Promise<T>): Promise<T> {
      return fn();
    },
  };
}

type LoggerFn = (msg: string, meta?: unknown) => void;

function makeLogger(): MinimalLogger & {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  return {
    info: vi.fn<LoggerFn>(),
    warn: vi.fn<LoggerFn>(),
    error: vi.fn<LoggerFn>(),
  };
}

interface MockState {
  expiredRows: Array<{ id: string }>;
  fetchError: { message: string } | null;
  rpcResult: Map<string, { error: { message: string } | null }>;
}

function makeAdmin(state: MockState): ExpireLicensesAdmin & {
  rpc: ReturnType<typeof vi.fn>;
  selectSpy: ReturnType<typeof vi.fn>;
} {
  const rpc = vi.fn(
    async (
      _name: "commit_expiry_refund",
      params: { p_license_request_id: string },
    ) => {
      const result = state.rpcResult.get(params.p_license_request_id) ?? {
        error: null,
      };
      return { data: null, error: result.error };
    },
  );
  const selectSpy = vi.fn();

  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          selectSpy();
          return {
            eq(_col: string, _val: string) {
              return {
                lt(_col2: string, _val2: string) {
                  return {
                    async limit(_n: number) {
                      return {
                        data: state.expiredRows,
                        error: state.fetchError,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    rpc,
    selectSpy,
  } as ExpireLicensesAdmin & {
    rpc: ReturnType<typeof vi.fn>;
    selectSpy: ReturnType<typeof vi.fn>;
  };
}

describe("runExpireLicenses", () => {
  let state: MockState;

  beforeEach(() => {
    state = {
      expiredRows: [],
      fetchError: null,
      rpcResult: new Map(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("no-op when no expired licenses", async () => {
    const admin = makeAdmin(state);
    const step = makeStep();
    const logger = makeLogger();

    const result = await runExpireLicenses({ admin, step, logger });

    expect(result).toEqual({ expired_count: 0, refunded: 0, errors: [] });
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("No expired licenses"),
    );
  });

  it("calls commit_expiry_refund once per expired row", async () => {
    state.expiredRows = [{ id: "lr-1" }, { id: "lr-2" }, { id: "lr-3" }];
    const admin = makeAdmin(state);
    const step = makeStep();
    const logger = makeLogger();

    const result = await runExpireLicenses({ admin, step, logger });

    expect(result).toEqual({
      expired_count: 3,
      refunded: 3,
      errors: [],
    });
    expect(admin.rpc).toHaveBeenCalledTimes(3);
    expect(admin.rpc).toHaveBeenNthCalledWith(1, "commit_expiry_refund", {
      p_license_request_id: "lr-1",
    });
    expect(admin.rpc).toHaveBeenNthCalledWith(2, "commit_expiry_refund", {
      p_license_request_id: "lr-2",
    });
    expect(admin.rpc).toHaveBeenNthCalledWith(3, "commit_expiry_refund", {
      p_license_request_id: "lr-3",
    });
  });

  it("one failing row does not crash the whole job", async () => {
    state.expiredRows = [{ id: "lr-ok-1" }, { id: "lr-bad" }, { id: "lr-ok-2" }];
    state.rpcResult.set("lr-bad", { error: { message: "rpc blew up" } });
    const admin = makeAdmin(state);
    const step = makeStep();
    const logger = makeLogger();

    const result = await runExpireLicenses({ admin, step, logger });

    expect(result.expired_count).toBe(3);
    expect(result.refunded).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toEqual({
      id: "lr-bad",
      error: expect.stringContaining("rpc blew up"),
    });
    // All three rows were attempted
    expect(admin.rpc).toHaveBeenCalledTimes(3);
    // Error path logs at least once
    expect(logger.error).toHaveBeenCalled();
  });

  it("uses provided `now` so 'expires_at < now' is deterministic in tests", async () => {
    state.expiredRows = [{ id: "lr-1" }];
    const admin = makeAdmin(state);
    const step = makeStep();
    const logger = makeLogger();
    const fixedNow = new Date("2026-04-22T03:30:00Z");

    const result = await runExpireLicenses({
      admin,
      step,
      logger,
      now: () => fixedNow,
    });

    expect(result.refunded).toBe(1);
    expect(admin.selectSpy).toHaveBeenCalled();
  });

  it("throws when the initial fetch fails (Inngest retries the function)", async () => {
    state.fetchError = { message: "db down" };
    const admin = makeAdmin(state);
    const step = makeStep();
    const logger = makeLogger();

    await expect(
      runExpireLicenses({ admin, step, logger }),
    ).rejects.toThrow(/fetch-expired failed.*db down/i);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
