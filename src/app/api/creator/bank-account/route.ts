import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import crypto from "crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const ALGO = "aes-256-gcm";
const KEY_HEX = process.env.KYC_ENCRYPTION_KEY ?? "";

function encryptAccountNumber(plaintext: string): string {
  if (!KEY_HEX) throw new Error("KYC_ENCRYPTION_KEY not set");
  const key = Buffer.from(KEY_HEX, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${enc.toString("hex")}:${tag.toString("hex")}`;
}

function decryptAccountNumber(ciphertext: string): string {
  if (!KEY_HEX) return "•••••••••";
  try {
    const [ivHex, encHex, tagHex] = ciphertext.split(":");
    const key = Buffer.from(KEY_HEX, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const enc = Buffer.from(encHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc).toString("utf8") + decipher.final("utf8");
  } catch {
    return "•••••••••";
  }
}

const BankAccountSchema = z.object({
  holder_name: z.string().min(2).max(200),
  account_number: z.string().min(9).max(20).regex(/^\d+$/, "Account number must be digits only"),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code"),
});

// GET /api/creator/bank-account — returns masked account number
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;
  const { data: creator } = await admin
    .from("creators")
    .select("bank_account_holder_name, bank_account_number_encrypted, bank_ifsc, bank_added_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!creator?.bank_account_number_encrypted) {
    return NextResponse.json({ bank_account: null });
  }

  const full = decryptAccountNumber(creator.bank_account_number_encrypted);
  const masked = full.length > 4 ? "•".repeat(full.length - 4) + full.slice(-4) : "••••";

  return NextResponse.json({
    bank_account: {
      holder_name: creator.bank_account_holder_name,
      account_number_masked: masked,
      ifsc: creator.bank_ifsc,
      added_at: creator.bank_added_at,
    },
  });
}

// PUT /api/creator/bank-account — upserts bank account
export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = BankAccountSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });

  const { holder_name, account_number, ifsc } = parsed.data;

  let encrypted: string;
  try { encrypted = encryptAccountNumber(account_number); }
  catch (err) {
    console.error("[bank-account] encryption failed", err);
    return NextResponse.json({ error: "Encryption configuration error" }, { status: 500 });
  }

  const admin = createAdminClient() as Admin;
  const { error: updateErr } = await admin
    .from("creators")
    .update({
      bank_account_holder_name: holder_name,
      bank_account_number_encrypted: encrypted,
      bank_ifsc: ifsc.toUpperCase(),
      bank_added_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[bank-account] update failed", updateErr);
    return NextResponse.json({ error: "Failed to save bank account" }, { status: 500 });
  }

  const masked = "•".repeat(account_number.length - 4) + account_number.slice(-4);
  return NextResponse.json({
    ok: true,
    bank_account: { holder_name, account_number_masked: masked, ifsc: ifsc.toUpperCase() },
  });
}
