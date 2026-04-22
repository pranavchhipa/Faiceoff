import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBeneficiary,
  createTransfer,
  getTransferStatus,
  mapTransferStatus,
  removeBeneficiary,
} from "../payouts";

type FetchMock = ReturnType<typeof vi.fn>;
type FetchArgs = Parameters<typeof fetch>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("Cashfree Payouts", () => {
  let fetchMock: FetchMock;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("CASHFREE_MODE", "test");
    vi.stubEnv("CASHFREE_APP_ID", "app-id");
    vi.stubEnv("CASHFREE_SECRET_KEY", "secret-key");
    vi.stubEnv("CASHFREE_WEBHOOK_SECRET", "whsec");

    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("createBeneficiary", () => {
    it("POSTs to /payout/beneficiary with name + bank details", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          beneficiary_id: "creator_user_1",
          beneficiary_status: "VERIFIED",
        }),
      );

      const result = await createBeneficiary({
        beneficiaryId: "creator_user_1",
        name: "Priya Shah",
        bankAccountNumber: "11223344556677",
        bankIfsc: "HDFC0000123",
        email: "priya@example.com",
        phone: "9876543210",
      });

      expect(result.beneficiary_id).toBe("creator_user_1");

      const [url, init] = fetchMock.mock.calls[0] as FetchArgs;
      expect(url).toBe("https://sandbox.cashfree.com/payout/beneficiary");
      expect(init?.method).toBe("POST");

      const body = JSON.parse(init?.body as string);
      expect(body.beneficiary_id).toBe("creator_user_1");
      expect(body.beneficiary_name).toBe("Priya Shah");
      expect(body.beneficiary_instrument_details).toMatchObject({
        bank_account_number: "11223344556677",
        bank_ifsc: "HDFC0000123",
      });
      expect(body.beneficiary_contact_details).toMatchObject({
        beneficiary_email: "priya@example.com",
        beneficiary_phone: "9876543210",
      });
    });
  });

  describe("removeBeneficiary", () => {
    it("DELETEs the beneficiary by id", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: "SUCCESS" }));

      await removeBeneficiary("creator_user_1");

      const [url, init] = fetchMock.mock.calls[0] as FetchArgs;
      expect(url).toBe(
        "https://sandbox.cashfree.com/payout/beneficiary/creator_user_1",
      );
      expect(init?.method).toBe("DELETE");
    });
  });

  describe("createTransfer", () => {
    it("POSTs to /payout/transfers with amount in rupees and IMPS mode by default", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          transfer_id: "wd_123",
          cf_transfer_id: "cft_abc",
          status: "PROCESSING",
        }),
      );

      const result = await createTransfer({
        transferId: "wd_123",
        beneficiaryId: "creator_user_1",
        amountPaise: 450000, // ₹4500
        remarks: "Withdrawal for April",
      });

      expect(result.status).toBe("PROCESSING");
      expect(result.transfer_id).toBe("wd_123");

      const [url, init] = fetchMock.mock.calls[0] as FetchArgs;
      expect(url).toBe("https://sandbox.cashfree.com/payout/transfers");
      const body = JSON.parse(init?.body as string);
      expect(body.transfer_id).toBe("wd_123");
      expect(body.transfer_amount).toBe(4500);
      expect(body.transfer_currency).toBe("INR");
      expect(body.transfer_mode).toBe("IMPS");
      expect(body.beneficiary_details.beneficiary_id).toBe("creator_user_1");
      expect(body.transfer_remarks).toBe("Withdrawal for April");
    });

    it("honors a custom transfer_mode override", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ transfer_id: "wd_x", status: "PENDING" }),
      );

      await createTransfer({
        transferId: "wd_x",
        beneficiaryId: "c1",
        amountPaise: 100000,
        mode: "NEFT",
      });

      const body = JSON.parse(
        (fetchMock.mock.calls[0] as FetchArgs)[1]?.body as string,
      );
      expect(body.transfer_mode).toBe("NEFT");
    });
  });

  describe("getTransferStatus", () => {
    it("GETs /payout/transfers with transfer_id query and returns raw status", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          transfer_id: "wd_789",
          cf_transfer_id: "cft_789",
          status: "SUCCESS",
          utr: "UTR12345678",
        }),
      );

      const result = await getTransferStatus("wd_789");
      expect(result.status).toBe("SUCCESS");
      expect(result.utr).toBe("UTR12345678");

      const [url] = fetchMock.mock.calls[0] as FetchArgs;
      expect(String(url)).toBe(
        "https://sandbox.cashfree.com/payout/transfers?transfer_id=wd_789",
      );
    });
  });

  describe("mapTransferStatus", () => {
    it("maps SUCCESS → success", () => {
      expect(mapTransferStatus("SUCCESS")).toBe("success");
    });

    it("maps PROCESSING and PENDING → processing", () => {
      expect(mapTransferStatus("PROCESSING")).toBe("processing");
      expect(mapTransferStatus("PENDING")).toBe("processing");
    });

    it("maps FAILED, REJECTED, REVERSED → failed", () => {
      expect(mapTransferStatus("FAILED")).toBe("failed");
      expect(mapTransferStatus("REJECTED")).toBe("failed");
      expect(mapTransferStatus("REVERSED")).toBe("failed");
    });
  });
});
