# Chunk D — End-to-End Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the complete 5-stage Book → Accept → Generate → Approve → Close flow with every page, component, real-time update, and motion spec demanded by the Chunk D design doc.

**Architecture:** Chunk B's role-scoped shells are the container; Chunk C's APIs, ledgers, and PL/pgSQL procedures are the data layer; this chunk glues them with TanStack Query for server state, Supabase Realtime for chat + notifications, Inngest Realtime for the per-image generation pipeline, and a Framer-Motion + Lottie motion system.

**Tech Stack additions:** `@tanstack/react-query` (server state), `lottie-react` (hero celebrations), `recharts` (earnings chart), `@inngest/realtime` (pipeline progress), `react-virtuoso` (long galleries). Everything else already in Chunk C stack.

> **Before starting Chunk D:** Chunk B must be merged (shells + route tree). The legacy `src/app/(dashboard)/` tree remains but is no longer user-facing.

---

## File Structure

### Create — core plumbing
```
src/lib/realtime/
  supabase-channel.ts                             # Typed Supabase Realtime client wrapper
  inngest-realtime.ts                             # Typed Inngest Realtime subscriber

src/lib/hooks/
  use-credits-balance.ts
  use-creator-list.ts
  use-creator-profile.ts
  use-license-listings.ts
  use-license.ts
  use-license-messages.ts
  use-generations.ts
  use-generation-pipeline.ts                      # Inngest realtime subscriber hook
  use-approvals.ts
  use-earnings.ts
  use-withdrawals.ts
  use-notifications.ts
  use-sessions.ts
  use-disputes.ts

src/components/providers/
  query-provider.tsx                              # TanStack Query boundary
```

### Create — components (mirrors spec §8 inventory)
```
src/components/brand/
  creator-card.tsx
  creator-profile-header.tsx
  license-card-listing.tsx
  license-request-form.tsx
  checkout-summary.tsx
  credits-balance-widget.tsx
  credit-pack-selector.tsx
  active-licenses-strip.tsx
  quick-actions-grid.tsx

src/components/creator/
  request-card-inbox.tsx
  request-detail-view.tsx
  contract-viewer.tsx
  approval-queue-card.tsx
  approval-review-panel.tsx
  earnings-hero.tsx
  earnings-chart.tsx
  withdrawal-form.tsx
  withdrawal-breakdown.tsx
  license-listing-editor.tsx
  kyc-stepper.tsx
  reference-photo-grid.tsx

src/components/shared/
  license-progress-bar.tsx
  generation-progress-pipeline.tsx
  image-gallery.tsx
  image-card.tsx
  image-lightbox.tsx
  chat-thread.tsx
  chat-message.tsx
  chat-composer.tsx
  sla-countdown.tsx
  session-status-badge.tsx
  rating-input.tsx
  ledger-timeline.tsx
  dispute-raise-dialog.tsx
  dispute-detail.tsx
  empty-state.tsx
  loading-skeleton.tsx

src/components/animations/
  number-counter.tsx
  checkmark-draw.tsx
  staggered-list.tsx
  generation-scan-reveal.tsx
  lottie-confetti.tsx
  lottie-success.tsx
  lottie-empty-state.tsx
  lottie-payment-landed.tsx
  lottie-bank-transfer.tsx
```

### Create — API routes (new)
```
src/app/api/creators/list/route.ts                # Browse w/ filters
src/app/api/creators/[id]/route.ts                # Public profile
src/app/api/brand/dashboard/route.ts              # Dashboard aggregate
src/app/api/creator/dashboard/route.ts            # Dashboard aggregate
src/app/api/licenses/[id]/messages/route.ts       # GET + POST messages
src/app/api/images/generate/route.ts              # Kick off generation/created
src/app/api/images/[id]/approve/route.ts
src/app/api/images/[id]/reject/route.ts
src/app/api/images/[id]/download/route.ts         # Signed R2 URL
src/app/api/sessions/list/route.ts
src/app/api/sessions/[id]/route.ts
src/app/api/sessions/[id]/rate/route.ts
src/app/api/notifications/route.ts                # GET + PATCH (mark read)
src/app/api/notifications/mark-all-read/route.ts
src/app/api/disputes/route.ts                     # POST raise
src/app/api/disputes/[id]/route.ts                # GET detail
src/app/api/disputes/[id]/resolve/route.ts        # Admin only
src/app/api/onboarding/brand/save-step/route.ts
src/app/api/onboarding/brand/complete/route.ts
src/app/api/onboarding/creator/save-step/route.ts # (may already exist — check)
src/app/api/reference-photos/route.ts             # GET + POST (upload)
src/app/api/reference-photos/[id]/route.ts        # DELETE
src/app/api/license-listings/route.ts             # Creator CRUD (may use Chunk C routes)
```

### Create — pages (every route under /brand, /creator, /admin, /u now has content)

See Chunk B plan for the route list; every stub gets replaced with a real page. Detailed assignments below per phase.

### Create — new migration
```
supabase/migrations/00032_chat_and_notifications.sql
  - license_messages (id, license_request_id, sender_id, body, attachment_url, created_at, read_at)
  - notifications (id, user_id, type, title, body, payload_jsonb, read_at, created_at)
  - creator_ratings (id, session_id, brand_id, creator_id, rating INT 1-5, text, created_at)

supabase/migrations/00033_disputes.sql
  - disputes (id, raised_by, target_entity_type, target_entity_id, reason, description, status enum, resolution, resolved_by, resolved_at, created_at)
  - dispute_messages (id, dispute_id, sender_id, body, created_at)
```

### Modify
```
src/inngest/functions/generation/generation-pipeline.ts   # Rewire to new ledgers
src/inngest/functions/generation/                         # Add new: emit pipeline progress events
src/components/providers/providers.tsx                    # Wrap with QueryProvider
```

---

## Phase 0 — Foundations

### Task 1: Install net-new deps + QueryProvider

**Files:**
- Modify: `package.json`
- Create: `src/components/providers/query-provider.tsx`
- Modify: `src/components/providers/providers.tsx`

- [ ] **Step 1: Install packages**

```bash
pnpm add @tanstack/react-query @tanstack/react-query-devtools lottie-react recharts react-virtuoso @inngest/realtime
```

Expected: packages resolve, no peer-dep warnings (React 19 compatible). If `@inngest/realtime` is not available yet, skip it and use polling fallback in Task 15 — flagged there.

- [ ] **Step 2: Create QueryProvider**

```tsx
// src/components/providers/query-provider.tsx
"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 3: Wire into root providers**

In `src/components/providers/providers.tsx`, wrap children with `<QueryProvider>` inside the existing tree (outermost is usually AuthProvider or ThemeProvider — keep Auth outside Query so auth context is ready when queries fire).

- [ ] **Step 4: Run typecheck + build**

```bash
pnpm tsc --noEmit && pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/providers/
git commit -m "feat(deps): add TanStack Query, Lottie, recharts, virtuoso + QueryProvider"
```

---

### Task 2: Supabase Realtime client wrapper

**Files:**
- Create: `src/lib/realtime/supabase-channel.ts`
- Test: `src/lib/realtime/__tests__/supabase-channel.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { buildChannelName } from "../supabase-channel";

