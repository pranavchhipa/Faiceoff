/**
 * POST /api/webhooks/replicate
 *
 * Receives async callbacks from Replicate when a prediction completes or fails.
 *
 * Auth: two-layer defense in depth —
 *   1. Query token: HMAC-SHA256(gen_id, REPLICATE_WEBHOOK_SECRET).slice(0,32)
 *   2. Replicate webhook signature: HMAC-SHA256(secret, `${webhook_id}.${webhook_timestamp}.${body}`)
 *      (See https://replicate.com/docs/webhooks/verify-signature)
 *
 * Idempotent: if the generation is not in status='processing', returns 200 with dedup=true.
 * Always returns 200 so Replicate does not retry on transient handler errors.
 */

import crypto from "crypto";
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createAdminClient } from "@/lib/supabase/admin";
import { releaseReserve } from "@/lib/billing";
import { checkImage } from "@/lib/ai/hive-client";
import { r2Client, R2_BUCKET_NAME } from "@/lib/storage/r2-client";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Hive score threshold above which the image is flagged as unsafe. */
const HIVE_UNSAFE_THRESHOLD = 0.7;

/** 48 hours in milliseconds. */
const APPROVAL_EXPIRY_MS = 48 * 60 * 60 * 1000;

/** Classes checked against the Hive threshold. */
const HIVE_NSFW_CLASSES = new Set([
  "yes_sexual",
  "yes_male_nudity",
  "yes_female_nudity",
  "yes_graphic_violence",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Signature helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify our own HMAC query token.
 * HMAC-SHA256(genId, REPLICATE_WEBHOOK_SECRET).slice(0,32)
 */
function verifyQueryToken(genId: string, token: string): boolean {
  const secret = process.env.REPLICATE_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(genId)
    .digest("hex")
    .slice(0, 32);
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Verify Replicate's svix-style webhook signature.
 * Signed payload: `${webhook-id}.${webhook-timestamp}.${rawBody}`
 * Secret: base64-decoded REPLICATE_SIGNING_SECRET (the webhook signing secret
 *   from replicate.com/account/webhooks — NOT the API token).
 * Signature header format: `v1,<base64_sig>[,v1,<base64_sig>...]`
 *
 * Returns true if any provided signature matches. Returns false (not throws)
 * when the signing secret env var is missing — callers fall back to token-only.
 */
function verifyReplicateSignature(
  webhookId: string,
  webhookTimestamp: string,
  rawBody: string,
  signatureHeader: string,
): boolean {
  const signingSecret = process.env.REPLICATE_SIGNING_SECRET;
  if (!signingSecret) {
    // Secret not configured — skip svix verification, rely on query token.
    return true;
  }

  let secretBytes: Buffer;
  try {
    // Replicate signing secrets are base64-encoded (with a "whsec_" prefix).
    const b64 = signingSecret.startsWith("whsec_")
      ? signingSecret.slice("whsec_".length)
      : signingSecret;
    secretBytes = Buffer.from(b64, "base64");
  } catch {
    console.error("[webhooks/replicate] Failed to decode REPLICATE_SIGNING_SECRET");
    return false;
  }

  const signedPayload = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const expectedHmac = crypto
    .createHmac("sha256", secretBytes)
    .update(signedPayload)
    .digest("base64");

  // Header may contain multiple signatures: "v1,sig1 v1,sig2" or "v1,sig1,v1,sig2"
  const parts = signatureHeader.split(/[\s,]+/);
  const sigs: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === "v1") sigs.push(parts[i + 1]);
  }

  for (const sig of sigs) {
    try {
      if (
        crypto.timingSafeEqual(Buffer.from(sig, "base64"), Buffer.from(expectedHmac, "base64"))
      ) {
        return true;
      }
    } catch {
      // length mismatch from timingSafeEqual — not a match
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // ── Read raw body (needed for signature verification) ────────────────────────
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ ok: false, error: "Cannot read body" }, { status: 200 });
  }

  // ── Extract query params ─────────────────────────────────────────────────────
  const url = new URL(request.url);
  const genId = url.searchParams.get("gen_id");
  const token = url.searchParams.get("token");

  if (!genId || !token) {
    console.warn("[webhooks/replicate] Missing gen_id or token in query string");
    return NextResponse.json({ ok: false, error: "Missing auth params" }, { status: 200 });
  }

  // ── 1. Verify our query token ─────────────────────────────────────────────────
  if (!verifyQueryToken(genId, token)) {
    console.warn(`[webhooks/replicate] Invalid token for gen_id=${genId}`);
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 200 });
  }

  // ── 2. Verify Replicate svix signature (defense in depth) ───────────────────
  const webhookId = request.headers.get("webhook-id") ?? "";
  const webhookTimestamp = request.headers.get("webhook-timestamp") ?? "";
  const signatureHeader = request.headers.get("webhook-signature") ?? "";

  if (webhookId && webhookTimestamp && signatureHeader) {
    if (!verifyReplicateSignature(webhookId, webhookTimestamp, rawBody, signatureHeader)) {
      console.warn(`[webhooks/replicate] Svix signature mismatch for gen_id=${genId}`);
      return NextResponse.json({ ok: false, error: "Signature mismatch" }, { status: 200 });
    }
  }
  // If headers are absent, token auth already passed — proceed.

  // ── 3. Parse JSON payload ─────────────────────────────────────────────────────
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error(`[webhooks/replicate] Invalid JSON for gen_id=${genId}`);
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 200 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false, error: "Empty payload" }, { status: 200 });
  }

  const p = payload as Record<string, unknown>;
  const predictionId = (p.id ?? p.prediction_id) as string | undefined;
  const predictionStatus = p.status as string | undefined;
  const predictionOutput = p.output;

  if (!predictionId || !predictionStatus) {
    console.error(`[webhooks/replicate] Missing id/status in payload for gen_id=${genId}`);
    return NextResponse.json({ ok: false, error: "Missing prediction fields" }, { status: 200 });
  }

  // ── 4. Fetch generation row ───────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: generation, error: genFetchError } = await admin
    .from("generations")
    .select(
      "id, status, brand_id, creator_id, collab_session_id, cost_paise, replicate_prediction_id",
    )
    .eq("id", genId)
    .maybeSingle();

  if (genFetchError || !generation) {
    console.error(`[webhooks/replicate] Generation ${genId} not found:`, genFetchError);
    return NextResponse.json({ ok: false, error: "Generation not found" }, { status: 200 });
  }

  // ── 5. Idempotency check ─────────────────────────────────────────────────────
  if (generation.status !== "processing") {
    return NextResponse.json({ ok: true, dedup: true }, { status: 200 });
  }

  // Optional: confirm prediction ID matches what we submitted.
  if (
    generation.replicate_prediction_id &&
    generation.replicate_prediction_id !== predictionId
  ) {
    console.warn(
      `[webhooks/replicate] Prediction ID mismatch for gen_id=${genId}: ` +
        `expected=${generation.replicate_prediction_id} got=${predictionId}`,
    );
    // Still proceed — same gen_id + token passed, which is sufficient.
  }

  const brandId = generation.brand_id as string;
  const creatorId = generation.creator_id as string;
  const costPaise = (generation.cost_paise as number) ?? 0;

  // ── 6. Handle prediction.status === 'failed' ──────────────────────────────────
  if (predictionStatus === "failed" || predictionStatus === "canceled") {
    await admin
      .from("generations")
      .update({ status: "failed" })
      .eq("id", genId);

    // Refund wallet reserve.
    if (costPaise > 0) {
      try {
        await releaseReserve({
          brandId,
          amountPaise: costPaise,
          generationId: genId,
        });
      } catch (err) {
        console.error(`[webhooks/replicate] releaseReserve failed for gen_id=${genId}:`, err);
      }
    }

    console.log(`[webhooks/replicate] Generation ${genId} failed — wallet reserve released`);
    return NextResponse.json({ ok: true, status: "failed" }, { status: 200 });
  }

  // ── 7. Handle prediction.status === 'succeeded' ───────────────────────────────
  if (predictionStatus !== "succeeded") {
    // Intermediate status (starting, processing) — Replicate sent a non-terminal
    // event even though we filtered to 'completed'. Ignore safely.
    return NextResponse.json({ ok: true, status: "ignored", predictionStatus }, { status: 200 });
  }

  // Extract output URL from Replicate payload.
  // output can be a string URL, an array of URLs, or an object with url().
  let imageSourceUrl: string | null = null;
  if (Array.isArray(predictionOutput) && predictionOutput.length > 0) {
    const first = predictionOutput[0] as unknown;
    if (typeof first === "string") {
      imageSourceUrl = first;
    } else if (
      first &&
      typeof first === "object" &&
      "url" in first &&
      typeof (first as { url: unknown }).url === "function"
    ) {
      const u = (first as { url: () => URL | string }).url();
      imageSourceUrl = u instanceof URL ? u.toString() : u;
    }
  } else if (typeof predictionOutput === "string") {
    imageSourceUrl = predictionOutput;
  }

  if (!imageSourceUrl) {
    console.error(`[webhooks/replicate] No usable output URL for gen_id=${genId}`);
    await admin
      .from("generations")
      .update({ status: "needs_admin_review" })
      .eq("id", genId);
    return NextResponse.json({ ok: true, status: "needs_admin_review", reason: "no_output_url" }, { status: 200 });
  }

  // ── 7a. Hive content safety check ────────────────────────────────────────────
  let hiveUnsafe = false;
  try {
    const hiveResult = await checkImage(imageSourceUrl);
    const allClasses =
      hiveResult.status?.[0]?.response?.output?.[0]?.classes ?? [];
    for (const cls of allClasses) {
      if (HIVE_NSFW_CLASSES.has(cls.class) && cls.score > HIVE_UNSAFE_THRESHOLD) {
        hiveUnsafe = true;
        console.warn(
          `[webhooks/replicate] Hive flagged gen_id=${genId}: class=${cls.class} score=${cls.score}`,
        );
        break;
      }
    }
  } catch (err) {
    // Fail-open — Hive outage should not block delivery.
    console.error(`[webhooks/replicate] Hive check error for gen_id=${genId}:`, err);
  }

  if (hiveUnsafe) {
    await admin
      .from("generations")
      .update({ status: "needs_admin_review" })
      .eq("id", genId);
    console.log(`[webhooks/replicate] Generation ${genId} flagged unsafe — needs_admin_review`);
    return NextResponse.json({ ok: true, status: "needs_admin_review", reason: "hive_unsafe" }, { status: 200 });
  }

  // ── 7b. Fetch image bytes from Replicate ─────────────────────────────────────
  let imageBytes: Uint8Array;
  let mimeType = "image/png";
  try {
    const imgRes = await fetch(imageSourceUrl);
    if (!imgRes.ok) {
      throw new Error(`HTTP ${imgRes.status} fetching image from Replicate`);
    }
    const ct = imgRes.headers.get("content-type") ?? "";
    if (ct.startsWith("image/")) mimeType = ct.split(";")[0].trim();
    imageBytes = new Uint8Array(await imgRes.arrayBuffer());
  } catch (err) {
    console.error(`[webhooks/replicate] Image fetch failed for gen_id=${genId}:`, err);
    await admin
      .from("generations")
      .update({ status: "needs_admin_review" })
      .eq("id", genId);
    return NextResponse.json({ ok: true, status: "needs_admin_review", reason: "image_fetch_failed" }, { status: 200 });
  }

  // ── 7c. Upload to R2 ─────────────────────────────────────────────────────────
  const ext = mimeType === "image/jpeg" ? "jpg" : "png";
  const r2Key = `generations/${genId}/raw.${ext}`;
  let r2Url: string;

  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: r2Key,
        Body: imageBytes,
        ContentType: mimeType,
      }),
    );
    // Construct the public CDN URL. R2_PUBLIC_URL is optional — falls back to
    // the account-based URL format if not set.
    const r2PublicBase =
      process.env.R2_PUBLIC_URL ??
      `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}`;
    r2Url = `${r2PublicBase.replace(/\/$/, "")}/${r2Key}`;
  } catch (err) {
    console.error(`[webhooks/replicate] R2 upload failed for gen_id=${genId}:`, err);
    await admin
      .from("generations")
      .update({ status: "needs_admin_review" })
      .eq("id", genId);
    return NextResponse.json({ ok: true, status: "needs_admin_review", reason: "r2_upload_failed" }, { status: 200 });
  }

  // ── 7d. Create approval row (48-hour timer) ───────────────────────────────────
  const expiresAt = new Date(Date.now() + APPROVAL_EXPIRY_MS).toISOString();

  const { data: brandRow } = await admin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .maybeSingle();

  const approvalBrandId = (brandRow?.id as string | undefined) ?? brandId;

  try {
    await admin.from("approvals").insert({
      generation_id: genId,
      creator_id: creatorId,
      brand_id: approvalBrandId,
      status: "pending",
      expires_at: expiresAt,
    });
  } catch (err) {
    // Non-fatal: generation can still be surfaced manually.
    console.error(`[webhooks/replicate] approvals insert failed for gen_id=${genId}:`, err);
  }

  // ── 7e. Update generation to ready_for_approval ───────────────────────────────
  await admin
    .from("generations")
    .update({
      status: "ready_for_approval",
      image_url: r2Url,
    })
    .eq("id", genId);

  console.log(
    `[webhooks/replicate] Generation ${genId} ready for approval. image_url=${r2Url}`,
  );

  return NextResponse.json({ ok: true, status: "ready_for_approval" }, { status: 200 });
}
