"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /admin/packs — Credit pack catalog management
//
// Table of all packs with inline toggles for active/popular, edit + soft-
// delete dialogs, and an add/edit form. Uses the new Hybrid Soft Luxe v2
// token system (foreground / muted-foreground / card / secondary / primary).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CreditPack, UpsertPackInput } from "@/lib/billing";

/* ── Types ── */

interface PacksTableProps {
  initialPacks: CreditPack[];
}

type PackFormState = {
  code: string;
  display_name: string;
  credits: string;
  bonus_credits: string;
  price_rupees: string;
  sort_order: string;
  marketing_tagline: string;
  is_popular: boolean;
  is_active: boolean;
};

/* ── Helpers ── */

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function perCreditPrice(paise: number, credits: number): string {
  if (!credits) return "—";
  const perCredit = paise / credits / 100;
  return `₹${perCredit.toFixed(2)}`;
}

function blankForm(): PackFormState {
  return {
    code: "",
    display_name: "",
    credits: "",
    bonus_credits: "0",
    price_rupees: "",
    sort_order: "10",
    marketing_tagline: "",
    is_popular: false,
    is_active: true,
  };
}

function packToForm(pack: CreditPack): PackFormState {
  return {
    code: pack.code,
    display_name: pack.display_name,
    credits: String(pack.credits),
    bonus_credits: String(pack.bonus_credits),
    price_rupees: String(pack.price_paise / 100),
    sort_order: String(pack.sort_order),
    marketing_tagline: pack.marketing_tagline ?? "",
    is_popular: pack.is_popular,
    is_active: pack.is_active,
  };
}

function formToInput(f: PackFormState): UpsertPackInput {
  return {
    code: f.code as UpsertPackInput["code"],
    display_name: f.display_name,
    credits: Number(f.credits) || 0,
    bonus_credits: Number(f.bonus_credits) || 0,
    price_paise: Math.round(Number(f.price_rupees) * 100),
    sort_order: Number(f.sort_order) || 0,
    marketing_tagline: f.marketing_tagline || null,
    is_popular: f.is_popular,
    is_active: f.is_active,
  };
}

/* ── Pack form ── */

function PackFormFields({
  form,
  onChange,
  isEditing,
}: {
  form: PackFormState;
  onChange: (updates: Partial<PackFormState>) => void;
  isEditing: boolean;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-600 text-[var(--color-foreground)]">
            Code
          </label>
          <Input
            value={form.code}
            onChange={(e) => onChange({ code: e.target.value })}
            placeholder="e.g. pro"
            disabled={isEditing}
            className="rounded-xl border-[var(--color-border)] text-sm font-500 disabled:bg-[var(--color-secondary)] disabled:opacity-60"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-600 text-[var(--color-foreground)]">
            Display name
          </label>
          <Input
            value={form.display_name}
            onChange={(e) => onChange({ display_name: e.target.value })}
            placeholder="e.g. Pro Pack"
            className="rounded-xl border-[var(--color-border)] text-sm font-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-600 text-[var(--color-foreground)]">
            Credits
          </label>
          <Input
            type="number"
            min={0}
            value={form.credits}
            onChange={(e) => onChange({ credits: e.target.value })}
            placeholder="100"
            className="rounded-xl border-[var(--color-border)] text-sm font-500"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-600 text-[var(--color-foreground)]">
            Bonus credits
          </label>
          <Input
            type="number"
            min={0}
            value={form.bonus_credits}
            onChange={(e) => onChange({ bonus_credits: e.target.value })}
            placeholder="0"
            className="rounded-xl border-[var(--color-border)] text-sm font-500"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-600 text-[var(--color-foreground)]">
            Price (₹)
          </label>
          <Input
            type="number"
            min={0}
            step={1}
            value={form.price_rupees}
            onChange={(e) => onChange({ price_rupees: e.target.value })}
            placeholder="999"
            className="rounded-xl border-[var(--color-border)] text-sm font-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-600 text-[var(--color-foreground)]">
            Sort order
          </label>
          <Input
            type="number"
            min={0}
            value={form.sort_order}
            onChange={(e) => onChange({ sort_order: e.target.value })}
            placeholder="10"
            className="rounded-xl border-[var(--color-border)] text-sm font-500"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-600 text-[var(--color-foreground)]">
            Marketing tagline
          </label>
          <Input
            value={form.marketing_tagline}
            onChange={(e) => onChange({ marketing_tagline: e.target.value })}
            placeholder="e.g. Most popular"
            className="rounded-xl border-[var(--color-border)] text-sm font-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-6 pt-1">
        <label className="flex cursor-pointer select-none items-center gap-2">
          <input
            type="checkbox"
            checked={form.is_popular}
            onChange={(e) => onChange({ is_popular: e.target.checked })}
            className="size-4 rounded accent-[var(--color-primary)]"
          />
          <span className="text-sm font-600 text-[var(--color-foreground)]">
            Mark as popular
          </span>
        </label>
        <label className="flex cursor-pointer select-none items-center gap-2">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => onChange({ is_active: e.target.checked })}
            className="size-4 rounded accent-emerald-500"
          />
          <span className="text-sm font-600 text-[var(--color-foreground)]">
            Active
          </span>
        </label>
      </div>
    </div>
  );
}