describe("buildChannelName", () => {
  it("produces scoped channel names", () => {
    expect(buildChannelName("license-messages", "lic_123")).toBe("license-messages:lic_123");
    expect(buildChannelName("user-notifications", "u_abc")).toBe("user-notifications:u_abc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/realtime/__tests__/supabase-channel.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/realtime/supabase-channel.ts
import { createBrowserClient } from "@supabase/ssr";
import type { RealtimeChannel } from "@supabase/supabase-js";

export function buildChannelName(scope: string, id: string): string {
  return `${scope}:${id}`;
}

function browserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  );
}

/**
 * Subscribe to Postgres row changes on a table filtered by a column value.
 * Returns an unsubscribe function.
 *
 * Example:
 *   subscribeRows({
 *     table: "license_messages",
 *     filterColumn: "license_request_id",
 *     filterValue: licenseId,
 *     onInsert: (row) => ...,
 *   })
 */
export function subscribeRows<Row>(opts: {
  table: string;
  filterColumn: string;
  filterValue: string;
  onInsert?: (row: Row) => void;
  onUpdate?: (row: Row) => void;
  onDelete?: (row: Row) => void;
}): () => void {
  const supabase = browserSupabase();
  const channelName = buildChannelName(opts.table, opts.filterValue);
  const channel: RealtimeChannel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: opts.table,
        filter: `${opts.filterColumn}=eq.${opts.filterValue}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as Row;
        if (payload.eventType === "INSERT") opts.onInsert?.(row);
        else if (payload.eventType === "UPDATE") opts.onUpdate?.(row);
        else if (payload.eventType === "DELETE") opts.onDelete?.(row);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/realtime/__tests__/supabase-channel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/realtime/
git commit -m "feat(realtime): Supabase channel subscribe helper"
```

---

### Task 3: Inngest Realtime subscriber hook

**Files:**
- Create: `src/lib/realtime/inngest-realtime.ts`
- Create: `src/lib/hooks/use-generation-pipeline.ts`

- [ ] **Step 1: Build the Inngest realtime subscriber**

If `@inngest/realtime` is available, follow its docs. Otherwise implement a **polling fallback** that hits `/api/generations/[id]` every 2s until status is `AWAITING_APPROVAL`, `FAILED`, or `DELIVERED`.

```typescript
// src/lib/realtime/inngest-realtime.ts
export interface PipelineStage {
  step: "compliance" | "prompt_assembly" | "image" | "safety" | "done";
  status: "pending" | "running" | "done" | "failed";
  startedAt?: string;
  endedAt?: string;
}

export interface PipelineSnapshot {
  generationId: string;
  status: "pending" | "generating" | "awaiting_approval" | "delivered" | "rejected" | "failed";
  stages: PipelineStage[];
}

/**
 * Polls /api/generations/[id] every 2s until terminal.
 * Returns an unsubscribe function.
 */
export function subscribePipeline(
  generationId: string,
  onUpdate: (snap: PipelineSnapshot) => void,
): () => void {
  let active = true;
  const terminal = new Set(["awaiting_approval", "delivered", "rejected", "failed"]);

  async function tick() {
    if (!active) return;
    try {
      const res = await fetch(`/api/generations/${generationId}`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as PipelineSnapshot;
        onUpdate(data);
        if (terminal.has(data.status)) return;
      }
    } catch {
      // swallow; will retry
    }
    if (active) setTimeout(tick, 2000);
  }
  tick();

  return () => {
    active = false;
  };
}
```

- [ ] **Step 2: Hook wrapper**

```typescript
// src/lib/hooks/use-generation-pipeline.ts
"use client";

import { useEffect, useState } from "react";
import { subscribePipeline, type PipelineSnapshot } from "@/lib/realtime/inngest-realtime";

export function useGenerationPipeline(generationId: string | null) {
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);

  useEffect(() => {
    if (!generationId) return;
    const unsubscribe = subscribePipeline(generationId, setSnapshot);
    return unsubscribe;
  }, [generationId]);

  return snapshot;
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/realtime/inngest-realtime.ts src/lib/hooks/use-generation-pipeline.ts
git commit -m "feat(realtime): generation pipeline subscriber (polling fallback)"
```

---

## Phase 1 — Chat + Notifications + Ratings migration

### Task 4: Migration 00032 — chat, notifications, ratings

**Files:**
- Create: `supabase/migrations/00032_chat_and_notifications.sql`

- [ ] **Step 1: Write migration**

```sql
-- 00032_chat_and_notifications.sql

BEGIN;

-- License chat messages
CREATE TABLE public.license_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_request_id UUID NOT NULL REFERENCES public.license_requests(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id),
  body TEXT,
  attachment_url TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  CHECK (body IS NOT NULL OR attachment_url IS NOT NULL)
);

CREATE INDEX license_messages_by_request ON public.license_messages (license_request_id, created_at);

-- Notifications (in-app)
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  payload JSONB,
  link_href TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_by_user_unread ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX notifications_by_user ON public.notifications (user_id, created_at DESC);

-- Creator ratings (brand → creator after session close)
CREATE TABLE public.creator_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.collab_sessions(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, brand_id)
);

CREATE INDEX creator_ratings_by_creator ON public.creator_ratings (creator_id, created_at DESC);

-- RLS
ALTER TABLE public.license_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_ratings ENABLE ROW LEVEL SECURITY;

-- Server writes via admin client; reads via policies below
CREATE POLICY license_messages_read_participants ON public.license_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.license_requests lr
      WHERE lr.id = license_request_id
        AND (lr.brand_id = auth.uid() OR lr.creator_id = auth.uid())
    )
  );

CREATE POLICY notifications_read_own ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY creator_ratings_public_read ON public.creator_ratings
  FOR SELECT TO authenticated USING (true);

COMMIT;
```

- [ ] **Step 2: Commit** (don't run against DB yet — runbook step)

```bash
git add supabase/migrations/00032_chat_and_notifications.sql
git commit -m "feat(db): chat messages + notifications + creator ratings tables"
```

---

### Task 5: Migration 00033 — disputes

**Files:**
- Create: `supabase/migrations/00033_disputes.sql`

- [ ] **Step 1: Write migration**

```sql
-- 00033_disputes.sql

BEGIN;

CREATE TYPE public.dispute_status AS ENUM (
  'open', 'under_review', 'resolved_for_brand', 'resolved_for_creator', 'resolved_split', 'closed_no_action'
);

CREATE TYPE public.dispute_target_type AS ENUM ('generation', 'license_request', 'session');

CREATE TABLE public.disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raised_by UUID NOT NULL REFERENCES public.users(id),
  target_entity_type public.dispute_target_type NOT NULL,
  target_entity_id UUID NOT NULL,
  reason TEXT NOT NULL,
  description TEXT,
  status public.dispute_status NOT NULL DEFAULT 'open',
  resolution TEXT,
  resolved_by UUID REFERENCES public.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX disputes_by_target ON public.disputes (target_entity_type, target_entity_id);
CREATE INDEX disputes_by_status ON public.disputes (status) WHERE status IN ('open', 'under_review');

CREATE TABLE public.dispute_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id),
  body TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX dispute_messages_by_dispute ON public.dispute_messages (dispute_id, created_at);

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_messages ENABLE ROW LEVEL SECURITY;

-- All authenticated writes happen via admin client; read policies below
CREATE POLICY disputes_read_parties ON public.disputes
  FOR SELECT TO authenticated
  USING (
    raised_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY dispute_messages_read_parties ON public.dispute_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.disputes d WHERE d.id = dispute_id AND d.raised_by = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

COMMIT;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00033_disputes.sql
git commit -m "feat(db): disputes + dispute_messages tables"
```

---

## Phase 2 — Rewire generation pipeline to new ledgers

### Task 6: Rewire generation-pipeline.ts to credit_transactions + escrow_ledger

**Files:**
- Modify: `src/inngest/functions/generation/generation-pipeline.ts`
- Test: `src/inngest/functions/generation/__tests__/generation-pipeline.test.ts`

**Context:** The current file writes to the sealed `wallet_transactions_archive`. New ledger is `credit_transactions` + `escrow_ledger` + `platform_revenue_ledger`. Chunk C migrations 00020/00022 created these. Commit helpers live in `src/lib/ledger/commit.ts` (`commitCreditSpend`, `commitImageApproval`).

- [ ] **Step 1: Audit current writes**

Run Grep: `grep -n "wallet_transactions" src/inngest/functions/generation/generation-pipeline.ts` — note every hit.

- [ ] **Step 2: Write the failing test**

Sketch a minimal test that mocks Supabase admin + the commit helpers and verifies the pipeline flow emits the right calls:

```typescript
// src/inngest/functions/generation/__tests__/generation-pipeline.test.ts
import { describe, it, expect, vi } from "vitest";

// Plan: stub `createAdminClient`, `commitCreditSpend`, `commitImageApproval`,
// `runPipelineInference`. Invoke the onFailure handler directly with a mock
// event and assert it calls the refund path (not archive writes).

describe("generation pipeline — new ledger wiring", () => {
  it("onFailure releases escrow via commit_expiry_refund RPC (not archive)", async () => {
    // See implementation after Step 3 — asserts:
    //  - supabase.from("wallet_transactions") NEVER called
    //  - supabase.rpc("commit_expiry_refund", { … }) called once with generation's license_request_id
    expect(true).toBe(true); // placeholder — wire after Step 3
  });

  it("approval step calls commit_image_approval with (license_request_id, generation_id)", async () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 3: Rewrite the file**

Replace every `wallet_transactions` insert with the appropriate commit helper. Key mappings:

| Old write | New path |
|---|---|
| Insert type=`'generation_debit'` into `wallet_transactions` | Was Chunk C moved to `credit_transactions` via license accept flow — **delete** this write from pipeline; escrow was already locked at license acceptance |
| Refund path on pipeline failure | `supabase.rpc("commit_expiry_refund", { p_license_request_id: generation.license_request_id, p_reason: "generation_failed" })` |
| Any "approve/release" logic (shouldn't be here — approval is manual) | Remove if present |

Update the `onFailure` handler:

```typescript
onFailure: async ({ event }) => {
  const admin = createAdminClient();
  const original = (event.data as { event?: { data?: { generation_id?: string } } }).event;
  const generation_id = original?.data?.generation_id;
  if (!generation_id) return;

  const { data: gen } = await admin
    .from("generations")
    .select("id, license_request_id, status")
    .eq("id", generation_id)
    .maybeSingle();
  if (!gen || gen.status === "failed") return;

  // Mark failed + release one slot back to the brand via commit_expiry_refund
  // (single-slot version: PL/pgSQL path will credit brand's escrow back for
  // the per-image release amount and log to audit).
  await admin.from("generations").update({ status: "failed" }).eq("id", generation_id);
  // NOTE: The RPC commit_expiry_refund is defined in migration 00029 and
  // refunds *the whole license if expired*. For single-generation failure
  // we need a smaller RPC. Two paths:
  //
  //   (a) Add a new RPC commit_generation_failure(p_generation_id) that:
  //       - rolls the slot back (generations.slot_number re-usable)
  //       - refunds release_per_image_paise from escrow_ledger to credit_transactions
  //       - logs to audit_log
  //
  //   (b) Inline the same logic here as a transaction block.
  //
  // PICK (a) — create migration 00034 as part of this task (see Step 4).

  await admin.rpc("commit_generation_failure", { p_generation_id: generation_id });
},
```

- [ ] **Step 4: Add migration 00034_generation_failure_rpc.sql**

```sql
-- 00034_generation_failure_rpc.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.commit_generation_failure(p_generation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_license_request_id UUID;
  v_brand_id UUID;
  v_release_paise BIGINT;
  v_slot_number INT;
BEGIN
  SELECT g.license_request_id, g.slot_number
    INTO v_license_request_id, v_slot_number
  FROM public.generations g
  WHERE g.id = p_generation_id
  FOR UPDATE;

  IF v_license_request_id IS NULL THEN
    RAISE EXCEPTION 'generation % not found', p_generation_id;
  END IF;

  SELECT lr.brand_id, ((lr.base_paise)::NUMERIC / lr.image_quota)::BIGINT
    INTO v_brand_id, v_release_paise
  FROM public.license_requests lr
  WHERE lr.id = v_license_request_id
  FOR UPDATE;

  -- Credit brand the per-image release amount back
  INSERT INTO public.credit_transactions (
    user_id, type, amount_paise, reference_id, reference_type, description
  ) VALUES (
    v_brand_id, 'generation_failure_refund', v_release_paise,
    p_generation_id, 'generation', 'Generation failed; slot refunded'
  );

  -- Escrow ledger: release back to brand
  INSERT INTO public.escrow_ledger (
    license_request_id, event_type, amount_paise, actor_type, actor_id, note
  ) VALUES (
    v_license_request_id, 'release_to_brand', v_release_paise, 'system',
    NULL, format('Generation %s failed, slot %s refunded', p_generation_id, v_slot_number)
  );

  INSERT INTO public.audit_log (actor_type, event_type, entity_type, entity_id, details)
  VALUES (
    'system', 'generation_failure_refund', 'generation', p_generation_id,
    jsonb_build_object(
      'license_request_id', v_license_request_id,
      'refund_paise', v_release_paise
    )
  );
END;
$$;

COMMIT;
```

- [ ] **Step 5: Fill in the test cases from Step 2 with real assertions**

Mock `createAdminClient` to return a spy on `.from(...).update(...)` and `.rpc(...)`. Assert no hits on `wallet_transactions`. Assert `commit_generation_failure` called exactly once with the right id.

- [ ] **Step 6: Run tests + build**

```bash
pnpm vitest run src/inngest/functions/generation/__tests__/generation-pipeline.test.ts
pnpm tsc --noEmit && pnpm build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/inngest/functions/generation/generation-pipeline.ts src/inngest/functions/generation/__tests__/ supabase/migrations/00034_generation_failure_rpc.sql
git commit -m "refactor(inngest): generation pipeline uses credit_transactions + escrow_ledger"
```

---

## Phase 3 — Shared animation + utility primitives

### Task 7: number-counter

**Files:**
- Create: `src/components/animations/number-counter.tsx`
- Test: `src/components/animations/__tests__/number-counter.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { NumberCounter } from "../number-counter";

describe("NumberCounter", () => {
  it("renders the value formatted", () => {
    render(<NumberCounter value={123456} format={(n) => `₹${n.toLocaleString("en-IN")}`} />);
    expect(screen.getByText(/₹1,23,456/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implementation**

```tsx
// src/components/animations/number-counter.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

interface Props {
  value: number;
  durationMs?: number;
  format?: (n: number) => string;
  className?: string;
}

export function NumberCounter({ value, durationMs = 800, format = (n) => n.toLocaleString(), className }: Props) {
  const reduceMotion = useReducedMotion();
  const prev = useRef(value);
  const [displayed, setDisplayed] = useState(value);

  useEffect(() => {
    if (reduceMotion) { setDisplayed(value); prev.current = value; return; }
    const start = prev.current;
    const delta = value - start;
    if (delta === 0) return;
    const startedAt = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplayed(Math.round(start + delta * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prev.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs, reduceMotion]);

  return <span className={className}>{format(displayed)}</span>;
}
```

- [ ] **Step 3: Run test + typecheck**

Run: `pnpm vitest run src/components/animations/__tests__/number-counter.test.tsx && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/animations/number-counter.tsx src/components/animations/__tests__/number-counter.test.tsx
git commit -m "feat(anim): NumberCounter (easeOutExpo, reduced-motion aware)"
```

---

### Task 8: checkmark-draw + staggered-list + generation-scan-reveal

**Files:**
- Create: `src/components/animations/checkmark-draw.tsx`
- Create: `src/components/animations/staggered-list.tsx`
- Create: `src/components/animations/generation-scan-reveal.tsx`

- [ ] **Step 1: checkmark-draw.tsx**

```tsx
"use client";
import { motion } from "framer-motion";

interface Props { size?: number; color?: string; }
export function CheckmarkDraw({ size = 48, color = "currentColor" }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <motion.path
        d="M10 24 L20 34 L38 14"
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
      />
    </svg>
  );
}
```

- [ ] **Step 2: staggered-list.tsx**

```tsx
"use client";
import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";

interface ListProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  stagger?: number;
}

export function StaggeredList({ children, stagger = 0.04, ...rest }: ListProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: stagger } } }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export const StaggerItem = motion.div;
export const STAGGER_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
} as const;
```

- [ ] **Step 3: generation-scan-reveal.tsx**

```tsx
"use client";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface Props { children: ReactNode; duration?: number; }
export function GenerationScanReveal({ children, duration = 0.5 }: Props) {
  return (
    <div className="relative overflow-hidden rounded-lg">
      {children}
      <motion.div
        initial={{ x: "-100%" }}
        animate={{ x: "100%" }}
        transition={{ duration, ease: "linear" }}
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent"
      />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/animations/
git commit -m "feat(anim): checkmark-draw, staggered-list, scan-reveal"
```

---

### Task 9: lottie-* wrappers + Lottie JSON assets

**Files:**
- Create: `src/components/animations/lottie-confetti.tsx`
- Create: `src/components/animations/lottie-success.tsx`
- Create: `src/components/animations/lottie-empty-state.tsx`
- Create: `src/components/animations/lottie-payment-landed.tsx`
- Create: `src/components/animations/lottie-bank-transfer.tsx`
- Create: `public/lottie/*.json` — 5 assets

- [ ] **Step 1: Add Lottie JSON files**

Source 5 public-domain / MIT Lottie JSONs from lottiefiles.com under the listed themes. Keep each under 40KB. Save to `public/lottie/confetti.json`, `success.json`, `empty-state.json`, `payment-landed.json`, `bank-transfer.json`.

If sourcing is blocked, fall back to a minimal hand-authored JSON (e.g., confetti = 12 circles with keyframed translate + opacity). Document the fallback in file header comments.

- [ ] **Step 2: Generic wrapper**

```tsx
// src/components/animations/lottie-base.tsx
"use client";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false, loading: () => <span /> });

interface Props {
  src: string;
  loop?: boolean;
  className?: string;
  fallback?: ReactNode;
}

export function LottieAsset({ src, loop = false, className, fallback }: Props) {
  // In the simplest path we load JSON at render; heavier route uses
  // useEffect+fetch. Keep simple for MVP.
  // Consumers: <LottieAsset src="/lottie/confetti.json" loop />
  return <LottieAssetImpl src={src} loop={loop} className={className} fallback={fallback} />;
}

function LottieAssetImpl({ src, loop, className, fallback }: Props) {
  // Use suspense-free fetch pattern
  const [data, setData] = useState<unknown | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(src).then((r) => r.json()).then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, [src]);

  if (!data) return <>{fallback ?? null}</>;
  return <Lottie animationData={data} loop={loop} className={className} />;
}

import { useEffect, useState } from "react";
```

- [ ] **Step 3: Individual wrappers** (each is 4 lines)

```tsx
// src/components/animations/lottie-confetti.tsx
"use client";
import { LottieAsset } from "./lottie-base";
export function LottieConfetti(props: { className?: string }) {
  return <LottieAsset src="/lottie/confetti.json" {...props} />;
}
```

Repeat pattern for `lottie-success.tsx` (`/lottie/success.json`), `lottie-empty-state.tsx` (`/lottie/empty-state.json`, loop), `lottie-payment-landed.tsx` (`/lottie/payment-landed.json`), `lottie-bank-transfer.tsx` (`/lottie/bank-transfer.json`).

- [ ] **Step 4: Commit**

```bash
git add src/components/animations/lottie-*.tsx public/lottie/
git commit -m "feat(anim): Lottie asset wrappers (confetti, success, bank-transfer, etc.)"
```

---

### Task 10: Shared UI primitives — sla-countdown, session-status-badge, empty-state, loading-skeleton

**Files:**
- Create: `src/components/shared/sla-countdown.tsx`
- Create: `src/components/shared/session-status-badge.tsx`
- Create: `src/components/shared/empty-state.tsx`
- Create: `src/components/shared/loading-skeleton.tsx`

- [ ] **Step 1: sla-countdown.tsx**

```tsx
"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

interface Props {
  expiresAt: string; // ISO
  lowThresholdHours?: number; // default 6
  className?: string;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

export function SlaCountdown({ expiresAt, lowThresholdHours = 6, className }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const diff = new Date(expiresAt).getTime() - now;
  const low = diff < lowThresholdHours * 3_600_000;
  const urgent = diff < 60 * 60_000; // < 1h
  return (
    <span
      role="timer"
      aria-live={urgent ? "assertive" : "polite"}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-600 tabular-nums",
        low ? "bg-red-500/15 text-red-600" : "bg-[var(--role-accent)]/40 text-[var(--color-ink)]",
        className,
      )}
    >
      Respond in {formatRemaining(diff)}
    </span>
  );
}
```

- [ ] **Step 2: session-status-badge.tsx**

```tsx
import { cn } from "@/lib/utils/cn";

type Status = "draft" | "requested" | "accepted" | "active" | "completed" | "expired" | "rejected" | "disputed";

const STYLE: Record<Status, { label: string; cls: string }> = {
  draft:      { label: "Draft",      cls: "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70" },
  requested:  { label: "Requested",  cls: "bg-[var(--color-ocean)]/40 text-[var(--color-ink)]" },
  accepted:   { label: "Accepted",   cls: "bg-[var(--color-gold,#c9a96e)]/30 text-[var(--color-ink)]" },
  active:     { label: "Active",     cls: "bg-[var(--color-mint)]/60 text-[var(--color-ink)]" },
  completed:  { label: "Complete",   cls: "bg-[var(--color-mint)]/60 text-[var(--color-ink)]" },
  expired:    { label: "Expired",    cls: "bg-[var(--color-ink)]/15 text-[var(--color-ink)]/70" },
  rejected:   { label: "Rejected",   cls: "bg-red-500/15 text-red-700" },
  disputed:   { label: "Disputed",   cls: "bg-amber-500/15 text-amber-700" },
};

export function SessionStatusBadge({ status }: { status: Status }) {
  const s = STYLE[status];
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-600", s.cls)}>{s.label}</span>;
}
```

- [ ] **Step 3: empty-state.tsx**

```tsx
import type { ReactNode } from "react";
import { LottieEmptyState } from "@/components/animations/lottie-empty-state";

interface Props {
  title: string;
  description: string;
  action?: ReactNode;
}
export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-[var(--color-ink)]/12 bg-[var(--color-paper)] p-10 text-center">
      <LottieEmptyState className="h-24 w-24" />
      <div>
        <p className="font-outfit text-lg font-700">{title}</p>
        <p className="mt-1 text-sm text-[var(--color-ink)]/60">{description}</p>
      </div>
      {action}
    </div>
  );
}
```

- [ ] **Step 4: loading-skeleton.tsx**

```tsx
import { cn } from "@/lib/utils/cn";
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-[var(--color-ink)]/8", className)} />;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/sla-countdown.tsx src/components/shared/session-status-badge.tsx src/components/shared/empty-state.tsx src/components/shared/loading-skeleton.tsx
git commit -m "feat(ui): SlaCountdown, SessionStatusBadge, EmptyState, Skeleton"
```

---

## Phase 4 — Brand dashboard + credits flow

### Task 11: /api/brand/dashboard aggregate route

**Files:**
- Create: `src/app/api/brand/dashboard/route.ts`
- Test: `src/app/api/brand/dashboard/__tests__/route.test.ts`

- [ ] **Step 1: Write route**

Returns:
```json
{
  "creditsBalancePaise": 250000,
  "activeLicenses": [{id, creatorName, templateBadge, imagesUsed, imagesTotal, expiresAt}],
  "activeLicensesCount": 3,
  "imagesThisMonth": 42,
  "recentActivity": [{id, type, title, createdAt, href}]
}
```

Implementation: pulls from `credit_transactions` (latest balance), `license_requests` where status='active' and brand_id=user, count of `generations` in last 30 days, last 20 `notifications` rows.

Standard pattern from existing routes: admin client, session auth, Zod output schema, error envelope.

- [ ] **Step 2: Test — mocks supabase, asserts response shape**

Test one happy-path case + 401 when unauthenticated.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/brand/dashboard/
git commit -m "feat(api): /api/brand/dashboard aggregate for home page"
```

---

### Task 12: use-credits-balance + credits-balance-widget

**Files:**
- Create: `src/lib/hooks/use-credits-balance.ts`
- Create: `src/components/brand/credits-balance-widget.tsx`

- [ ] **Step 1: Hook**

```typescript
// src/lib/hooks/use-credits-balance.ts
"use client";
import { useQuery } from "@tanstack/react-query";

export interface CreditsBalance {
  balancePaise: number;
  lastTransactions: Array<{
    id: string;
    type: string;
    amountPaise: number;
    description: string;
    createdAt: string;
  }>;
}

export function useCreditsBalance() {
  return useQuery<CreditsBalance>({
    queryKey: ["credits-balance"],
    queryFn: async () => {
      const res = await fetch("/api/credits/balance", { cache: "no-store" });
      if (!res.ok) throw new Error(`credits-balance ${res.status}`);
      return (await res.json()) as CreditsBalance;
    },
    refetchInterval: 15_000,
  });
}
```

- [ ] **Step 2: Widget**

```tsx
"use client";
import Link from "next/link";
import { BalanceChip } from "@/components/layouts/brand-kit/balance-chip";
import { Skeleton } from "@/components/shared/loading-skeleton";
import { useCreditsBalance } from "@/lib/hooks/use-credits-balance";

export function CreditsBalanceWidget() {
  const { data, isLoading } = useCreditsBalance();
  if (isLoading || !data) return <Skeleton className="h-24 w-64" />;
  return (
    <div className="rounded-2xl border border-[var(--color-ink)]/8 bg-[var(--color-paper)] p-5 shadow-[var(--shadow-soft)]">
      <p className="text-xs font-600 uppercase tracking-widest text-[var(--color-ink)]/50">Credits</p>
      <div className="mt-1"><BalanceChip paise={data.balancePaise} label="Balance" /></div>
      <Link href="/brand/credits/top-up" className="mt-3 inline-block text-sm font-600 text-[var(--color-gold,#c9a96e)] hover:underline">Top up →</Link>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/use-credits-balance.ts src/components/brand/credits-balance-widget.tsx
git commit -m "feat(brand): useCreditsBalance hook + balance widget"
```

---

### Task 13: /brand/dashboard page (real content)

**Files:**
- Modify (replace stub): `src/app/brand/dashboard/page.tsx`

- [ ] **Step 1: Compose page**

Hero strip (3 widgets, grid-cols-3 on lg, stacked on mobile):
1. `CreditsBalanceWidget` (Task 12)
2. Active licenses count + "View all" link — simple `<Link>` card
3. Images this month counter — uses `NumberCounter`

Active licenses strip: horizontal scroll on desktop, stack on mobile. Each card uses `SessionStatusBadge` + `license-progress-bar.tsx` (Task 23 — stub-render for now and wire later, OR inline a simple progress bar using `<progress>` + Tailwind for MVP).

Quick actions: 3-tile grid ("Find creators", "Top up credits", "View sessions") → Links.

Recent activity: render `data.recentActivity` as list items using `StaggeredList`. If empty, `<EmptyState>`.

Implementation outline:

```tsx
"use client";
import Link from "next/link";
import { PageTitle } from "@/components/layouts/brand-kit/page-title";
import { CreditsBalanceWidget } from "@/components/brand/credits-balance-widget";
import { NumberCounter } from "@/components/animations/number-counter";
import { StaggeredList, StaggerItem, STAGGER_ITEM_VARIANTS } from "@/components/animations/staggered-list";
import { EmptyState } from "@/components/shared/empty-state";
import { useQuery } from "@tanstack/react-query";
// …fetch dashboard aggregate…
```

Ensure:
- Mobile: single column, widgets stack, no horizontal scroll
- Framer Motion page-level wrapper already provided by BrandShell
- Loading: render Skeleton for each widget

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/brand/dashboard/page.tsx
git commit -m "feat(brand): dashboard page with widgets, activity feed, quick actions"
```

---

### Task 14: /brand/credits + /brand/credits/top-up pages

**Files:**
- Modify (replace stubs): `src/app/brand/credits/page.tsx`, `src/app/brand/credits/top-up/page.tsx`
- Create: `src/components/brand/credit-pack-selector.tsx`

- [ ] **Step 1: credit-pack-selector.tsx**

Uses the `CREDIT_PACKS` catalog from `src/domains/credit/types.ts` (Chunk C). Shows 4 cards (free_signup hidden, only paid packs selectable):

```tsx
"use client";
import { CREDIT_PACKS } from "@/domains/credit/types";
import { cn } from "@/lib/utils/cn";
import { useState } from "react";

interface Props {
  onSelect: (packId: string) => void;
}

export function CreditPackSelector({ onSelect }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const packs = CREDIT_PACKS.filter((p) => p.id !== "free_signup");
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {packs.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => { setSelected(p.id); onSelect(p.id); }}
          className={cn(
            "flex flex-col items-start rounded-2xl border p-5 text-left transition-all",
            selected === p.id
              ? "border-[var(--role-accent-strong)] bg-[var(--role-accent)]/30 shadow-[var(--shadow-card)]"
              : "border-[var(--color-ink)]/8 bg-[var(--color-paper)] hover:border-[var(--role-accent-strong)]/60",
          )}
        >
          <p className="text-sm font-600 text-[var(--color-ink)]/60">{p.name}</p>
          <p className="mt-1 font-outfit text-2xl font-700">{p.credits} credits</p>
          <p className="mt-1 text-lg font-600">₹{(p.pricePaise / 100).toLocaleString("en-IN")}</p>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: /brand/credits page**

Shows: `<CreditsBalanceWidget />` (full-width), transaction history table (paged 20 at a time from `/api/credits/balance` which returns last 20 or add pagination param).

- [ ] **Step 3: /brand/credits/top-up page**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageTitle } from "@/components/layouts/brand-kit/page-title";
import { CreditPackSelector } from "@/components/brand/credit-pack-selector";
import { Button } from "@/components/ui/button";
// Flow: select pack → POST /api/credits/top-up → redirect to Cashfree hosted page (data.paymentSessionUrl)
```

Full form + redirect flow: POST `/api/credits/top-up` with `{packId}`, receive `{order_id, payment_session_url}`, redirect the user to Cashfree. On return webhook credits the account via existing Chunk C handler.

- [ ] **Step 4: Run build**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/brand/credits/ src/components/brand/credit-pack-selector.tsx
git commit -m "feat(brand): credits + top-up pages with Cashfree redirect"
```

---

## Phase 5 — Stage 1 BOOK: Creator discovery + request

### Task 15: /api/creators/list route (discovery with filters)

**Files:**
- Create: `src/app/api/creators/list/route.ts`

- [ ] **Step 1: Write the route**

Query params (Zod validated):
```
search?: string                     # fuzzy on display_name + bio
category?: string
minPricePaise?: number
maxPricePaise?: number
sort?: "popular" | "price_asc" | "price_desc" | "newest"
page?: number                       # default 1
perPage?: number                    # default 24, max 50
```

Returns:
```
{
  creators: Array<{
    id, displayName, avatarUrl, categoryLabels[],
    instagramHandle, followersCount,
    minimumLicensePricePaise,
    hasCreationListing, hasCreationPromotionListing,
    coverImageUrl
  }>,
  total: number,
  page: number,
  perPage: number
}
```

Implementation: LEFT JOIN creators + creator_license_listings + creator_categories (or `creators.categories` JSONB if that's the existing shape — check current `creators` schema).

- [ ] **Step 2: Minimal test**

Mock admin client. Happy path + invalid query params → 400.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/creators/list/
git commit -m "feat(api): /api/creators/list with filter+sort+search+pagination"
```

---

### Task 16: creator-card.tsx + use-creator-list hook

**Files:**
- Create: `src/components/brand/creator-card.tsx`
- Create: `src/lib/hooks/use-creator-list.ts`

- [ ] **Step 1: Hook**

```typescript
"use client";
import { useQuery } from "@tanstack/react-query";

export interface CreatorListFilters {
  search?: string;
  category?: string;
  minPricePaise?: number;
  maxPricePaise?: number;
  sort?: "popular" | "price_asc" | "price_desc" | "newest";
  page?: number;
}

export function useCreatorList(filters: CreatorListFilters) {
  return useQuery({
    queryKey: ["creators", "list", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v != null) params.set(k, String(v));
      }
      const res = await fetch(`/api/creators/list?${params.toString()}`);
      if (!res.ok) throw new Error("creators list failed");
      return res.json();
    },
  });
}
```

- [ ] **Step 2: CreatorCard component**

Per spec §3.1.2 — cover 16:9, avatar overlay, name, category pills, starting-price chip, "View profile" CTA. Hover lifts 4px + cover scales 1.04. Uses `next/image` with `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`.

```tsx
"use client";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

interface Props {
  id: string;
  displayName: string;
  avatarUrl: string;
  coverImageUrl: string;
  categoryLabels: string[];
  minimumLicensePricePaise: number;
}

export function CreatorCard(props: Props) {
  return (
    <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
      <Link
        href={`/brand/creators/${props.id}`}
        className="group block overflow-hidden rounded-2xl border border-[var(--color-ink)]/8 bg-[var(--color-paper)] shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-card)]"
      >
        <div className="relative aspect-[16/9] overflow-hidden">
          <Image
            src={props.coverImageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
          <div className="absolute -bottom-6 left-4 size-14 overflow-hidden rounded-full border-4 border-[var(--color-paper)]">
            <Image src={props.avatarUrl} alt={props.displayName} fill className="object-cover" sizes="56px" />
          </div>
        </div>
        <div className="px-4 pb-4 pt-8">
          <p className="font-outfit text-lg font-700">{props.displayName}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {props.categoryLabels.map((c) => (
              <span key={c} className="rounded-full bg-[var(--role-accent)]/40 px-2 py-0.5 text-[11px] font-600">{c}</span>
            ))}
          </div>
          <p className="mt-3 text-sm text-[var(--color-ink)]/60">
            From <span className="font-600 text-[var(--color-ink)]">₹{(props.minimumLicensePricePaise / 100).toLocaleString("en-IN")}</span>
          </p>
        </div>
      </Link>
    </motion.div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/brand/creator-card.tsx src/lib/hooks/use-creator-list.ts
git commit -m "feat(brand): CreatorCard + useCreatorList"
```

---

### Task 17: /brand/creators page (discovery)

**Files:**
- Modify (replace stub): `src/app/brand/creators/page.tsx`

- [ ] **Step 1: Compose page**

Per spec §3.1.2:
- Top: search bar + filter sheet trigger + sort select
- Filter sheet (use `Sheet` from Chunk B): category multiselect, price range slider, license type toggles, IG followers range, IG-verified toggle
- Sort select: Popular / Price ↑ / Price ↓ / Newest (use `DropdownMenu` from Chunk B)
- Results: masonry grid (CSS columns), 1-col mobile, 2-col sm, 3-col lg
- Infinite scroll via IntersectionObserver OR "Load more" button

Loading: `StaggeredList` of 6 skeletons.
Empty: `<EmptyState title="No creators match" description="Try different filters." />`.

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/brand/creators/page.tsx
git commit -m "feat(brand): /brand/creators discovery with filter sheet + sort"
```

---

### Task 18: /brand/creators/[id] profile page

**Files:**
- Create: `src/app/api/creators/[id]/route.ts`
- Create: `src/components/brand/creator-profile-header.tsx`
- Create: `src/components/brand/license-card-listing.tsx`
- Create: `src/lib/hooks/use-creator-profile.ts`
- Modify: `src/app/brand/creators/[id]/page.tsx`

- [ ] **Step 1: API route**

Returns creator public profile: id, displayName, avatarUrl, coverImageUrl, bio, instagramHandle, followersCount, categories, licenseListings[], ratingsSummary (avg + count), gallery (reference photos filtered for public=true if such a flag exists; else empty).

- [ ] **Step 2: Components**

`creator-profile-header.tsx`: hero cover + avatar float + name + category + follower count. Mobile: cover 56vh not full 16:9.

`license-card-listing.tsx`: per-listing card — template badge, price, quota, validity, digital-use scope chip, "Request this license" CTA that routes to `/brand/licenses/new?creator=[id]&listing=[listingId]`.

- [ ] **Step 3: Page composition**

Tabs: About / Licenses (default) / Gallery / Reviews. Use `Tabs` from `@/components/ui/tabs` (already exists).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/creators/[id]/ src/components/brand/creator-profile-header.tsx src/components/brand/license-card-listing.tsx src/lib/hooks/use-creator-profile.ts src/app/brand/creators/[id]/page.tsx
git commit -m "feat(brand): creator profile page with tabs (About/Licenses/Gallery/Reviews)"
```

---

### Task 19: License request form + checkout summary

**Files:**
- Create: `src/components/brand/checkout-summary.tsx`
- Create: `src/components/brand/license-request-form.tsx`
- Modify: `src/app/brand/licenses/new/page.tsx`

- [ ] **Step 1: checkout-summary.tsx**

Live calculator displaying:
- Base price
- Platform fee 18% (tooltip on hover)
- GST on platform fee
- Total (big number via `NumberCounter`)
- Credits available + delta (insufficient → "Top up X credits" inline link)

Pulls math from `src/lib/ledger/math.ts` — `calculateLicenseCheckout(basePaise, imageQuota)`.

Mobile: stickied bottom sheet with Total + CTA. Desktop: sticky right column.

- [ ] **Step 2: license-request-form.tsx**

Fields:
- Brand brief (textarea, 500 char max, live count)
- Reference images (drag-drop, max 3, upload to R2 via `/api/images/upload` new route — or deferred to Phase 7)
- On submit → POST `/api/licenses/request` (Chunk C route) with `{creator_id, template_id, brand_brief}`

Success: animated overlay with `CheckmarkDraw` + "Request sent" copy + CTA "View request" → `/brand/licenses/[id]`.

- [ ] **Step 3: Page composition**

Query params: `?creator=[id]&listing=[listingId]`. Fetch listing details via `/api/licenses/listings?creator=[id]` or the per-creator route.

- [ ] **Step 4: Commit**

```bash
git add src/components/brand/checkout-summary.tsx src/components/brand/license-request-form.tsx src/app/brand/licenses/new/page.tsx
git commit -m "feat(brand): license request form + live checkout summary"
```

---

### Task 20: /brand/licenses list + /[id] skeleton (populated in Phase 7)

**Files:**
- Modify: `src/app/brand/licenses/page.tsx`
- Modify: `src/app/brand/licenses/[id]/page.tsx` (interim — full content in Phase 7 Task 26)

- [ ] **Step 1: List page**

Tabs: Active (default) / Pending / Past. Each row: creator avatar + name, template badge, SessionStatusBadge, progress bar (X of Y images), click → `/brand/licenses/[id]`.

Hook: `useLicenses()` calls `/api/licenses/listings` or a new `/api/brand/licenses?status=X` endpoint.

- [ ] **Step 2: Detail page interim**

Render license meta card + status badge. Full active view with chat + gallery lives in Phase 7 Task 26. For now show:
- License meta card
- Button "Open active session" → placeholder, or if status=active, deep-link to `/brand/sessions/[id]`

- [ ] **Step 3: Commit**

```bash
git add src/app/brand/licenses/
git commit -m "feat(brand): licenses list + detail interim (full session view in Phase 7)"
```

---

## Phase 6 — Stage 2 ACCEPT: Creator inbox + contract

### Task 21: Creator request inbox

**Files:**
- Create: `src/components/creator/request-card-inbox.tsx`
- Create: `src/components/creator/request-detail-view.tsx`
- Create: `src/lib/hooks/use-requests.ts`
- Modify: `src/app/creator/requests/page.tsx`
- Modify: `src/app/creator/requests/[id]/page.tsx`

- [ ] **Step 1: Hook**

```typescript
export function useRequests(tab: "new" | "accepted" | "rejected" | "expired") {
  return useQuery({
    queryKey: ["requests", tab],
    queryFn: async () => {
      const r = await fetch(`/api/licenses/request?as=creator&status=${tab}`);
      if (!r.ok) throw new Error();
      return r.json();
    },
  });
}
```

Note: Chunk C's `/api/licenses/request` POSTs. Add a GET handler on the same path or new `/api/licenses/inbox` route that filters by sender (brand) and creator role — check existing route shape.

- [ ] **Step 2: Request card**

Per spec §3.2.2: brand logo, template badge, amount (creator share via `calculateLicenseCheckout` → creator_share_paise), brief preview 2 lines, received time, SLA countdown (< 3h red tint). Hover: lift + ocean glow. Click → navigates to detail.

- [ ] **Step 3: Request detail**

Top: brand card. Middle: brief section with reference images. License snapshot. Creator earnings breakdown (live): base → TCS 1% → TDS 1% → GST 18% → net.

Actions: Accept (gold) / Reject (ghost). Mobile: fixed bottom bar.

Accept click → opens ContractViewer side panel (Task 22).

Reject click → opens bottom sheet with reason dropdown + textarea → POST `/api/licenses/[id]/reject` (Chunk C).

- [ ] **Step 4: Commit**

```bash
git add src/components/creator/request-card-inbox.tsx src/components/creator/request-detail-view.tsx src/lib/hooks/use-requests.ts src/app/creator/requests/
git commit -m "feat(creator): request inbox with cards + detail view + SLA countdown"
```

---

### Task 22: Contract viewer with scroll-to-bottom gate

**Files:**
- Create: `src/components/creator/contract-viewer.tsx`
- Verify route exists: `src/app/api/licenses/[id]/contract/route.ts` (Chunk C — returns signed URL)

- [ ] **Step 1: Decide rendering approach**

Two paths:
1. **react-pdf** on the client — renders PDF inline. Heavy dep (adds ~300KB).
2. **Embed iframe** with signed URL — browser PDF viewer. Lightweight, less control.

Pick **#2 (iframe)** for MVP. A11y: provide a text-only summary of the 12 core clauses outside the iframe for screen readers.

- [ ] **Step 2: Component**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  contractUrl: string;
  licenseId: string;
  onAccept: () => Promise<void>;
  onClose: () => void;
}

export function ContractViewer({ contractUrl, licenseId, onAccept, onClose }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [scrollPct, setScrollPct] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const canAccept = scrollPct >= 95 && agreed;

  // iframe scroll event listener via postMessage isn't reliable cross-origin.
  // Fallback: assume user read the contract once the iframe has been on screen
  // for N seconds (30s minimum). Also let the user drag a slider to confirm
  // read-depth — pragmatic and auditable.
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSecondsElapsed((s) => Math.min(60, s + 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const timePct = (secondsElapsed / 30) * 100;
  const readPct = Math.min(100, Math.max(scrollPct, timePct));

  async function handleAccept() {
    setSubmitting(true);
    try { await onAccept(); } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-[var(--color-ink)]/50">
      <div className="ml-auto flex h-full w-full max-w-3xl flex-col bg-[var(--color-paper)]">
        <header className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-outfit text-lg font-700">License contract</h2>
          <button onClick={onClose} className="text-sm font-600 text-[var(--color-ink)]/60 hover:text-[var(--color-ink)]">Close</button>
        </header>
        <iframe
          ref={iframeRef}
          src={contractUrl}
          title="Contract"
          className="flex-1 border-0"
          onLoad={() => setScrollPct(10)}
        />
        <footer className="border-t px-5 py-3">
          <div className="mb-2 flex items-center gap-2 text-xs text-[var(--color-ink)]/60">
            <span>Read progress:</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-ink)]/8">
              <div className="h-full bg-[var(--color-gold,#c9a96e)]" style={{ width: `${readPct}%` }} />
            </div>
            <span>{Math.round(readPct)}%</span>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={readPct < 95} />
            I have read and agree to this contract.
          </label>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!canAccept || submitting} onClick={handleAccept}>
              {submitting ? "Signing…" : "Accept & sign"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
```

Accept flow: calls `/api/licenses/[id]/accept` (Chunk C) which generates the contract, uploads to R2, calls `commit_license_acceptance` RPC, and emits `license/accepted`. UI on success: CheckmarkDraw + auto-navigate to `/creator/sessions/[id]`.

- [ ] **Step 3: Commit**

```bash
git add src/components/creator/contract-viewer.tsx
git commit -m "feat(creator): contract viewer with read-progress gate + accept"
```

---

## Phase 7 — Stage 3 GENERATE: Session detail view

### Task 23: License progress bar + generation pipeline component

**Files:**
- Create: `src/components/shared/license-progress-bar.tsx`
- Create: `src/components/shared/generation-progress-pipeline.tsx`

- [ ] **Step 1: license-progress-bar.tsx**

Quota visualizer per spec §3.3.2: e.g. "[██████████░░░░░░] 12 of 25" with mint (available), gold (used), light-red (rejected). Width animated via Framer on change.

```tsx
"use client";
import { motion } from "framer-motion";

interface Props {
  total: number;
  approved: number;
  rejected: number;
  inProgress: number;
}
export function LicenseProgressBar({ total, approved, rejected, inProgress }: Props) {
  const approvedPct = (approved / total) * 100;
  const rejectedPct = (rejected / total) * 100;
  const inProgressPct = (inProgress / total) * 100;
  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-600 text-[var(--color-ink)]/70">{approved} of {total} images</span>
        <span className="text-[var(--color-ink)]/50">{rejected} rejected</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--color-ink)]/8">
        <motion.div animate={{ width: `${approvedPct}%` }} transition={{ duration: 0.4, type: "spring" }} className="absolute inset-y-0 left-0 bg-[var(--color-gold,#c9a96e)]" />
        <motion.div animate={{ width: `${inProgressPct}%` }} className="absolute inset-y-0 bg-[var(--color-lilac)]" style={{ left: `${approvedPct}%` }} />
        <motion.div animate={{ width: `${rejectedPct}%` }} className="absolute inset-y-0 bg-red-300" style={{ left: `${approvedPct + inProgressPct}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: generation-progress-pipeline.tsx**

5-dot pipeline per spec §3.3.3. Uses `useGenerationPipeline` hook. Each dot: pending (grey) → running (gold pulsing ring) → done (solid gold).

```tsx
"use client";
import { motion } from "framer-motion";
import { useGenerationPipeline } from "@/lib/hooks/use-generation-pipeline";
import { cn } from "@/lib/utils/cn";

const STEPS = ["compliance", "prompt_assembly", "image", "safety", "done"] as const;
const LABELS: Record<(typeof STEPS)[number], string> = {
  compliance: "Compliance",
  prompt_assembly: "Prompt",
  image: "Image",
  safety: "Safety",
  done: "Done",
};

export function GenerationProgressPipeline({ generationId }: { generationId: string }) {
  const snap = useGenerationPipeline(generationId);
  const stages = snap?.stages ?? STEPS.map((s) => ({ step: s, status: "pending" as const }));
  return (
    <div className="flex items-center gap-2">
      {stages.map((stage, i) => {
        const isRunning = stage.status === "running";
        const isDone = stage.status === "done";
        return (
          <div key={stage.step} className="flex items-center gap-2">
            <div className="relative">
              <motion.div
                className={cn(
                  "size-3 rounded-full",
                  isDone ? "bg-[var(--color-gold,#c9a96e)]" : isRunning ? "bg-[var(--color-gold,#c9a96e)]" : "bg-[var(--color-ink)]/15",
                )}
              />
              {isRunning && (
                <motion.span animate={{ scale: [1, 1.8], opacity: [0.5, 0] }} transition={{ duration: 1.2, repeat: Infinity }} className="absolute inset-0 rounded-full bg-[var(--color-gold,#c9a96e)]" />
              )}
            </div>
            <span className="text-xs font-600 text-[var(--color-ink)]/60">{LABELS[stage.step]}</span>
            {i < stages.length - 1 && <div className="h-px w-4 bg-[var(--color-ink)]/15" />}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/license-progress-bar.tsx src/components/shared/generation-progress-pipeline.tsx
git commit -m "feat(generate): license progress bar + 5-dot pipeline visualizer"
```

---

### Task 24: Chat thread + composer

**Files:**
- Create: `src/components/shared/chat-thread.tsx`
- Create: `src/components/shared/chat-message.tsx`
- Create: `src/components/shared/chat-composer.tsx`
- Create: `src/lib/hooks/use-license-messages.ts`
- Create: `src/app/api/licenses/[id]/messages/route.ts`

- [ ] **Step 1: API route — GET list + POST new**

GET: pulls last 50 messages for `license_request_id` (newer-first client-side reverses). POST: inserts row, emits Supabase Realtime via table trigger.

```typescript
// src/app/api/licenses/[id]/messages/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const PostSchema = z.object({ body: z.string().min(1).max(2000).optional(), attachmentUrl: z.string().url().optional() })
  .refine((d) => d.body || d.attachmentUrl, { message: "body or attachment required" });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Participants check via RLS — SELECT without admin
  const { data, error } = await supabase
    .from("license_messages")
    .select("id, sender_id, body, attachment_url, is_system, created_at")
    .eq("license_request_id", id)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const admin = createAdminClient();
  // Verify sender is participant
  const { data: lr } = await admin
    .from("license_requests")
    .select("brand_id, creator_id")
    .eq("id", id)
    .maybeSingle();
  if (!lr || (lr.brand_id !== user.id && lr.creator_id !== user.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { data, error } = await admin
    .from("license_messages")
    .insert({ license_request_id: id, sender_id: user.id, body: parsed.data.body, attachment_url: parsed.data.attachmentUrl })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: data }, { status: 201 });
}
```

- [ ] **Step 2: use-license-messages.ts**

```typescript
"use client";
import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { subscribeRows } from "@/lib/realtime/supabase-channel";

export interface LicenseMessage {
  id: string;
  sender_id: string;
  body: string | null;
  attachment_url: string | null;
  is_system: boolean;
  created_at: string;
}

export function useLicenseMessages(licenseId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["license-messages", licenseId],
    queryFn: async () => {
      const r = await fetch(`/api/licenses/${licenseId}/messages`);
      if (!r.ok) throw new Error();
      return (await r.json()).messages as LicenseMessage[];
    },
  });

  // Realtime append on INSERT
  useEffect(() => {
    const unsub = subscribeRows<LicenseMessage>({
      table: "license_messages",
      filterColumn: "license_request_id",
      filterValue: licenseId,
      onInsert: (row) => {
        qc.setQueryData<LicenseMessage[]>(["license-messages", licenseId], (prev = []) =>
          prev.some((m) => m.id === row.id) ? prev : [...prev, row],
        );
      },
    });
    return unsub;
  }, [licenseId, qc]);

  const send = useMutation({
    mutationFn: async (body: string) => {
      const r = await fetch(`/api/licenses/${licenseId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!r.ok) throw new Error();
      return r.json();
    },
  });

  return { ...query, send };
}
```

- [ ] **Step 3: chat-message.tsx**

Bubble — sender on right (ocean for brand), creator on left (blush). System messages centered, gold pill.

- [ ] **Step 4: chat-composer.tsx**

Text input + attach image button (stubbed — upload to R2 is Phase 8) + send. Send on Enter (Shift+Enter newline).

- [ ] **Step 5: chat-thread.tsx**

Virtualized scroll (react-virtuoso) if > 30 messages. Auto-scroll to bottom on new message. Typing indicator deferred (needs presence channel — V2).

- [ ] **Step 6: Commit**

```bash
git add src/components/shared/chat-* src/lib/hooks/use-license-messages.ts src/app/api/licenses/[id]/messages/
git commit -m "feat(chat): license-scoped chat (Realtime + message bubbles + composer)"
```

---

### Task 25: Image gallery + image card + lightbox

**Files:**
- Create: `src/components/shared/image-card.tsx`
- Create: `src/components/shared/image-gallery.tsx`
- Create: `src/components/shared/image-lightbox.tsx`
- Create: `src/lib/hooks/use-generations.ts`
- Create: `src/app/api/images/[id]/download/route.ts`

- [ ] **Step 1: image-card.tsx**

Status-aware border + badge per spec §3.3.3:
- generating: lilac pulse border + progress pipeline
- awaiting_approval: mint border + "Sent for approval"
- approved: gold border + ✓
- rejected: red border + "Retry available" or "Slot consumed"
- delivered: clean, full resolution, Download button

Uses `GenerationScanReveal` for first-render reveal on status transition to `awaiting_approval`.

- [ ] **Step 2: image-gallery.tsx**

Grid: 1-col mobile, 2-col md, 3-col lg. Filter pills (All / Generating / Awaiting / Approved / Rejected). Uses `StaggeredList` on mount.

- [ ] **Step 3: image-lightbox.tsx**

Full-screen modal via `Dialog`. Shows high-res image, swipe left/right on mobile (Framer drag), keyboard arrows on desktop. Close on ESC.

- [ ] **Step 4: use-generations.ts**

React Query hook — fetches `/api/generations?license_id=X` (add this route filter to existing `/api/generations/[id]` tree).

- [ ] **Step 5: Download route**

`src/app/api/images/[id]/download/route.ts`: returns signed R2 URL (1-year TTL). Verifies requester is participant in the license.

- [ ] **Step 6: Commit**

```bash
git add src/components/shared/image-* src/lib/hooks/use-generations.ts src/app/api/images/[id]/download/
git commit -m "feat(gallery): image card + gallery + lightbox + download route"
```

---

### Task 26: /brand/licenses/[id] full session view

**Files:**
- Modify (replace interim): `src/app/brand/licenses/[id]/page.tsx`
- Create: `src/app/api/images/generate/route.ts`
- Modify: `src/app/brand/sessions/[id]/page.tsx` (mirror content)

- [ ] **Step 1: /api/images/generate route**

POST body: `{license_request_id, structured_brief: {...}}`.
Validates:
- Requester is brand on the license
- License status === "active"
- Remaining slots > 0 (count generations where license_request_id=X and status NOT IN ['failed', 'rejected-terminal']; must be < image_quota)

Creates `generations` row (status='pending'), emits Inngest `generation/created`, returns `{generation_id}`.

- [ ] **Step 2: Page composition**

Desktop layout per spec §3.3.2:
- Left col (40%): license meta card + chat thread
- Right col (60%): gallery + generation controls

Mobile: Tabs on top (Chat / Gallery), full-width below.

Generation input: structured brief textarea + optional reference image upload + "Generate" button showing remaining slots. On click → POST to /api/images/generate → new card appears at top of gallery via optimistic update.

- [ ] **Step 3: Build**

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/brand/licenses/[id]/page.tsx src/app/brand/sessions/[id]/page.tsx src/app/api/images/generate/
git commit -m "feat(session): full session detail (chat + gallery + generate)"
```

---

## Phase 8 — Stage 4 APPROVE: Creator approval flow

### Task 27: Approval queue + review panel + approve/reject routes

**Files:**
- Create: `src/components/creator/approval-queue-card.tsx`
- Create: `src/components/creator/approval-review-panel.tsx`
- Create: `src/lib/hooks/use-approvals.ts`
- Create: `src/app/api/images/[id]/approve/route.ts`
- Create: `src/app/api/images/[id]/reject/route.ts`
- Modify: `src/app/creator/approvals/page.tsx`
- Modify: `src/app/creator/approvals/[id]/page.tsx`

- [ ] **Step 1: Approve route**

POST body: `{}` (no fields; approval metadata derived from user session). Validates:
- User is the creator on the license
- Generation status === 'awaiting_approval'

Flips generations.status='delivered', calls `commit_image_approval` RPC (Chunk C), emits `image/approved` Inngest event.

- [ ] **Step 2: Reject route**

POST body: `{reason: "quality"|"off_brief"|"likeness_mismatch"|"other", detail?: string}`.
Validates state + checks retry count:
- If `retry_count < 3`: set status='rejected', increment retry_count, free slot for retry (no refund — brand retries).
- If `retry_count >= 3`: set status='rejected_terminal', consume slot, no refund.

Emits `image/rejected`.

- [ ] **Step 3: Queue card**

Per spec §3.4.2: image thumb (blurred subtly), brand name, template badge, SLA countdown, inline approve/reject buttons. Hover lifts.

- [ ] **Step 4: Review panel (single image)**

Per spec §3.4.2: full-width image with watermark overlay, context sidebar (brand, brief, license snapshot, attempt #, earnings breakdown), fixed bottom action bar with Approve (mint primary) / Reject (ghost).

Reject click → modal with reason dropdown + optional textarea.

Approve click → button → spinner → mint flash → `LottiePaymentLanded` overlay (800ms) → auto-navigate back to queue.

- [ ] **Step 5: Queue page**

Header "Pending approvals" + count. Sort: Oldest first (default) / Newest first. Renders queue cards. Empty state when none.

- [ ] **Step 6: Commit**

```bash
git add src/components/creator/approval-* src/lib/hooks/use-approvals.ts src/app/api/images/[id]/ src/app/creator/approvals/
git commit -m "feat(approve): creator queue + review panel + approve/reject routes"
```

---

## Phase 9 — Stage 5 CLOSE: Earnings + withdrawal + rating

### Task 28: Earnings hero + chart + page

**Files:**
- Create: `src/components/creator/earnings-hero.tsx`
- Create: `src/components/creator/earnings-chart.tsx`
- Create: `src/lib/hooks/use-earnings.ts`
- Create: `src/app/api/creator/earnings/route.ts`
- Modify: `src/app/creator/earnings/page.tsx`

- [ ] **Step 1: API route**

Returns:
```json
{
  "pendingBalancePaise": 480000,
  "lifetimeEarnedPaise": 1200000,
  "monthlyBreakdown": [{ "month": "2025-11", "earnedPaise": 120000 }],
  "bySession": [...],
  "recentWithdrawals": [...]
}
```

- [ ] **Step 2: earnings-hero.tsx**

Big `NumberCounter` with pending balance. "Withdraw" CTA button (disabled with tooltip if balance < ₹500 OR kyc_status !== 'verified'). Secondary: lifetime earned.

- [ ] **Step 3: earnings-chart.tsx**

Simple bar chart via `recharts`. Last 12 months.

- [ ] **Step 4: Page**

Tabs: Overview (default) / Withdrawals / Tax docs. Overview: hero + chart + session list. Withdrawals: list with SessionStatusBadge-like status chips. Tax docs: placeholder card "Form 16A generation is V2" — or link to a stub PDF endpoint.

- [ ] **Step 5: Commit**

```bash
git add src/components/creator/earnings-* src/lib/hooks/use-earnings.ts src/app/api/creator/earnings/ src/app/creator/earnings/page.tsx
git commit -m "feat(earnings): creator earnings page with hero + chart + tabs"
```

---

### Task 29: Withdrawal form + breakdown

**Files:**
- Create: `src/components/creator/withdrawal-form.tsx`
- Create: `src/components/creator/withdrawal-breakdown.tsx`
- Modify: `src/app/creator/earnings/withdraw/page.tsx`

- [ ] **Step 1: withdrawal-breakdown.tsx**

Live deduction preview using `calculateWithdrawalDeductions` from `@/lib/ledger/math` (Chunk C). Fields:
- Withdrawing (user-editable, capped at balance)
- TCS 1%
- TDS 1%
- GST 18%
- Net to bank (bold, large)
- Claimable in ITR (informational)

Each line appears via stagger-fade (60ms apart).

- [ ] **Step 2: withdrawal-form.tsx**

Bank account display (last 4, IFSC, holder name — from `/api/kyc/bank`). Confirm button "Withdraw ₹X to HDFC ••••1234". On click → POST `/api/withdrawals/create` (Chunk C).

Submit flow:
- Spinner
- Success: fullscreen `LottieBankTransfer` (1200ms) + toast "₹X sent to your bank" → navigate to `/creator/earnings`

If KYC incomplete, redirect to `/creator/kyc` with banner.

- [ ] **Step 3: Page**

Two-step UX: confirm amount → confirm bank → submit. Mobile: fullscreen with sticky bottom confirm button.

- [ ] **Step 4: Commit**

```bash
git add src/components/creator/withdrawal-* src/app/creator/earnings/withdraw/page.tsx
git commit -m "feat(withdraw): creator withdrawal flow with live deduction breakdown"
```

---

### Task 30: Session close + rating

**Files:**
- Create: `src/components/shared/rating-input.tsx`
- Create: `src/app/api/sessions/[id]/rate/route.ts`
- Modify: `src/app/brand/sessions/[id]/page.tsx` (session complete state)
- Modify: `src/app/creator/sessions/[id]/page.tsx`

- [ ] **Step 1: rating-input.tsx**

5 animated stars. Hover-fill left-to-right 100ms/star. Click locks, scale bump. Below: optional textarea.

- [ ] **Step 2: /api/sessions/[id]/rate route**

POST body: `{rating: 1-5, text?: string}`. Inserts into `creator_ratings`. Enforces: requester is the brand on the session + session.status === 'completed' + no existing rating row.

- [ ] **Step 3: Session complete UI**

When `session.status === 'completed'`:
- Big "Complete" badge (mint) + scale-rotate spring entrance
- Stats: total images delivered, total spent/earned, date range
- Gallery: all delivered images with batch download
- Rating widget (brand only, if not already rated): `RatingInput` + submit → POST

Lottie confetti fires on brand's rating submission.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/rating-input.tsx src/app/api/sessions/[id]/rate/ src/app/brand/sessions/[id]/page.tsx src/app/creator/sessions/[id]/page.tsx
git commit -m "feat(close): session complete + rating flow"
```

---

## Phase 10 — Onboarding

### Task 31: Brand onboarding (5 steps)

**Files:**
- Modify: `src/app/brand/onboarding/page.tsx` (step 1) + `[step]/page.tsx`
- Create: `src/app/api/onboarding/brand/save-step/route.ts`
- Create: `src/app/api/onboarding/brand/complete/route.ts`

- [ ] **Step 1: Routes**

Save-step POST body: `{step: 1-5, data: {...}}`. Upserts into `brands` table. Tracks current step in `brands.onboarding_step` column (add migration if column missing).

Complete POST: validates required steps filled, sets `brands.onboarding_complete = true`, emits event to credit the 5 starter credits (via migration 00031 seed — already granted for existing brands; new brands need trigger or on-complete call).

- [ ] **Step 2: Step 1 — Company info**

Form fields: company_name, category (select), team_size (select). Progress: 1 of 5.

- [ ] **Step 3: Step 2 — GSTIN (optional)**

Textarea + "Skip" button. GSTIN validation regex.

- [ ] **Step 4: Step 3 — Brand kit (optional)**

Logo upload (R2), brand color hex, brand voice note.

- [ ] **Step 5: Step 4 — Use case**

Dropdown with 5 options (UGC ads, product shots, social content, internal campaigns, other).

- [ ] **Step 6: Step 5 — Starter credits**

Shows "5 free credits added!" confetti + offer to top up. "Continue to dashboard" CTA → POST complete → router.push('/brand/dashboard').

- [ ] **Step 7: Commit**

```bash
git add src/app/brand/onboarding/ src/app/api/onboarding/brand/
git commit -m "feat(brand-onboarding): 5-step wizard (company, GSTIN, kit, use-case, credits)"
```

---

### Task 32: Creator onboarding (7 steps)

**Files:**
- Modify: `src/app/creator/onboarding/page.tsx` + `[step]/page.tsx`
- Create: `src/app/api/onboarding/creator/save-step/route.ts` (may exist — check)
- Modify: `src/app/creator/reference-photos/page.tsx` (shared component used in onboarding step 2)
- Create: `src/components/creator/reference-photo-grid.tsx`
- Create: `src/components/creator/license-listing-editor.tsx`
- Modify: `src/app/creator/listings/new/page.tsx`
- Modify: `src/app/creator/listings/[id]/page.tsx`

- [ ] **Step 1: Save-step route**

Upserts `creators.onboarding_step`. Supports save-and-exit pattern: any step saves partial state.

- [ ] **Step 2: Step 1 — Basic info**

Full name, display name, phone (pre-filled from signup), bio (140 char).

- [ ] **Step 3: Step 2 — Reference photos**

Drag-drop upload area + progress bars per file. Min 10, max 20 photos. `ReferencePhotoGrid` with retake option. Face embeddings kick off in background (existing Chunk C function — call after upload).

- [ ] **Step 4: Step 3 — DPDP consent**

Scroll-gated checkbox "I consent to likeness processing per DPDP Act". Insert audit row + set `creators.dpdp_consent = true` + `dpdp_consent_at = now()`.

- [ ] **Step 5: Step 4 — Category & subcategory**

Primary (select from 12), subcategories (multi-select up to 5). Writes to `creators.categories` JSONB or `creator_categories` table depending on schema.

- [ ] **Step 6: Step 5 — Blocked concepts**

Pre-populated list (alcohol, tobacco, gambling, drugs, political, religious — shown as toggles). Custom blocks textarea (comma-sep). Writes each to `compliance_vectors` table with 1536-dim embedding (call `/api/compliance/embed` or reuse existing flow).

- [ ] **Step 7: Step 6 — License listings**

`LicenseListingEditor` with live calc per template. Creation ₹6,000/25/90 default; Creation+Promotion ₹15,000/10+IG/30 (requires IG handle, disables if not set). User can adjust price/quota/validity within templates' min/max (from `LICENSE_TEMPLATES` catalog in Chunk C).

Creator can add both, or skip Creation+Promotion.

- [ ] **Step 8: Step 7 — KYC (deferrable)**

Two CTAs at top: "Complete now" / "Complete later (go to dashboard)". "Later" path sets banner in dashboard. "Now" → route to `/creator/kyc`.

- [ ] **Step 9: Commit**

```bash
git add src/app/creator/onboarding/ src/app/api/onboarding/creator/ src/components/creator/reference-photo-grid.tsx src/components/creator/license-listing-editor.tsx src/app/creator/listings/ src/app/creator/reference-photos/page.tsx
git commit -m "feat(creator-onboarding): 7-step wizard (basic, photos, consent, cats, blocks, listings, KYC)"
```

---

### Task 33: KYC stepper page

**Files:**
- Modify: `src/app/creator/kyc/page.tsx`
- Create: `src/components/creator/kyc-stepper.tsx`

- [ ] **Step 1: kyc-stepper.tsx**

3-step sub-flow: PAN → Aadhaar → Bank. Uses Chunk C routes `/api/kyc/pan`, `/api/kyc/aadhaar`, `/api/kyc/bank`. Shows status per substep. Penny-drop flow for bank (already server-side) — user sees "Penny drop verified ₹1 received" confirmation.

- [ ] **Step 2: Page**

Wraps stepper with PageTitle. On all three success → fires confetti + "KYC complete!" toast → router.push('/creator/earnings').

- [ ] **Step 3: Commit**

```bash
git add src/components/creator/kyc-stepper.tsx src/app/creator/kyc/page.tsx
git commit -m "feat(kyc): creator KYC stepper (PAN → Aadhaar → Bank)"
```

---

## Phase 11 — Disputes

### Task 34: Dispute types + API routes

**Files:**
- Create: `src/domains/dispute/types.ts`
- Create: `src/app/api/disputes/route.ts` (POST raise)
- Create: `src/app/api/disputes/[id]/route.ts` (GET detail)
- Create: `src/app/api/disputes/[id]/resolve/route.ts` (admin POST)
- Create: `src/app/api/disputes/[id]/messages/route.ts`

- [ ] **Step 1: Types**

```typescript
export const DisputeReasonSchema = z.enum([
  "likeness_issue", "off_brief", "quality", "delivery_delay", "fraud", "other"
]);
export const DisputeStatusSchema = z.enum([
  "open", "under_review", "resolved_for_brand", "resolved_for_creator", "resolved_split", "closed_no_action"
]);
```

- [ ] **Step 2: POST /api/disputes (raise)**

Body: `{target_entity_type, target_entity_id, reason, description}`. Validates requester is participant of the target. Inserts dispute row + freezes the target entity (e.g., image status transition blocked). Emits notifications to both parties + admin.

- [ ] **Step 3: GET /api/disputes/[id]**

Returns dispute + messages + ledger context (for admin view).

- [ ] **Step 4: POST /api/disputes/[id]/resolve (admin only)**

Body: `{resolution: "refund_brand"|"release_to_creator"|"split"|"no_action", split?: {brand_pct, creator_pct}, note: string}`. Admin only. Fires appropriate ledger RPC (new migration needed) + notifications.

- [ ] **Step 5: Messages route**

GET + POST — same shape as license-messages.

- [ ] **Step 6: Commit**

```bash
git add src/domains/dispute/ src/app/api/disputes/
git commit -m "feat(disputes): API routes for raise, detail, resolve, messages"
```

---

### Task 35: Dispute UI — user + admin

**Files:**
- Create: `src/components/shared/dispute-raise-dialog.tsx`
- Create: `src/components/shared/dispute-detail.tsx`
- Create: `src/app/brand/disputes/page.tsx`
- Create: `src/app/brand/disputes/[id]/page.tsx`
- Create: `src/app/creator/disputes/page.tsx`
- Create: `src/app/creator/disputes/[id]/page.tsx`
- Modify: `src/app/admin/disputes/page.tsx`
- Modify: `src/app/admin/disputes/[id]/page.tsx`

- [ ] **Step 1: Raise dialog**

Dialog with reason dropdown + description textarea + evidence upload (up to 3 files). POST to /api/disputes. On success: target entity shows "Disputed" badge + thread visible.

- [ ] **Step 2: Detail view**

Thread pattern (reuse chat-message/composer with different styling + status header). Shows ledger context (for admin: full credit_transactions + escrow_ledger entries related to the target).

- [ ] **Step 3: User-side pages (brand + creator)**

List + detail pages. Note: `/brand/disputes` and `/creator/disputes` are NEW routes not in Chunk B. Add to nav items if not already there (they aren't) — they're accessed via contextual links from sessions/licenses/images, not primary nav. Verify Chunk B added `disputes` to nav-items — if not, no problem, pages still work.

- [ ] **Step 4: Admin pages**

Queue sorted by age. Detail shows everything + resolution actions (admin controls).

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/dispute-* src/app/brand/disputes/ src/app/creator/disputes/ src/app/admin/disputes/
git commit -m "feat(disputes): raise dialog + user + admin pages"
```

---

## Phase 12 — Notifications

### Task 36: Notifications API + hook + popover

**Files:**
- Create: `src/app/api/notifications/route.ts`
- Create: `src/app/api/notifications/mark-all-read/route.ts`
- Create: `src/lib/hooks/use-notifications.ts`
- Modify: `src/components/layouts/nav/notifications-popover.tsx`

- [ ] **Step 1: API**

GET: last 50, unread first. PATCH `/api/notifications/[id]` sets read_at=now. POST `/mark-all-read`.

- [ ] **Step 2: Hook**

React Query + Supabase Realtime subscription to `notifications` table filtered by user_id. On INSERT → invalidate list + fire bell wiggle (class toggle).

- [ ] **Step 3: Popover**

Replace Chunk B stub with real list. Each notification: icon by type, title, short desc, time ago, unread dot. Click → navigates to `link_href` + marks read. "Mark all read" button. Unread count badge on bell.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/notifications/ src/lib/hooks/use-notifications.ts src/components/layouts/nav/notifications-popover.tsx
git commit -m "feat(notifications): in-app notifications API + popover + realtime"
```

---

### Task 37: Email digest via Inngest cron + notification emitters

**Files:**
- Create: `src/inngest/functions/notifications/emit.ts`
- Create: `src/inngest/functions/notifications/email-digest.ts`
- Create: `src/lib/email/templates.ts`

- [ ] **Step 1: Emission helper**

`emitNotification({userId, type, title, body, payload, linkHref})` — inserts row into notifications table. Also optionally sends email via Resend per catalog rules (spec §6.2).

- [ ] **Step 2: Wire emitters into existing flows**

Every route that creates a state transition (license accept, image generate, approve/reject, withdrawal create/success, credit top-up, etc.) calls `emitNotification` for the right party.

Add these calls to:
- `/api/licenses/[id]/accept` — brand notif
- `/api/licenses/[id]/reject` — brand notif
- `/api/images/[id]/approve` — brand notif
- `/api/images/[id]/reject` — brand notif
- `/api/withdrawals/create` — creator notif
- `/api/cashfree/webhook` — per event (credit topped up, withdrawal success/failed)
- Inngest post-generation-success — creator notif (batched max 1/hr)

- [ ] **Step 3: Email digest cron**

Inngest cron (every 1h or as per spec): batch unread notifications of type `image_awaiting_approval` for each creator → send single "You have N images awaiting approval" email.

- [ ] **Step 4: Email templates**

Resend email templates: license_requested, license_accepted, image_awaiting_approval, withdrawal_success, withdrawal_failed, credit_top_up_receipt.

Each template is a plain Markdown string with variable interpolation — keep simple for MVP.

- [ ] **Step 5: Commit**

```bash
git add src/inngest/functions/notifications/ src/lib/email/
git commit -m "feat(notifications): emit helper + email digest cron + event wiring"
```

---

## Phase 13 — Public utility pages

### Task 38: /u/generations/[id] public preview

**Files:**
- Modify: `src/app/u/generations/[id]/page.tsx`
- Create: `src/app/api/generations/[id]/public/route.ts`

- [ ] **Step 1: Public API route**

Returns watermarked image URL (generate on-demand via Cloudflare Image Resizing OR pre-generate + store watermarked copy on generation). Shows minimal metadata: creator display name, license template, approved date. No PII.

- [ ] **Step 2: Page**

Simple centered preview with brand/creator attribution + "Request similar" CTA routing to creator profile.

- [ ] **Step 3: Commit**

```bash
git add src/app/u/generations/[id]/ src/app/api/generations/[id]/public/
git commit -m "feat(public): watermarked generation preview"
```

---

### Task 39: /u/profile/[creator_id] public creator profile

**Files:**
- Modify: `src/app/u/profile/[creator_id]/page.tsx`

- [ ] **Step 1: Page**

Reuses `CreatorProfileHeader` but with a public-only version of the creator API route (returns only public fields). Same tabs. "Sign up to request" CTA routes to `/signup/brand`.

- [ ] **Step 2: Commit**

```bash
git add src/app/u/profile/[creator_id]/
git commit -m "feat(public): public creator profile (read-only)"
```

---

## Phase 14 — Analytics + admin pages + testing

### Task 40: PostHog event instrumentation

**Files:**
- Modify: many components/routes — thin adds of `analytics.capture(...)` calls
- Create: `src/lib/analytics/capture.ts` — thin wrapper over posthog

- [ ] **Step 1: Wrapper**

```typescript
"use client";
import posthog from "posthog-js";

export function capture(event: string, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  posthog.capture(event, props);
}
```

Server-side via `posthog-node` already in deps.

- [ ] **Step 2: Wire event calls per spec §14 catalog**

Every listed event fires from the relevant action — signup completion, onboarding step complete, license request, image approved, withdrawal initiated, etc.

- [ ] **Step 3: Commit**

```bash
git add src/lib/analytics/ <files modified>
git commit -m "feat(analytics): PostHog event instrumentation per spec catalog"
```

---

### Task 41: Admin pages (disputes done in Task 35; add ledgers, reconcile, users, audit-log)

**Files:**
- Modify: `src/app/admin/ledgers/page.tsx`
- Modify: `src/app/admin/reconcile/page.tsx`
- Modify: `src/app/admin/users/page.tsx`
- Modify: `src/app/admin/users/[id]/page.tsx`
- Modify: `src/app/admin/audit-log/page.tsx`
- Create: thin API routes under `/api/admin/*` for each

- [ ] **Step 1: Ledgers**

Table view with filters: type (credit / escrow / platform_revenue / gst / tcs / tds) + date range + user. CSV export.

- [ ] **Step 2: Reconcile**

List of stuck credit_top_ups + withdrawal_requests + unprocessed webhook_events (from Chunk C reconcile job). Click row → manual retry button (server-side kicks RPC).

- [ ] **Step 3: Users**

Paginated user list with role filter. Click → detail with KYC override, impersonate button (fires short-lived admin token — stub for MVP with banner "Impersonate not implemented yet").

- [ ] **Step 4: Audit log**

Reverse-chrono list of audit_log entries. Filters by actor, entity_type, event_type, date range.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/ src/app/api/admin/
git commit -m "feat(admin): ledgers, reconcile, users, audit-log pages"
```

---

### Task 42: Playwright brand + creator e2e journeys

**Files:**
- Create: `tests/e2e/brand-journey.spec.ts`
- Create: `tests/e2e/creator-journey.spec.ts`

- [ ] **Step 1: Brand journey**

Seeded test brand user. Flow: login → onboard (5 steps) → top-up (mock Cashfree) → browse creators → click creator → request license → see "Request sent".

Use test credentials via env. If tests require a seed script, add `scripts/seed-test-users.ts`.

- [ ] **Step 2: Creator journey**

Seeded test creator user. Flow: login → onboard basic + photos + consent + categories + listings → (KYC defer) → accept incoming request (seed one) → contract sign → approve image → withdraw.

Use fake KYC API responses in test mode. Flag: check if Cashfree has a test mode / mock server — if not, mock the HTTP layer per test.

- [ ] **Step 3: Run locally**

Run: `pnpm playwright test tests/e2e/brand-journey.spec.ts`
Expected: PASS (or skip cleanly if test users not seeded — log reason).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/ scripts/seed-test-users.ts
git commit -m "test(e2e): brand + creator full journey tests"
```

---

## Phase 15 — Final verification

### Task 43: Full suite green + Chunk D runbook

**Files:**
- Create: `docs/superpowers/runbooks/chunk-d-verification.md`

- [ ] **Step 1: Run everything**

```bash
pnpm tsc --noEmit
pnpm vitest run
pnpm playwright test
pnpm build
```

Expected: all green. If any test skips due to external dep (Cashfree sandbox), the runbook should note how to execute manually.

- [ ] **Step 2: Lighthouse mobile audit**

Run Lighthouse against `/brand/dashboard` and `/creator/dashboard` on iPhone SE viewport. Record numbers. Fix any P90 offenders (image sizing, blocking scripts) inline.

- [ ] **Step 3: Create verification runbook**

```markdown
# Chunk D verification checklist

## Brand flow (seeded)
- [ ] Login → lands on /brand/dashboard with real widgets
- [ ] Credits balance widget animates count-up on load
- [ ] Top-up: select pack → Cashfree sandbox redirect → return with credits incremented
- [ ] /brand/creators: filter by category, sort by price — results update
- [ ] Open creator profile → request creation license → see checkout summary math is correct
- [ ] Submit → creator notified (check dev Inngest dashboard + notifications table)

## Creator flow (seeded)
- [ ] Login → lands on /creator/dashboard
- [ ] /creator/requests: seeded request visible with SLA timer
- [ ] Click → see breakdown (TCS/TDS/GST/net)
- [ ] Accept → contract viewer opens → scroll to bottom + agree → sign
- [ ] Redirected to /creator/sessions/[id]
- [ ] Brand kicks generation (manually via second browser session)
- [ ] Creator sees new approval in /creator/approvals within 3s
- [ ] Approve → Lottie plays → queue decrements
- [ ] /creator/earnings: balance animated, chart renders
- [ ] Withdraw: deductions match math → Cashfree sandbox success → bank "received"

## Dispute flow
- [ ] Raise dispute on an image — freezes state
- [ ] Admin resolves for brand — refund fires → both notified → ledger logs

## Mobile (iPhone SE)
- [ ] Every page above passes: no horizontal scroll, 44px tap targets, bottom nav present

## Accessibility
- [ ] Tab through /brand/dashboard — all interactive elements focusable, focus ring visible
- [ ] Screen reader (VoiceOver) reads page titles, SLA timers, approval buttons

## Performance
- [ ] Lighthouse mobile perf ≥ 85 on dashboards
- [ ] Initial JS ≤ 180KB gzipped for /brand/dashboard
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/runbooks/chunk-d-verification.md
git commit -m "docs(runbook): Chunk D verification checklist"
```

---

## Done when

1. All 43 tasks complete + committed
2. `pnpm tsc --noEmit && pnpm vitest run && pnpm playwright test && pnpm build` green
3. Brand can complete full Book → Session active; Creator can accept + approve + withdraw
4. Real-time updates work (chat, generation pipeline, notifications)
5. Disputes raise → admin resolve → ledger reflects
6. Mobile journeys pass on iPhone SE
7. Lighthouse mobile ≥ 85 on dashboards
8. Verification runbook ticked

> **After Chunk D:** only Chunk A (landing page revamp) remains. Chunk A is mostly marketing copy + hero illustrations and is unblocked by everything in A/B/C/D.
