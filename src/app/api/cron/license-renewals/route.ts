// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/license-renewals
//
// Daily cron. Processes licenses expiring today:
//   - auto_renew=true + sufficient wallet → renewLicense
//   - auto_renew=true + insufficient wallet → audit log (future: email)
//   - auto_renew=false → mark expired
//
// Called by Vercel Cron. Protected by CRON_SECRET bearer token.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExpiringSoon, renewLicense, LicenseError } from "@/lib/licenses";
import { getWallet, BillingError } from "@/lib/billing";
import type { License } from "@/lib/licenses";

function verifyCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/license-renewals] CRON_SECRET env var not set");
    return false;
  }
  return req.headers.get("Authorization") === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Fetch licenses expiring today (daysWindow=0 means <= now, use 1 to catch today's expiries)
  let expiringLicenses: License[];
  try {
    expiringLicenses = await getExpiringSoon({ daysWindow: 1 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/license-renewals] getExpiringSoon error:", message);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const admin = createAdminClient() as any;

  let renewed = 0;
  let expired = 0;
  let insufficient = 0;

  for (const license of expiringLicenses) {
    if (!license.auto_renew) {
      // Mark as expired
      await admin
        .from("licenses")
        .update({ status: "expired" })
        .eq("id", license.id)
        .catch((err: unknown) => {
          console.error(`[cron/license-renewals] expire license ${license.id}:`, err);
        });
      expired++;
      continue;
    }

    // auto_renew=true — check wallet balance
    try {
      const wallet = await getWallet(license.brand_id);
      const renewalCost = license.amount_paid_paise;

      if (wallet.available < renewalCost) {
        // Insufficient funds — log and notify
        insufficient++;
        await admin.from("audit_log").insert({
          actor_type: "system",
          action: "license_renewal_insufficient_funds",
          resource_type: "license",
          resource_id: license.id,
          meta: {
            brand_id: license.brand_id,
            available_paise: wallet.available,
            required_paise: renewalCost,
          },
        });
        continue;
      }

      // Sufficient — renew
      await renewLicense({ licenseId: license.id });
      renewed++;

      await admin.from("audit_log").insert({
        actor_type: "system",
        action: "license_auto_renewed",
        resource_type: "license",
        resource_id: license.id,
        meta: { brand_id: license.brand_id, cost_paise: renewalCost },
      });
    } catch (err) {
      if (err instanceof LicenseError || err instanceof BillingError) {
        console.warn(
          `[cron/license-renewals] renew license ${license.id} warning:`,
          err.message,
        );
      } else {
        console.error(
          `[cron/license-renewals] renew license ${license.id} unexpected error:`,
          err,
        );
      }
    }
  }

  console.log(
    `[cron/license-renewals] processed=${expiringLicenses.length} renewed=${renewed} expired=${expired} insufficient=${insufficient}`,
  );

  return NextResponse.json({
    processed: expiringLicenses.length,
    renewed,
    expired,
    insufficient,
  });
}
