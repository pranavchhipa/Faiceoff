/**
 * Cashfree KYC — PAN, Aadhaar, bank penny-drop.
 *
 * Used on the creator onboarding → payout-eligibility path:
 *   1. `verifyPan` — confirms PAN is real + matches declared name
 *   2. `verifyAadhaar` — confirms Aadhaar exists + name matches
 *   3. `pennyDrop` — confirms bank account is live + name matches
 *
 * Cashfree's KYC endpoints live under `/verification/*` in the 2025-01 API.
 * Each response shape is returned verbatim from Cashfree; we normalise to a
 * small friendly object at call sites so downstream code doesn't see the
 * raw `Y`/`N` strings.
 *
 * @verifyAgainstDocs The exact shape of PAN/Aadhaar responses still differs
 * subtly between Cashfree's "Verification Suite" (older) and the 2025-01
 * consolidated KYC endpoint. Test both against sandbox before prod.
 */

import { CashfreeClient } from "./client";
import type {
  CashfreeKycAadhaarRequest,
  CashfreeKycAadhaarResponse,
  CashfreeKycPanRequest,
  CashfreeKycPanResponse,
  CashfreePennyDropRequest,
  CashfreePennyDropResponse,
} from "./types";

/* ────────────────────────── PAN ──────────────────────────────────────── */

export interface VerifyPanParams {
  verificationId: string;
  pan: string;
  name: string;
}

export interface VerifyPanResult {
  verified: boolean;
  nameMatch: boolean;
  panName?: string;
  raw: CashfreeKycPanResponse;
}

export async function verifyPan(params: VerifyPanParams): Promise<VerifyPanResult> {
  const client = new CashfreeClient();
  const body: CashfreeKycPanRequest = {
    verification_id: params.verificationId,
    pan: params.pan,
    name: params.name,
  };
  const raw = await client.request<CashfreeKycPanResponse>({
    method: "POST",
    path: "/verification/pan",
    body: body as unknown as Record<string, unknown>,
  });

  return {
    verified: raw.valid === true && raw.status === "VALID",
    nameMatch: raw.name_match === "Y",
    panName: raw.registered_name,
    raw,
  };
}

/* ────────────────────────── Aadhaar ──────────────────────────────────── */

export interface VerifyAadhaarParams {
  verificationId: string;
  aadhaarLast4?: string;
  aadhaarNumber?: string;
  name: string;
  otp?: string;
  refId?: string;
}

export interface VerifyAadhaarResult {
  verified: boolean;
  nameMatch: boolean;
  confidence?: number;
  raw: CashfreeKycAadhaarResponse;
}

export async function verifyAadhaar(
  params: VerifyAadhaarParams,
): Promise<VerifyAadhaarResult> {
  const client = new CashfreeClient();
  const body: CashfreeKycAadhaarRequest = {
    verification_id: params.verificationId,
    aadhaar_last4: params.aadhaarLast4,
    aadhaar_number: params.aadhaarNumber,
    name: params.name,
    otp: params.otp,
    ref_id: params.refId,
  };
  const raw = await client.request<CashfreeKycAadhaarResponse>({
    method: "POST",
    path: "/verification/aadhaar",
    body: body as unknown as Record<string, unknown>,
  });

  return {
    verified: raw.valid === true && raw.status === "VALID",
    nameMatch: raw.name_match === "Y",
    confidence: raw.confidence,
    raw,
  };
}

/* ────────────────────────── Penny-drop (bank) ────────────────────────── */

export interface PennyDropParams {
  verificationId: string;
  accountNumber: string;
  ifsc: string;
  expectedName: string;
}

export interface PennyDropResult {
  success: boolean;
  actualName?: string;
  matchScore?: number;
  raw: CashfreePennyDropResponse;
}

export async function pennyDrop(params: PennyDropParams): Promise<PennyDropResult> {
  const client = new CashfreeClient();
  const body: CashfreePennyDropRequest = {
    verification_id: params.verificationId,
    bank_account: params.accountNumber,
    ifsc: params.ifsc,
    name: params.expectedName,
  };
  const raw = await client.request<CashfreePennyDropResponse>({
    method: "POST",
    path: "/verification/bank-account",
    body: body as unknown as Record<string, unknown>,
  });

  return {
    success: raw.account_status === "VALID",
    actualName: raw.name_at_bank,
    matchScore: raw.name_match_score,
    raw,
  };
}
