// GSTVerify API client (gstverify.dubey.app) — server-side only.
//
// Two calls per brand verification:
//   1. getGstCaptcha()  — GET /api/v1/gst/captcha   (free) → { sessionId, image }
//   2. verifyGstin(...) — POST /api/v1/gst/details   (0.5 cr basic) → official GST details
//
// The /details response wrapper isn't fully documented, so parsing is
// DEFENSIVE: we unwrap common envelopes (data/result/gstinDetails) and read the
// standard GSTN search-taxpayer field names (lgnm/tradeNam/sts/ctb/rgdt/pradr).
// The full raw response is always returned + stored for the operator + audit.
//
// Key: GSTVERIFY_API_KEY (header X-API-Key). Never expose to the client.

const BASE = (process.env.GSTVERIFY_API_BASE ?? "https://api.gstverify.dubey.app").replace(/\/$/, "");

function apiKey(): string {
  const k = process.env.GSTVERIFY_API_KEY;
  if (!k) throw new Error("GSTVERIFY_API_KEY is not set");
  return k;
}

/** GSTIN format: 2 state digits + 10-char PAN + 1 entity + Z + 1 checksum. */
export function isValidGstinFormat(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.trim().toUpperCase());
}

/** PAN is GSTIN characters 3–12 (no separate lookup needed). */
export function panFromGstin(gstin: string): string {
  const g = gstin.trim().toUpperCase();
  return g.length >= 12 ? g.slice(2, 12) : "";
}

export interface GstCaptcha {
  sessionId: string;
  image: string; // data:image/png;base64,... — render directly in <img src>
}

export async function getGstCaptcha(): Promise<GstCaptcha> {
  const res = await fetch(`${BASE}/api/v1/gst/captcha`, {
    method: "GET",
    headers: { "X-API-Key": apiKey() },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`GST captcha failed (HTTP ${res.status})`);
  const json = (await res.json()) as { sessionId?: string; image?: string };
  if (!json.sessionId || !json.image) throw new Error("GST captcha returned an unexpected shape");
  return { sessionId: json.sessionId, image: json.image };
}

export interface GstDetails {
  gstin: string;
  pan: string;
  legalName: string | null;
  tradeName: string | null;
  status: string | null; // Active / Cancelled / Suspended / Provisional …
  address: string | null;
  constitution: string | null;
  registrationDate: string | null;
  taxpayerType: string | null;
  isActive: boolean;
  raw: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pick(obj: any, ...keys: string[]): any {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAddress(pradr: any): string | null {
  if (!pradr) return null;
  // Some shapes give a flat string, others a nested {addr:{...}} object.
  const flat = pick(pradr, "adr", "address", "addr");
  if (typeof flat === "string") return flat;
  const a = pradr.addr ?? pradr;
  if (a && typeof a === "object") {
    const parts = [a.bno, a.flno, a.bnm, a.st, a.loc, a.dst, a.stcd, a.pncd, a.landMark]
      .filter((p: unknown) => typeof p === "string" && p.trim().length > 0);
    if (parts.length) return parts.join(", ");
  }
  return null;
}

export async function verifyGstin(input: {
  gstin: string;
  sessionId: string;
  captcha: string;
}): Promise<{ ok: true; details: GstDetails } | { ok: false; error: string; raw?: unknown }> {
  const gstin = input.gstin.trim().toUpperCase();
  if (!isValidGstinFormat(gstin)) {
    return { ok: false, error: "Invalid GSTIN format." };
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v1/gst/details`, {
      method: "POST",
      headers: { "X-API-Key": apiKey(), "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: input.sessionId, GSTIN: gstin, captcha: input.captcha }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { ok: false, error: "Could not reach the GST verification service. Try again." };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: `GST service returned a non-JSON response (HTTP ${res.status}).` };
  }

  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = (json as any)?.message ?? (json as any)?.error ?? `GST verification failed (HTTP ${res.status}).`;
    return { ok: false, error: String(msg).slice(0, 200), raw: json };
  }

  // Unwrap common envelopes to reach the taxpayer object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const root = json as any;
  const d = root?.data ?? root?.result ?? root?.gstinDetails ?? root?.details ?? root;

  const legalName = pick(d, "lgnm", "legalName", "legal_name", "name");
  const status = pick(d, "sts", "status", "gstinStatus");
  // If we got nothing recognizable, surface the raw so the operator can still judge.
  if (!legalName && !status) {
    return { ok: false, error: "GST details could not be read — check the GSTIN / captcha and retry.", raw: json };
  }

  const details: GstDetails = {
    gstin,
    pan: panFromGstin(gstin),
    legalName: legalName ?? null,
    tradeName: pick(d, "tradeNam", "tradeName", "trade_name"),
    status: status ?? null,
    address: buildAddress(pick(d, "pradr", "principalAddress", "address")),
    constitution: pick(d, "ctb", "constitution", "constitutionOfBusiness"),
    registrationDate: pick(d, "rgdt", "registrationDate", "registration_date"),
    taxpayerType: pick(d, "dty", "taxpayerType", "dealerType"),
    isActive: typeof status === "string" && status.toLowerCase().includes("active"),
    raw: json,
  };

  return { ok: true, details };
}
