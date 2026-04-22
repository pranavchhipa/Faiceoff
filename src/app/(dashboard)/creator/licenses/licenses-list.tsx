"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Building2, ShieldAlert } from "lucide-react";

type LicenseStatus = "active" | "expired" | "revoked";
type FilterStatus = "all" | LicenseStatus;

interface LicenseItem {
  id: string;
  brand_id: string;
  creator_id: string;
  scope: string;
  is_category_exclusive: boolean;
  exclusive_category: string | null;
  amount_paid_paise: number;
  creator_share_paise: number;
  issued_at: string;
  expires_at: string;
  auto_renew: boolean;
  renewed_count: number;
  status: string;
  revoked_at: string | null;
  revocation_reason: string | null;
  cert_url: string | null;
  creator_display_name: string;
  brand_company_name: string;
  days_to_expiry: number;
}

interface ListResponse {
  items: LicenseItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages?: number;
}

function fmt(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
    new Date(iso),
  );
}

const SCOPE_LABELS: Record<string, string> = {
  digital: "Digital",
  digital_print: "Digital + Print",
  digital_print_packaging: "Digital + Print + Packaging",
};

const STATUS_CONFIG: Record<
  LicenseStatus,
  { label: string; bg: string; text: string }
> = {
  active: { label: "Active", bg: "var(--color-mint)", text: "var(--color-neutral-700)" },
  expired: { label: "Expired", bg: "var(--color-neutral-100)", text: "var(--color-neutral-500)" },
  revoked: { label: "Revoked", bg: "var(--color-blush)", text: "var(--color-neutral-700)" },
};

const REVOKE_REASONS = [
  { value: "Brand misused image", label: "Brand misused image" },
  { value: "Personal reasons", label: "Personal reasons" },
  { value: "Compensation issue", label: "Compensation issue" },
  { value: "Other", label: "Other (specify)" },
];

const FILTERS: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
];

