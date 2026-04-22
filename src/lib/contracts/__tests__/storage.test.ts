import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

// Mock the r2Client module — it reads env at import time, which would throw
// without a test env. We replace it with a minimal fake whose `send` records
// calls and returns success.
const sendMock = vi.fn();
vi.mock("@/lib/storage/r2-client", () => ({
  r2Client: {
    send: (cmd: unknown) => sendMock(cmd),
    config: { region: () => "auto" },
  },
  R2_BUCKET_NAME: "faiceoff-assets",
}));

// Mock the presigner — it requires a fully-constructed SigV4 signer; in tests
// we simply return a deterministic URL.
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async (_client: unknown, cmd: unknown, opts: unknown) => {
    const { input } = cmd as { input: { Bucket?: string; Key?: string } };
    const ttl = (opts as { expiresIn?: number } | undefined)?.expiresIn ?? 3600;
    return `https://r2.example.com/${input.Bucket}/${input.Key}?ttl=${ttl}`;
  }),
}));

// Import under test AFTER mocks are declared.
import {
  CONTRACTS_BUCKET_DEFAULT,
  getSignedContractUrl,
  uploadContract,
} from "../storage";

describe("uploadContract", () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ ETag: '"deadbeef"' });
    // Default: no override
    delete process.env.R2_CONTRACTS_BUCKET_NAME;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uploads PDF to R2 using contracts/{id}/v1.pdf path", async () => {
    const pdf = Buffer.from("%PDF-1.4 fake contract bytes\n%%EOF");
    const result = await uploadContract({
      licenseRequestId: "lr_01abc",
      pdf,
    });

    expect(result.r2Path).toBe("contracts/lr_01abc/v1.pdf");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const cmd = sendMock.mock.calls[0]![0] as PutObjectCommand;
    expect(cmd).toBeInstanceOf(PutObjectCommand);

    const { input } = cmd;
    expect(input.Bucket).toBe(CONTRACTS_BUCKET_DEFAULT);
    expect(input.Key).toBe("contracts/lr_01abc/v1.pdf");
    expect(input.Body).toBe(pdf);
    expect(input.ContentType).toBe("application/pdf");
    expect(input.Metadata).toBeDefined();
    expect(input.Metadata!.sha256).toBe(result.sha256);
    expect(input.Metadata!.template_version).toBe("v1.2026-04");
  });

  it("computes correct SHA256 hash of pdf bytes", async () => {
    const pdf = Buffer.from("hello world");
    const expected = createHash("sha256").update(pdf).digest("hex");

    const result = await uploadContract({
      licenseRequestId: "lr_hash_test",
      pdf,
    });

    expect(result.sha256).toBe(expected);
  });

  it("uses R2_CONTRACTS_BUCKET_NAME env override when set", async () => {
    process.env.R2_CONTRACTS_BUCKET_NAME = "custom-contracts-bucket";

    await uploadContract({
      licenseRequestId: "lr_env_override",
      pdf: Buffer.from("abc"),
    });

    const cmd = sendMock.mock.calls[0]![0] as PutObjectCommand;
    expect(cmd.input.Bucket).toBe("custom-contracts-bucket");
  });

  it("propagates R2 errors", async () => {
    sendMock.mockRejectedValueOnce(new Error("S3: access denied"));

    await expect(
      uploadContract({
        licenseRequestId: "lr_fail",
        pdf: Buffer.from("x"),
      }),
    ).rejects.toThrow(/access denied/);
  });
});

describe("getSignedContractUrl", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("returns a signed URL with default 1h TTL", async () => {
    const url = await getSignedContractUrl("contracts/lr_01abc/v1.pdf");

    expect(url).toContain(CONTRACTS_BUCKET_DEFAULT);
    expect(url).toContain("contracts/lr_01abc/v1.pdf");
    expect(url).toContain("ttl=3600");
  });

  it("accepts custom TTL", async () => {
    const url = await getSignedContractUrl(
      "contracts/lr_ttl/v1.pdf",
      900,
    );

    expect(url).toContain("ttl=900");
  });

  it("builds a GetObjectCommand with the right bucket + key", async () => {
    const { getSignedUrl } = await import(
      "@aws-sdk/s3-request-presigner"
    );
    const mockFn = getSignedUrl as unknown as ReturnType<typeof vi.fn>;
    mockFn.mockClear();

    await getSignedContractUrl("contracts/lr_cmd/v1.pdf");

    expect(mockFn).toHaveBeenCalledTimes(1);
    const [, cmd] = mockFn.mock.calls[0] as [unknown, GetObjectCommand];
    expect(cmd).toBeInstanceOf(GetObjectCommand);
    expect(cmd.input.Bucket).toBe(CONTRACTS_BUCKET_DEFAULT);
    expect(cmd.input.Key).toBe("contracts/lr_cmd/v1.pdf");
  });

  it("respects R2_CONTRACTS_BUCKET_NAME override", async () => {
    process.env.R2_CONTRACTS_BUCKET_NAME = "another-bucket";
    const url = await getSignedContractUrl(
      "contracts/lr_ov/v1.pdf",
    );
    expect(url).toContain("another-bucket");
    delete process.env.R2_CONTRACTS_BUCKET_NAME;
  });
});
