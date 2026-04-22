import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pennyDrop, verifyAadhaar, verifyPan } from "../kyc";
import { CashfreeApiError } from "../client";

type FetchMock = ReturnType<typeof vi.fn>;
type FetchArgs = Parameters<typeof fetch>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("Cashfree KYC", () => {
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

  describe("verifyPan", () => {
    it("returns { verified: true, nameMatch } on valid PAN", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          verification_id: "pan_vrf_1",
          pan: "ABCDE1234F",
          name_provided: "Priya Shah",
          registered_name: "PRIYA SHAH",
          valid: true,
          name_match: "Y",
          status: "VALID",
        }),
      );

      const result = await verifyPan({
        verificationId: "pan_vrf_1",
        pan: "ABCDE1234F",
        name: "Priya Shah",
      });

      expect(result.verified).toBe(true);
      expect(result.nameMatch).toBe(true);
      expect(result.panName).toBe("PRIYA SHAH");

      const [url, init] = fetchMock.mock.calls[0] as FetchArgs;
      expect(url).toBe("https://sandbox.cashfree.com/verification/pan");
      const body = JSON.parse(init?.body as string);
      expect(body.pan).toBe("ABCDE1234F");
      expect(body.name).toBe("Priya Shah");
    });

    it("returns { verified: false } on invalid PAN", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          verification_id: "pan_vrf_2",
          pan: "XXXXXXXXXX",
          name_provided: "Imposter",
          valid: false,
          status: "INVALID",
        }),
      );

      const result = await verifyPan({
        verificationId: "pan_vrf_2",
        pan: "XXXXXXXXXX",
        name: "Imposter",
      });
      expect(result.verified).toBe(false);
      expect(result.nameMatch).toBe(false);
    });

    it("propagates 4xx as CashfreeApiError", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ message: "Bad PAN format" }, { status: 400 }),
      );

      await expect(
        verifyPan({ verificationId: "x", pan: "bad", name: "n" }),
      ).rejects.toBeInstanceOf(CashfreeApiError);
    });
  });

  describe("verifyAadhaar", () => {
    it("POSTs to /verification/aadhaar and returns parsed result", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          verification_id: "aa_vrf_1",
          valid: true,
          name_match: "Y",
          confidence: 0.95,
          status: "VALID",
        }),
      );

      const result = await verifyAadhaar({
        verificationId: "aa_vrf_1",
        aadhaarLast4: "1234",
        name: "Priya Shah",
      });

      expect(result.verified).toBe(true);
      expect(result.confidence).toBe(0.95);

      const [url, init] = fetchMock.mock.calls[0] as FetchArgs;
      expect(url).toBe("https://sandbox.cashfree.com/verification/aadhaar");
      const body = JSON.parse(init?.body as string);
      expect(body.aadhaar_last4).toBe("1234");
      expect(body.name).toBe("Priya Shah");
    });

    it("returns { verified: false } when Cashfree says INVALID", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          verification_id: "aa_vrf_2",
          valid: false,
          status: "INVALID",
          message: "Mismatch",
        }),
      );

      const result = await verifyAadhaar({
        verificationId: "aa_vrf_2",
        aadhaarLast4: "0000",
        name: "Nobody",
      });
      expect(result.verified).toBe(false);
    });
  });

  describe("pennyDrop", () => {
    it("POSTs to /verification/bank-account and returns match details", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          verification_id: "bank_1",
          bank_account: "11223344",
          ifsc: "HDFC0000123",
          name_at_bank: "PRIYA SHAH",
          account_status: "VALID",
          name_match_score: 98,
          name_match_result: "Y",
        }),
      );

      const result = await pennyDrop({
        verificationId: "bank_1",
        accountNumber: "11223344",
        ifsc: "HDFC0000123",
        expectedName: "Priya Shah",
      });

      expect(result.success).toBe(true);
      expect(result.actualName).toBe("PRIYA SHAH");
      expect(result.matchScore).toBe(98);

      const [url, init] = fetchMock.mock.calls[0] as FetchArgs;
      expect(url).toBe(
        "https://sandbox.cashfree.com/verification/bank-account",
      );
      const body = JSON.parse(init?.body as string);
      expect(body.bank_account).toBe("11223344");
      expect(body.ifsc).toBe("HDFC0000123");
      expect(body.name).toBe("Priya Shah");
    });

    it("returns { success: false } when account is invalid", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          verification_id: "bank_2",
          bank_account: "0",
          ifsc: "HDFC0000123",
          account_status: "INVALID",
        }),
      );

      const result = await pennyDrop({
        verificationId: "bank_2",
        accountNumber: "0",
        ifsc: "HDFC0000123",
        expectedName: "x",
      });
      expect(result.success).toBe(false);
    });
  });
});