/* ── Main component ── */

export function PacksTable({ initialPacks }: PacksTableProps) {
  const [packs, setPacks] = useState<CreditPack[]>(initialPacks);
  const [isPending, startTransition] = useTransition();

  // Add/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<CreditPack | null>(null);
  const [form, setForm] = useState<PackFormState>(blankForm());
  const [formPending, startFormTransition] = useTransition();

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<CreditPack | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  /* ── Reload packs ── */
  function reloadPacks() {
    startTransition(async () => {
      const res = await fetch("/api/admin/packs", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { packs: CreditPack[] };
        setPacks(data.packs ?? []);
      } else {
        toast.error("Failed to reload packs");
      }
    });
  }

  /* ── Open add modal ── */
  function openAdd() {
    setEditingPack(null);
    setForm(blankForm());
    setModalOpen(true);
  }

  /* ── Open edit modal ── */
  function openEdit(pack: CreditPack) {
    setEditingPack(pack);
    setForm(packToForm(pack));
    setModalOpen(true);
  }

  /* ── Submit add/edit ── */
  function handleSubmit() {
    const input = formToInput(form);
    if (!input.code) {
      toast.error("Code is required");
      return;
    }
    if (!input.display_name) {
      toast.error("Display name is required");
      return;
    }
    if (input.credits < 0) {
      toast.error("Credits must be >= 0");
      return;
    }

    startFormTransition(async () => {
      const isEdit = Boolean(editingPack);
      const url = isEdit
        ? `/api/admin/packs/${editingPack!.code}`
        : "/api/admin/packs";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (res.ok) {
        toast.success(isEdit ? "Pack updated" : "Pack created");
        setModalOpen(false);
        reloadPacks();
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(data.error ?? "Failed to save pack");
      }
    });
  }

  /* ── Quick toggle (active / popular) ── */
  function toggleField(pack: CreditPack, field: "is_active" | "is_popular") {
    startTransition(async () => {
      const res = await fetch(`/api/admin/packs/${pack.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !pack[field] }),
      });
      if (res.ok) {
        setPacks((prev) =>
          prev.map((p) =>
            p.code === pack.code ? { ...p, [field]: !pack[field] } : p,
          ),
        );
        toast.success(`${field === "is_active" ? "Active" : "Popular"} toggled`);
      } else {
        toast.error("Toggle failed");
      }
    });
  }

  /* ── Soft-delete ── */
  function handleDelete() {
    if (!deleteTarget) return;
    startDeleteTransition(async () => {
      const res = await fetch(`/api/admin/packs/${deleteTarget.code}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(`Pack "${deleteTarget.code}" deactivated`);
        setDeleteTarget(null);
        reloadPacks();
      } else {
        toast.error("Delete failed");
      }
    });
  }

  const activeCount = packs.filter((p) => p.is_active).length;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-8 lg:py-8">
      {/* ═══════════ Header ═══════════ */}
      <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <Package className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            Pricing ops · brand top-ups · catalog
          </p>
          <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[36px]">
            Credit packs
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            <span className="font-600 text-[var(--color-foreground)]">
              {packs.length}
            </span>{" "}
            in catalog · {activeCount} active · changes go live the moment you save.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={reloadPacks}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[13px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)] disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-sm transition-transform hover:-translate-y-0.5"
          >
            <Plus className="h-3.5 w-3.5" />
            New pack
          </button>
        </div>
      </div>

      {/* ═══════════ Table ═══════════ */}
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-secondary)]/60">
                {[
                  "Sort",
                  "Code",
                  "Name",
                  "Credits",
                  "Bonus",
                  "Price",
                  "Per credit",
                  "Active",
                  "Popular",
                  "",
                ].map((col) => (
                  <th
                    key={col}
                    className="whitespace-nowrap px-4 py-3 text-left font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {packs.map((pack, i) => (
                  <motion.tr
                    key={pack.code}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2, delay: i * 0.03 }}
                    className={`border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-secondary)]/60 ${
                      !pack.is_active ? "opacity-55" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-[12px] font-600 text-[var(--color-muted-foreground)]">
                      {pack.sort_order}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-[var(--color-secondary)] px-2 py-0.5 font-mono text-xs font-700 text-[var(--color-foreground)]">
                        {pack.code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-600 text-[var(--color-foreground)]">
                        {pack.display_name}
                      </p>
                      {pack.marketing_tagline && (
                        <p className="max-w-[200px] truncate text-xs text-[var(--color-muted-foreground)]">
                          {pack.marketing_tagline}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-700 text-[var(--color-foreground)]">
                      {pack.credits.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 font-500 text-[var(--color-muted-foreground)]">
                      {pack.bonus_credits > 0 ? `+${pack.bonus_credits}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-700 text-[var(--color-primary)]">
                      {formatINR(pack.price_paise)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-500 text-[var(--color-muted-foreground)]">
                      {perCreditPrice(pack.price_paise, pack.credits)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleField(pack, "is_active")}
                        disabled={isPending}
                        className="transition-opacity hover:opacity-70 disabled:opacity-30"
                        title={pack.is_active ? "Deactivate" : "Activate"}
                      >
                        {pack.is_active ? (
                          <CheckCircle2 className="size-4 text-emerald-500 dark:text-emerald-300" />
                        ) : (
                          <XCircle className="size-4 text-[var(--color-muted-foreground)]" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleField(pack, "is_popular")}
                        disabled={isPending}
                        className="transition-opacity hover:opacity-70 disabled:opacity-30"
                        title={pack.is_popular ? "Unmark popular" : "Mark popular"}
                      >
                        <Star
                          className={`size-4 ${
                            pack.is_popular
                              ? "fill-[var(--color-primary)] text-[var(--color-primary)]"
                              : "text-[var(--color-muted-foreground)]"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEdit(pack)}
                          title="Edit pack"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(pack)}
                          title="Deactivate pack"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted-foreground)] transition-colors hover:bg-rose-500/10 hover:text-rose-500 dark:hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {packs.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex size-12 items-center justify-center rounded-full bg-[var(--color-secondary)]">
                        <Package className="h-5 w-5 text-[var(--color-muted-foreground)]" />
                      </div>
                      <p className="text-sm text-[var(--color-muted-foreground)]">
                        No packs yet. Click{" "}
                        <span className="font-700 text-[var(--color-foreground)]">
                          New pack
                        </span>{" "}
                        to add one.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════════ Add / Edit modal ═══════════ */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="rounded-2xl border-[var(--color-border)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-800 tracking-tight text-[var(--color-foreground)]">
              {editingPack
                ? `Edit pack · ${editingPack.code}`
                : "Add new pack"}
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--color-muted-foreground)]">
              {editingPack
                ? "Update this credit pack. Code cannot be changed."
                : "Create a new credit pack. Code must be unique."}
            </DialogDescription>
          </DialogHeader>

          <PackFormFields
            form={form}
            onChange={(updates) => setForm((prev) => ({ ...prev, ...updates }))}
            isEditing={Boolean(editingPack)}
          />

          <DialogFooter>
            <button
              onClick={() => setModalOpen(false)}
              disabled={formPending}
              className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-[13px] font-600 text-[var(--color-foreground)] hover:bg-[var(--color-secondary)] disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={formPending}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-sm hover:-translate-y-0.5 disabled:opacity-60"
            >
              {formPending && (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              )}
              {editingPack ? "Save changes" : "Create pack"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Delete confirm modal ═══════════ */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="rounded-2xl border-[var(--color-border)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-800 tracking-tight text-[var(--color-foreground)]">
              Deactivate pack?
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--color-muted-foreground)]">
              Pack{" "}
              <span className="font-mono font-700 text-[var(--color-foreground)]">
                {deleteTarget?.code}
              </span>{" "}
              will be set to inactive. Brands won&apos;t be able to purchase it.
              Existing purchases are unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={deletePending}
              className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-[13px] font-600 text-[var(--color-foreground)] hover:bg-[var(--color-secondary)] disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deletePending}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-500 px-4 py-2 text-[13px] font-700 text-white hover:bg-rose-600 disabled:opacity-60"
            >
              {deletePending ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Deactivate
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