function RevokeModal({
  license,
  open,
  onClose,
  onRevoked,
}: {
  license: LicenseItem;
  open: boolean;
  onClose: () => void;
  onRevoked: (id: string) => void;
}) {
  const [selectedReason, setSelectedReason] = useState("Personal reasons");
  const [otherText, setOtherText] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleRevoke() {
    const reason =
      selectedReason === "Other" ? otherText.trim() || "Other" : selectedReason;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/licenses/${license.id}/revoke`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        if (!res.ok) {
          const j = (await res.json()) as { error?: string };
          throw new Error(j.error ?? "revoke failed");
        }
        toast.success("License revoked");
        onRevoked(license.id);
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to revoke license");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke this license?</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <p className="text-sm text-[var(--color-neutral-500)]">
            Revoking will prevent{" "}
            <span className="font-semibold text-[var(--color-ink)]">
              {license.brand_company_name}
            </span>{" "}
            from using this license. This action cannot be undone.
          </p>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--color-neutral-600)]">
              Reason for revocation
            </p>
            {REVOKE_REASONS.map((r) => (
              <label
                key={r.value}
                className="flex items-center gap-2.5 cursor-pointer text-sm text-[var(--color-ink)]"
              >
                <input
                  type="radio"
                  name="revoke-reason"
                  value={r.value}
                  checked={selectedReason === r.value}
                  onChange={() => setSelectedReason(r.value)}
                  className="accent-[var(--color-accent-gold)]"
                />
                {r.label}
              </label>
            ))}
            {selectedReason === "Other" && (
              <textarea
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Describe your reason…"
                rows={3}
                maxLength={500}
                className="w-full rounded-[var(--radius-input)] border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-neutral-400)] outline-none focus:border-[var(--color-accent-gold)] focus:ring-1 focus:ring-[var(--color-accent-gold)]/30 resize-none"
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="rounded-[var(--radius-button)]">
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleRevoke}
            disabled={isPending || (selectedReason === "Other" && !otherText.trim())}
            className="rounded-[var(--radius-button)]"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Revoking…
              </>
            ) : (
              <>
                <ShieldAlert className="size-4" /> Confirm revoke
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LicensesList({ initial }: { initial: ListResponse }) {
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse>(initial);
  const [isPending, startTransition] = useTransition();
  const [revokeTarget, setRevokeTarget] = useState<LicenseItem | null>(null);

  function fetchPage(nextPage: number, status: FilterStatus) {
    startTransition(async () => {
      const qs = new URLSearchParams({ page: String(nextPage) });
      if (status !== "all") qs.set("status", status);
      try {
        const res = await fetch(`/api/licenses/list?${qs.toString()}`);
        if (!res.ok) return;
        const json = (await res.json()) as ListResponse;
        setData(json);
        setPage(nextPage);
      } catch {
        // silent
      }
    });
  }

  function handleFilter(val: FilterStatus) {
    setFilter(val);
    fetchPage(1, val);
  }

  function handleRevoked(licenseId: string) {
    setData((d) => ({
      ...d,
      items: d.items.map((it) =>
        it.id === licenseId
          ? { ...it, status: "revoked", revoked_at: new Date().toISOString() }
          : it,
      ),
    }));
  }

  const totalPages = Math.ceil(data.total / data.pageSize) || 1;
  const items = data.items;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="max-w-3xl"
    >
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-on-surface)]">
          Active licenses
        </h1>
        <p className="mt-1 text-sm text-[var(--color-outline)]">
          Licenses granted to brands for using your likeness.
        </p>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => handleFilter(f.value)}
            className={`px-3 py-1.5 rounded-[var(--radius-pill)] text-xs font-semibold transition-colors ${
              filter === f.value
                ? "bg-[var(--color-ink)] text-white"
                : "bg-[var(--color-neutral-100)] text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-200)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isPending && (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-[var(--color-neutral-400)]" />
        </div>
      )}

      {/* Empty */}
      {!isPending && items.length === 0 && (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-12 text-center">
          <FileText className="size-10 mx-auto mb-3 text-[var(--color-neutral-300)]" />
          <p className="font-semibold text-[var(--color-ink)]">No licenses found</p>
          <p className="text-sm text-[var(--color-neutral-500)] mt-1">
            Licenses will appear here when brands use your likeness.
          </p>
        </div>
      )}

      {/* Cards */}
      {!isPending && items.length > 0 && (
        <div className="space-y-3">
          {items.map((lic, i) => {
            const statusKey =
              (lic.status as LicenseStatus) in STATUS_CONFIG
                ? (lic.status as LicenseStatus)
                : "active";
            const cfg = STATUS_CONFIG[statusKey];
            const isActive = statusKey === "active";

            return (
              <motion.div
                key={lic.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-5 shadow-[var(--shadow-soft)]"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  {/* Brand info */}
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-[var(--color-ocean)] flex items-center justify-center shrink-0">
                      <Building2 className="size-5 text-[var(--color-neutral-600)]" />
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--color-ink)]">
                        {lic.brand_company_name}
                      </p>
                      <p className="text-xs text-[var(--color-neutral-400)] font-mono">
                        {lic.id.slice(0, 8)}
                      </p>
                    </div>
                  </div>

                  {/* Status pill */}
                  <span
                    className="px-2.5 py-1 rounded-[var(--radius-pill)] text-xs font-semibold"
                    style={{ background: cfg.bg, color: cfg.text }}
                  >
                    {cfg.label}
                  </span>
                </div>

                {/* Scope chips */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="px-2 py-0.5 rounded-[var(--radius-pill)] bg-[var(--color-neutral-100)] text-xs font-medium text-[var(--color-neutral-600)]">
                    {SCOPE_LABELS[lic.scope] ?? lic.scope}
                  </span>
                  {lic.is_category_exclusive && lic.exclusive_category && (
                    <span className="px-2 py-0.5 rounded-[var(--radius-pill)] bg-[var(--color-lilac)] text-xs font-medium text-[var(--color-neutral-700)]">
                      Exclusive: {lic.exclusive_category}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-[var(--radius-pill)] bg-[var(--color-blush)] text-xs font-medium text-[var(--color-neutral-700)]">
                    {fmt(lic.creator_share_paise)} earned
                  </span>
                </div>

                {/* Dates */}
                <div className="mt-3 flex gap-4 text-xs text-[var(--color-neutral-500)]">
                  <span>Issued {fmtDate(lic.issued_at)}</span>
                  <span>Expires {fmtDate(lic.expires_at)}</span>
                  {lic.days_to_expiry > 0 && isActive && (
                    <span className="text-[var(--color-accent-gold)] font-medium">
                      {lic.days_to_expiry}d left
                    </span>
                  )}
                </div>

                {/* Revoke button */}
                {isActive && (
                  <div className="mt-4 pt-3 border-t border-[var(--color-neutral-100)]">
                    <button
                      onClick={() => setRevokeTarget(lic)}
                      className="text-xs font-semibold text-red-500 hover:text-red-600 transition-colors"
                    >
                      Revoke license
                    </button>
                  </div>
                )}

                {/* Revoke info */}
                {statusKey === "revoked" && lic.revocation_reason && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-neutral-100)]">
                    <p className="text-xs text-[var(--color-neutral-500)]">
                      Reason: {lic.revocation_reason}
                    </p>
                    {lic.revoked_at && (
                      <p className="text-xs text-[var(--color-neutral-400)]">
                        Revoked {fmtDate(lic.revoked_at)}
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!isPending && totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm">
          <button
            onClick={() => fetchPage(page - 1, filter)}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-[var(--radius-button)] border border-[var(--color-neutral-200)] text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-[var(--color-neutral-500)]">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => fetchPage(page + 1, filter)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-[var(--radius-button)] border border-[var(--color-neutral-200)] text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {/* Revoke modal */}
      {revokeTarget && (
        <RevokeModal
          license={revokeTarget}
          open={Boolean(revokeTarget)}
          onClose={() => setRevokeTarget(null)}
          onRevoked={handleRevoked}
        />
      )}
    </motion.div>
  );
}
