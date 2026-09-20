/**
 * Funnel — acquisition, attribution and drop-off, straight out of our own
 * database.
 *
 * WHY THIS EXISTS: 21 people signed up in one morning and there was no way to
 * answer "where from?" without leaving the Control Centre. Migration 00079
 * started recording first-touch attribution on public.users; this page is the
 * read side of it, in plain SQL-shaped reads — no PostHog call, no chart
 * library, no client JS.
 *
 * WHAT IT SHOWS, for a selectable window (today / 7d / 30d / all, default 7d):
 *   1. Acquisition — signups per hour/day/week, stacked by role.
 *   2. Attribution — coarse source bucket, referrer hosts, UTM campaigns and
 *      landing pages. These columns are NEW: every user who signed up before
 *      they shipped has NULL, so those are shown as an explicit
 *      "not recorded" bucket rather than quietly dropped.
 *   3. Creator funnel — cohort drop-off from signup to first earnings.
 *   4. Brand funnel — cohort drop-off from signup to first approved image.
 *   5. Money — requests sent/accepted/paid, GMV, platform commission.
 *
 * COHORT SEMANTICS: both funnels are cohort funnels. The population is the
 * people who SIGNED UP inside the window; each step counts how many of them
 * have reached that step as of now (not "inside the window"). That is the
 * question an owner actually asks — "of the people who arrived this week, how
 * far did they get?" — and it is why a 7-day window shows low late-stage
 * numbers: those steps take longer than a week.
 *
 * Steps are NOT forced into nested subsets, because in this product they are
 * genuinely not nested (a brand can send a collab request while unverified).
 * When a later step out-counts an earlier one the table says so instead of
 * printing a rate above 100%. See FunnelTable in ./funnel-bits.
 */

import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";
import {
  Breakdown,
  FunnelTable,
  Kpi,
  Note,
  SignupBars,
  WINDOW_KEYS,
  WindowSwitcher,
  fmtINR,
  fmtNum,
  pct,
  MIN_DENOMINATOR,
  type BreakdownRow,
  type Bucket,
  type FunnelStep,
  type WindowKey,
} from "./funnel-bits";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
  searchParams: Promise<{ w?: string }>;
}

/* ── Time helpers — everything is bucketed in IST, not UTC ────────────── */
// India has no DST, so a fixed offset is exact rather than an approximation.
const IST_MS = 5.5 * 60 * 60 * 1000;
const HOUR_MS = 3600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function istDayStart(t: number): number {
  const d = new Date(t + IST_MS);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - IST_MS;
}

function istHourStart(t: number): number {
  const d = new Date(t + IST_MS);
  d.setUTCMinutes(0, 0, 0);
  return d.getTime() - IST_MS;
}

function istWeekStart(t: number): number {
  const day = istDayStart(t);
  const dow = (new Date(day + IST_MS).getUTCDay() + 6) % 7; // Monday = 0
  return day - dow * DAY_MS;
}

type Grain = "hour" | "day" | "week";

function bucketStart(t: number, grain: Grain): number {
  return grain === "hour" ? istHourStart(t) : grain === "day" ? istDayStart(t) : istWeekStart(t);
}

function grainStep(grain: Grain): number {
  return grain === "hour" ? HOUR_MS : grain === "day" ? DAY_MS : WEEK_MS;
}

function istLabel(t: number, grain: Grain): { label: string; title: string } {
  const d = new Date(t + IST_MS);
  const day = d.getUTCDate();
  const mon = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  if (grain === "hour") {
    const h = String(d.getUTCHours()).padStart(2, "0");
    return { label: `${h}h`, title: `${day} ${mon}, ${h}:00–${String((d.getUTCHours() + 1) % 24).padStart(2, "0")}:00 IST` };
  }
  if (grain === "day") {
    return { label: `${day} ${mon}`, title: `${day} ${mon} ${year} (IST)` };
  }
  return { label: `${day} ${mon}`, title: `Week beginning ${day} ${mon} ${year} (IST)` };
}

function isoDate(t: number): string {
  const d = new Date(t + IST_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/* ── Attribution helpers ──────────────────────────────────────────────── */

const SOURCE_LABEL: Record<string, string> = {
  direct: "Direct",
  organic_search: "Organic search",
  social: "Social",
  referral: "Referral",
  campaign: "Campaign (UTM)",
};

const SOURCE_ORDER = ["campaign", "social", "organic_search", "referral", "direct"];

function refHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./i, "");
    // classifySource() buckets a faiceoff.com referrer as "direct" — our own
    // pages introduced nobody. Counting it as a top referrer host here would
    // make this panel contradict the Source panel beside it.
    if (/(^|\.)faiceoff\.com$/i.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

/** signup_utm is jsonb; be tolerant of it arriving as a string. */
function asUtm(raw: unknown): Record<string, string> | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : null;
    } catch {
      return null;
    }
  }
  return typeof raw === "object" ? (raw as Record<string, string>) : null;
}

function topN(counts: Map<string, number>, n: number): Array<[string, number]> {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/* ── Row shapes (the admin client is untyped by design — see CLAUDE.md) ─ */

interface UserRow {
  id: string;
  role: string | null;
  created_at: string;
  signup_source: string | null;
  signup_referrer: string | null;
  signup_landing_path: string | null;
  signup_utm: unknown;
}
interface CreatorRow {
  id: string;
  user_id: string;
  onboarding_step: string | null;
  is_active: boolean | null;
  is_verified: boolean | null;
  kyc_status: string | null;
  profile_published: boolean | null;
  lifetime_earned_gross_paise: number | null;
  created_at: string;
}
interface BrandRow {
  id: string;
  user_id: string;
  company_name: string | null;
  is_verified: boolean | null;
  created_at: string;
}
interface RequestRow {
  id: string;
  brand_id: string;
  creator_id: string;
  status: string;
  package_price_paise: number | null;
  created_at: string;
  decided_at: string | null;
  paid_at: string | null;
}
interface ApprovalRow {
  brand_id: string;
  creator_id: string;
  status: string;
  decided_at: string | null;
}
interface LicenceRow {
  creator_id: string | null;
  creator_share_paise: number | null;
  platform_share_paise: number | null;
  amount_paid_paise: number | null;
  issued_at: string;
}
interface VerificationRow {
  creator_id: string;
  status: string | null;
  submitted_at: string | null;
}

// Read caps. At current volumes these are never hit; if one ever is, the page
// says so rather than silently reporting a truncated number as fact.
const CAP_SMALL = 5_000;
const CAP_LARGE = 20_000;

export default async function FunnelPage({ params, searchParams }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const sp = await searchParams;
  const w: WindowKey = (WINDOW_KEYS as readonly string[]).includes(sp.w ?? "")
    ? (sp.w as WindowKey)
    : "7d";

  const session = await getCurrentSession();
  void logAudit({ action: "funnel.view", sessionId: session?.id ?? null, payload: { window: w } });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const now = Date.now();
  const today = istDayStart(now);
  const sinceMs: number | null =
    w === "today" ? today : w === "7d" ? today - 6 * DAY_MS : w === "30d" ? today - 29 * DAY_MS : null;

  const inWindow = (iso: string | null | undefined): boolean => {
    if (!iso) return false;
    if (sinceMs === null) return true;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && t >= sinceMs;
  };

  // Every read is independent — fire them together.
  const [usersRes, creatorsRes, brandsRes, photosRes, verifsRes, requestsRes, approvalsRes, licencesRes] =
    await Promise.all([
      admin
        .from("users")
        .select("id, role, created_at, signup_source, signup_referrer, signup_landing_path, signup_utm")
        .order("created_at", { ascending: false })
        .limit(CAP_SMALL),
      admin
        .from("creators")
        .select(
          "id, user_id, onboarding_step, is_active, is_verified, kyc_status, profile_published, lifetime_earned_gross_paise, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(CAP_SMALL),
      admin
        .from("brands")
        .select("id, user_id, company_name, is_verified, created_at")
        .order("created_at", { ascending: false })
        .limit(CAP_SMALL),
      admin.from("creator_reference_photos").select("creator_id").limit(CAP_LARGE),
      admin.from("creator_verifications").select("creator_id, status, submitted_at").limit(CAP_SMALL),
      admin
        .from("collab_requests")
        .select("id, brand_id, creator_id, status, package_price_paise, created_at, decided_at, paid_at")
        .order("created_at", { ascending: false })
        .limit(CAP_LARGE),
      admin
        .from("approvals")
        .select("brand_id, creator_id, status, decided_at")
        .order("created_at", { ascending: false })
        .limit(CAP_LARGE),
      admin
        .from("licenses")
        .select("creator_id, creator_share_paise, platform_share_paise, amount_paid_paise, issued_at")
        .order("issued_at", { ascending: false })
        .limit(CAP_LARGE),
    ]);

  const users = (usersRes.data ?? []) as UserRow[];
  const creators = (creatorsRes.data ?? []) as CreatorRow[];
  const brands = (brandsRes.data ?? []) as BrandRow[];
  const photos = (photosRes.data ?? []) as Array<{ creator_id: string }>;
  const verifications = (verifsRes.data ?? []) as VerificationRow[];
  const requests = (requestsRes.data ?? []) as RequestRow[];
  const approvals = (approvalsRes.data ?? []) as ApprovalRow[];
  const licences = (licencesRes.data ?? []) as LicenceRow[];

  const errors = [usersRes, creatorsRes, brandsRes, photosRes, verifsRes, requestsRes, approvalsRes, licencesRes]
    .map((r) => r?.error?.message)
    .filter(Boolean) as string[];

  const truncated =
    users.length >= CAP_SMALL ||
    creators.length >= CAP_SMALL ||
    brands.length >= CAP_SMALL ||
    photos.length >= CAP_LARGE ||
    requests.length >= CAP_LARGE ||
    approvals.length >= CAP_LARGE ||
    licences.length >= CAP_LARGE;

  /* ── 1. Acquisition ─────────────────────────────────────────────────── */

  const windowUsers = users.filter((u) => inWindow(u.created_at));

  const signupTimes = windowUsers
    .map((u) => ({ t: new Date(u.created_at).getTime(), role: u.role ?? "" }))
    .filter((x) => Number.isFinite(x.t));

  // Grain: hourly for a single day, daily up to ~9 weeks, weekly beyond.
  const earliest = signupTimes.length > 0 ? Math.min(...signupTimes.map((x) => x.t)) : now;
  const rangeStart = sinceMs ?? Math.min(earliest, today);
  const spanDays = Math.max(0, (now - rangeStart) / DAY_MS);
  let grain: Grain = w === "today" ? "hour" : spanDays <= 62 ? "day" : "week";
  // Safety valve: never render an absurd number of columns.
  if ((now - rangeStart) / grainStep(grain) > 120) grain = grain === "hour" ? "day" : "week";

  const firstBucket = bucketStart(rangeStart, grain);
  const lastBucket = bucketStart(now, grain);
  const step = grainStep(grain);

  const bucketMap = new Map<number, { creator: number; brand: number; other: number }>();
  for (let t = firstBucket; t <= lastBucket; t += step) {
    bucketMap.set(t, { creator: 0, brand: 0, other: 0 });
  }
  for (const s of signupTimes) {
    const key = bucketStart(s.t, grain);
    const slot = bucketMap.get(key);
    if (!slot) continue; // outside the drawn range
    if (s.role === "creator") slot.creator += 1;
    else if (s.role === "brand") slot.brand += 1;
    else slot.other += 1;
  }

  const buckets: Bucket[] = [...bucketMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => {
      const { label, title } = istLabel(t, grain);
      return { label, title, ...v };
    });

  const signupsCreator = windowUsers.filter((u) => u.role === "creator").length;
  const signupsBrand = windowUsers.filter((u) => u.role === "brand").length;

  /* ── 2. Attribution ─────────────────────────────────────────────────── */

  // When attribution actually started being recorded — anything before this is
  // NULL for a structural reason, not because those people came from nowhere.
  const recordedTimes = users
    .filter((u) => u.signup_source)
    .map((u) => new Date(u.created_at).getTime())
    .filter((t) => Number.isFinite(t));
  const attributionStart = recordedTimes.length > 0 ? Math.min(...recordedTimes) : null;

  const sourceCounts = new Map<string, number>();
  const hostCounts = new Map<string, number>();
  const campaignCounts = new Map<string, number>();
  const campaignDetail = new Map<string, string>();
  const landingCounts = new Map<string, number>();
  let unrecorded = 0;
  // Each breakdown gets its own denominator — dividing referrer hosts by every
  // attributed signup would understate a host, since direct traffic has no
  // referrer to attribute in the first place.
  let withReferrer = 0;
  let withCampaign = 0;
  let withLanding = 0;

  for (const u of windowUsers) {
    if (!u.signup_source) {
      unrecorded += 1;
    } else {
      bump(sourceCounts, u.signup_source);
    }
    const host = refHost(u.signup_referrer);
    if (host) {
      bump(hostCounts, host);
      withReferrer += 1;
    }
    const utm = asUtm(u.signup_utm);
    if (utm) {
      const campaign = utm.campaign || utm.source || null;
      if (campaign) {
        bump(campaignCounts, campaign);
        withCampaign += 1;
        const detail = [utm.source && `source: ${utm.source}`, utm.medium && `medium: ${utm.medium}`]
          .filter(Boolean)
          .join(" · ");
        if (detail) campaignDetail.set(campaign, detail);
      }
    }
    if (u.signup_landing_path) {
      bump(landingCounts, u.signup_landing_path);
      withLanding += 1;
    }
  }

  const recordedInWindow = windowUsers.length - unrecorded;

  const sourceRows: BreakdownRow[] = [
    ...SOURCE_ORDER.filter((k) => sourceCounts.has(k)).map((k) => ({
      label: SOURCE_LABEL[k] ?? k,
      count: sourceCounts.get(k) ?? 0,
    })),
    // Any bucket the classifier invents later still shows up.
    ...[...sourceCounts.keys()]
      .filter((k) => !SOURCE_ORDER.includes(k))
      .map((k) => ({ label: SOURCE_LABEL[k] ?? k, count: sourceCounts.get(k) ?? 0 })),
    ...(unrecorded > 0
      ? [
          {
            label: "Not recorded",
            count: unrecorded,
            detail: attributionStart
              ? `Signed up before attribution shipped (${isoDate(attributionStart)}), or the browser blocked localStorage.`
              : "Attribution has not recorded a single signup yet — nobody has signed up since migration 00079 went live.",
            unrecorded: true,
          },
        ]
      : []),
  ];

  const hostRows: BreakdownRow[] = topN(hostCounts, 10).map(([host, count]) => ({ label: host, count }));
  const campaignRows: BreakdownRow[] = topN(campaignCounts, 10).map(([c, count]) => ({
    label: c,
    count,
    detail: campaignDetail.get(c),
  }));
  const landingRows: BreakdownRow[] = topN(landingCounts, 10).map(([p, count]) => ({ label: p, count }));

  /* ── 3 + 4. Funnels ─────────────────────────────────────────────────── */

  const photoCreatorIds = new Set(photos.map((p) => p.creator_id));
  const submittedVerification = new Set(
    verifications.filter((v) => !!v.submitted_at || (v.status && v.status !== "not_started")).map((v) => v.creator_id),
  );
  const creatorsWithRequest = new Set(requests.map((r) => r.creator_id));
  const brandsWithRequest = new Set(requests.map((r) => r.brand_id));
  const brandsPaid = new Set(requests.filter((r) => r.status === "paid" || !!r.paid_at).map((r) => r.brand_id));
  const brandsApproved = new Set(approvals.filter((a) => a.status === "approved").map((a) => a.brand_id));

  const creatorsWithLicence = new Set(
    licences.map((l) => l.creator_id).filter((x): x is string => !!x),
  );

  const cohortCreators = creators.filter((c) => inWindow(c.created_at));
  const cohortBrands = brands.filter((b) => inWindow(b.created_at));

  const creatorSteps: FunnelStep[] = [
    { label: "Signed up", count: cohortCreators.length, definition: "A creators row exists for them." },
    {
      // Photo upload is step 6 of onboarding, so it necessarily comes BEFORE
      // 'complete'. Listed after it, the drop-off column compared two steps in
      // the wrong order and permanently showed the "+n vs prev" escape hatch —
      // hiding the single biggest real drop in this product, which is people
      // who upload their face and then never finish.
      label: "Uploaded photos",
      count: cohortCreators.filter((c) => photoCreatorIds.has(c.id)).length,
      definition: "At least one reference photo on file — onboarding step 6 of 8.",
    },
    {
      label: "Finished onboarding",
      count: cohortCreators.filter((c) => c.onboarding_step === "complete").length,
      definition: "onboarding_step reached 'complete' — every step done.",
    },
    {
      label: "Submitted verification",
      count: cohortCreators.filter((c) => submittedVerification.has(c.id)).length,
      definition: "Sent Aadhaar + PAN to the verification queue.",
    },
    {
      label: "Verified",
      count: cohortCreators.filter((c) => c.is_verified === true).length,
      definition: "Operator approved them — this is what makes them visible in Discover.",
    },
    {
      label: "Published a public profile",
      count: cohortCreators.filter((c) => c.profile_published === true).length,
      definition: "Hit Publish on /creator/profile/setup, so /creators/<slug> is live.",
    },
    {
      label: "Received a collab request",
      count: cohortCreators.filter((c) => creatorsWithRequest.has(c.id)).length,
      definition: "A brand sent them at least one request, in any status.",
    },
    {
      // NOT creators.lifetime_earned_gross_paise. That rollup column is written
      // only by the commit_image_approval RPC (migration 00029), which nothing
      // in live code calls — so it sits at its `default 0` for every creator
      // and this step read a flat zero forever. A licence issued in their name
      // IS the money event: it is written by the approval route in the same
      // transaction that credits escrow.
      label: "Earned",
      count: cohortCreators.filter((c) => creatorsWithLicence.has(c.id)).length,
      definition: "At least one licence issued in their name — real money recognised, not a rollup column.",
    },
  ];

  const brandSteps: FunnelStep[] = [
    { label: "Signed up", count: cohortBrands.length, definition: "A brands row exists for them." },
    {
      label: "Completed onboarding",
      count: cohortBrands.filter((b) => (b.company_name ?? "").trim() !== "").length,
      definition: "company_name filled in — signup writes it as an empty placeholder.",
    },
    {
      label: "Verified",
      count: cohortBrands.filter((b) => b.is_verified === true).length,
      definition: "Operator approved their GST / company details. Not required to send a request.",
    },
    {
      label: "Sent a collab request",
      count: cohortBrands.filter((b) => brandsWithRequest.has(b.id)).length,
      definition: "At least one collab_requests row, in any status.",
    },
    {
      label: "Paid for a collab",
      count: cohortBrands.filter((b) => brandsPaid.has(b.id)).length,
      definition: "A request of theirs reached 'paid' — real money in.",
    },
    {
      label: "Got an image approved",
      count: cohortBrands.filter((b) => brandsApproved.has(b.id)).length,
      definition: "A creator approved one of their generations, so a licence exists.",
    },
  ];

  /* ── 5. Money ───────────────────────────────────────────────────────── */

  const requestsSent = requests.filter((r) => inWindow(r.created_at));
  const requestsAccepted = requests.filter(
    (r) => inWindow(r.decided_at) && (r.status === "accepted" || r.status === "paid"),
  );
  const requestsDeclined = requests.filter((r) => inWindow(r.decided_at) && r.status === "declined");
  const requestsPaid = requests.filter((r) => inWindow(r.paid_at));
  const gmvPaise = requestsPaid.reduce((s, r) => s + (r.package_price_paise ?? 0), 0);

  // The counts above are EVENT-timed — "how many were accepted / paid during
  // this window", regardless of when they were sent. That is the right
  // headline, but it is the wrong numerator for a rate: a week can pay more
  // collabs than it accepted if some were accepted the week before, which
  // would print "160% of accepted". These two are COHORT-timed instead — both
  // drawn from the requests SENT in the window, so each numerator is a strict
  // subset of one shared denominator and a rate can never exceed 100%.
  const sentThenAccepted = requestsSent.filter(
    (r) => r.status === "accepted" || r.status === "paid",
  ).length;
  const sentThenPaid = requestsSent.filter((r) => !!r.paid_at).length;

  const licencesInWindow = licences.filter((l) => inWindow(l.issued_at));
  const platformPaise = licencesInWindow.reduce((s, l) => s + (l.platform_share_paise ?? 0), 0);
  const creatorPaise = licencesInWindow.reduce((s, l) => s + (l.creator_share_paise ?? 0), 0);

  const windowLabel =
    w === "today" ? "today" : w === "7d" ? "the last 7 days" : w === "30d" ? "the last 30 days" : "all time";
  const rangeText =
    sinceMs === null
      ? users.length > 0
        ? `since ${isoDate(earliest)}`
        : "no data yet"
      : `${isoDate(sinceMs)} → today (IST)`;

  return (
    <>
      <PageHeader
        title="Funnel"
        subtitle={`Where signups come from and where they stop — built from our own tables, not PostHog · ${rangeText}`}
        actions={<WindowSwitcher basePath={`/${ccSlug}/funnel`} active={w} />}
      />

      {errors.length > 0 && (
        <div
          className="cc-card"
          style={{ background: "rgba(210,67,67,0.08)", borderColor: "rgba(210,67,67,0.3)", marginBottom: 16 }}
        >
          <p className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-bad)", margin: 0 }}>
            {errors.length} query error{errors.length === 1 ? "" : "s"}: {errors.join(" · ")}
          </p>
        </div>
      )}

      {truncated && (
        <div style={{ marginBottom: 16 }}>
          <Note tone="warn">
            One of the reads hit its row cap, so at least one number below is a floor, not a total. Time to move these
            aggregates into SQL views instead of counting rows in the page.
          </Note>
        </div>
      )}

      {/* ── Headline ──────────────────────────────────────────────────── */}
      <div className="cc-grid cc-grid-4" style={{ marginBottom: 16 }}>
        <Kpi
          label="Signups"
          value={fmtNum(windowUsers.length)}
          sub={`${fmtNum(signupsCreator)} creator · ${fmtNum(signupsBrand)} brand`}
        />
        <Kpi
          label="Attributed"
          value={windowUsers.length === 0 ? "—" : `${fmtNum(recordedInWindow)}`}
          sub={
            windowUsers.length === 0
              ? "no signups in window"
              : `${windowUsers.length >= MIN_DENOMINATOR ? pct(recordedInWindow, windowUsers.length) : `of ${fmtNum(windowUsers.length)}`} have a recorded source`
          }
          tone={recordedInWindow === 0 && windowUsers.length > 0 ? "warn" : undefined}
        />
        <Kpi label="Collabs paid" value={fmtNum(requestsPaid.length)} sub={`${fmtNum(requestsSent.length)} requests sent`} />
        <Kpi label="GMV" value={fmtINR(gmvPaise)} sub={`paid ${windowLabel}`} />
      </div>

      {/* ── Acquisition ───────────────────────────────────────────────── */}
      <div className="cc-card" style={{ marginBottom: 16 }}>
        <h2 className="cc-card-title">
          Signups per {grain === "hour" ? "hour" : grain === "day" ? "day" : "week"} · IST
        </h2>
        <SignupBars buckets={buckets} />
      </div>

      {/* ── Attribution ───────────────────────────────────────────────── */}
      <div className="cc-section-divider" />
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px 0" }}>Where they came from</h2>
      <p style={{ fontSize: 12, color: "var(--cc-fg-muted)", margin: "0 0 12px 0" }}>
        First touch, captured on the visitor&apos;s very first page view and stored on their users row — so the
        Instagram post that actually introduced them keeps the credit even if they sign up three days later.
      </p>

      <div style={{ marginBottom: 12 }}>
        {attributionStart ? (
          <Note>
            Attribution has only been recorded since <strong>{isoDate(attributionStart)}</strong>. Anyone who signed up
            before that has no source at all — they appear as &ldquo;Not recorded&rdquo;, never as
            &ldquo;Direct&rdquo;. Judge channel mix on signups from that date forward.
          </Note>
        ) : (
          <Note tone="warn">
            No signup has carried attribution yet. The columns exist (migration 00079) but nobody has signed up since
            they went live, so this whole section starts from the next signup.
          </Note>
        )}
      </div>

      <div className="cc-grid cc-grid-2" style={{ marginBottom: 16 }}>
        <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
          <div style={{ padding: "14px 16px 0" }}>
            <h2 className="cc-card-title" style={{ marginBottom: 8 }}>
              Source
            </h2>
          </div>
          <Breakdown
            rows={sourceRows}
            total={windowUsers.length}
            labelHeader="Bucket"
            emptyText="No signups in this window."
          />
        </div>

        <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
          <div style={{ padding: "14px 16px 0" }}>
            <h2 className="cc-card-title" style={{ marginBottom: 8 }}>
              Top referrer hosts
            </h2>
          </div>
          <Breakdown
            rows={hostRows}
            total={withReferrer}
            labelHeader="Host"
            emptyText="No referrer recorded yet — every attributed signup so far arrived with an empty document.referrer (direct, or a link opened from an app that strips it)."
          />
        </div>
      </div>

      <div className="cc-grid cc-grid-2" style={{ marginBottom: 16 }}>
        <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
          <div style={{ padding: "14px 16px 0" }}>
            <h2 className="cc-card-title" style={{ marginBottom: 8 }}>
              Top UTM campaigns
            </h2>
            <p style={{ fontSize: 11, color: "var(--cc-fg-muted)", margin: "0 0 10px 0" }}>
              Counts any UTM-tagged link. A link tagged with only{" "}
              <code>utm_campaign</code> appears here but is bucketed by its referrer in
              Source above — only <code>utm_source</code> makes a signup &ldquo;Campaign&rdquo;.
            </p>
          </div>
          <Breakdown
            rows={campaignRows}
            total={withCampaign}
            labelHeader="Campaign"
            emptyText="No UTM-tagged link has produced a signup in this window. Tag campaign links with ?utm_source=&utm_campaign= and they show up here."
          />
        </div>

        <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
          <div style={{ padding: "14px 16px 0" }}>
            <h2 className="cc-card-title" style={{ marginBottom: 8 }}>
              Landing pages that converted
            </h2>
          </div>
          <Breakdown
            rows={landingRows}
            total={withLanding}
            labelHeader="First page opened"
            emptyText="No landing page recorded yet."
          />
        </div>
      </div>

      {/* ── Creator funnel ────────────────────────────────────────────── */}
      <div className="cc-section-divider" />
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px 0" }}>Creator funnel</h2>
      <p style={{ fontSize: 12, color: "var(--cc-fg-muted)", margin: "0 0 12px 0" }}>
        Of the {fmtNum(cohortCreators.length)} creator{cohortCreators.length === 1 ? "" : "s"} who signed up{" "}
        {windowLabel}, how far each has got <em style={{ fontStyle: "normal", color: "var(--cc-fg)" }}>as of now</em>.
        Late steps take weeks, so a short window will always look bottom-heavy — that is the cohort ageing, not a
        collapse.
        {cohortCreators.length > 0 && cohortCreators.length < MIN_DENOMINATOR && (
          <> Fewer than {MIN_DENOMINATOR} in this cohort, so rates are shown as raw counts.</>
        )}
      </p>
      <FunnelTable steps={creatorSteps} />

      {/* ── Brand funnel ──────────────────────────────────────────────── */}
      <div className="cc-section-divider" />
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px 0" }}>Brand funnel</h2>
      <p style={{ fontSize: 12, color: "var(--cc-fg-muted)", margin: "0 0 12px 0" }}>
        Of the {fmtNum(cohortBrands.length)} brand{cohortBrands.length === 1 ? "" : "s"} who signed up {windowLabel}.
        Verification is not a gate on sending a request, so &ldquo;Sent a collab request&rdquo; can legitimately be
        larger than &ldquo;Verified&rdquo;.
      </p>
      <FunnelTable steps={brandSteps} />

      {/* ── Money ─────────────────────────────────────────────────────── */}
      <div className="cc-section-divider" />
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px 0" }}>Money in this window</h2>
      <p style={{ fontSize: 12, color: "var(--cc-fg-muted)", margin: "0 0 12px 0" }}>
        Counted by when each event happened, not by when the request was created: sent by created_at, accepted by
        decided_at, paid by paid_at.
      </p>

      <div className="cc-grid cc-grid-4" style={{ marginBottom: 12 }}>
        <Kpi label="Requests sent" value={fmtNum(requestsSent.length)} sub={`${fmtNum(requestsDeclined.length)} declined`} />
        <Kpi
          label="Accepted"
          value={fmtNum(requestsAccepted.length)}
          sub={
            requestsSent.length >= MIN_DENOMINATOR
              ? `${pct(sentThenAccepted, requestsSent.length)} of the ${fmtNum(requestsSent.length)} sent in this window`
              : `${fmtNum(requestsSent.length)} sent — too few to rate`
          }
        />
        <Kpi
          label="Paid"
          value={fmtNum(requestsPaid.length)}
          sub={
            requestsSent.length >= MIN_DENOMINATOR
              ? `${pct(sentThenPaid, requestsSent.length)} of the ${fmtNum(requestsSent.length)} sent in this window`
              : `${fmtNum(requestsSent.length)} sent — too few to rate`
          }
          tone={requestsPaid.length > 0 ? "ok" : undefined}
        />
        <Kpi label="GMV" value={fmtINR(gmvPaise)} sub="package price of everything paid" />
      </div>

      <div className="cc-grid cc-grid-3">
        <Kpi
          label="Platform commission"
          value={fmtINR(platformPaise)}
          sub={`recognised on ${fmtNum(licencesInWindow.length)} licence${licencesInWindow.length === 1 ? "" : "s"} issued`}
          tone={platformPaise > 0 ? "ok" : undefined}
        />
        <Kpi label="Creator share" value={fmtINR(creatorPaise)} sub="on the same licences" />
        <Kpi
          label="Avg package"
          value={requestsPaid.length === 0 ? "—" : fmtINR(Math.round(gmvPaise / requestsPaid.length))}
          sub={requestsPaid.length === 0 ? "nothing paid in window" : `across ${fmtNum(requestsPaid.length)} paid`}
        />
      </div>

      <p style={{ fontSize: 11, color: "var(--cc-fg-dim)", margin: "12px 0 0 0", lineHeight: 1.6 }}>
        GMV is money in — the package price of collabs paid in this window. Commission and creator share are money
        recognised, taken from the licences actually issued in the window, so the two will not line up inside a short
        window: a collab is paid on day one and its licences are issued image by image as the creator approves them.
      </p>
    </>
  );
}
