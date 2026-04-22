"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Star,
  Package,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
          <label className="block text-xs font-600 text-[var(--color-on-surface)] mb-1.5">
            Code
          </label>
          <Input
            value={form.code}
            onChange={(e) => onChange({ code: e.target.value })}
            placeholder="e.g. pro"
            disabled={isEditing}
            className="rounded-xl border-[var(--color-outline-variant)]/20 text-sm font-500 disabled:opacity-50 disabled:bg-[var(--color-surface-container-low)]"
          />
        </div>
        <div>
          <label className="block text-xs font-600 text-[var(--color-on-surface)] mb-1.5">
            Display name
          </label>
          <Input
            value={form.display_name}
            onChange={(e) => onChange({ display_name: e.target.value })}
            placeholder="e.g. Pro Pack"
            className="rounded-xl border-[var(--color-outline-variant)]/20 text-sm font-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-600 text-[var(--color-on-surface)] mb-1.5">
            Credits
          </label>
          <Input
            type="number"
            min={0}
            value={form.credits}
            onChange={(e) => onChange({ credits: e.target.value })}
            placeholder="100"
            className="rounded-xl border-[var(--color-outline-variant)]/20 text-sm font-500"
          />
        </div>
        <div>
          <label className="block text-xs font-600 text-[var(--color-on-surface)] mb-1.5">
            Bonus credits
          </label>
          <Input
            type="number"
            min={0}
            value={form.bonus_credits}
            onChange={(e) => onChange({ bonus_credits: e.target.value })}
            placeholder="0"
            className="rounded-xl border-[var(--color-outline-variant)]/20 text-sm font-500"
          />
        </div>
        <div>
          <label className="block text-xs font-600 text-[var(--color-on-surface)] mb-1.5">
            Price (₹)
          </label>
          <Input
            type="number"
            min={0}
            step={1}
            value={form.price_rupees}
            onChange={(e) => onChange({ price_rupees: e.target.value })}
            placeholder="999"
            className="rounded-xl border-[var(--color-outline-variant)]/20 text-sm font-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-600 text-[var(--color-on-surface)] mb-1.5">
            Sort order
          </label>
          <Input
            type="number"
            min={0}
            value={form.sort_order}
            onChange={(e) => onChange({ sort_order: e.target.value })}
            placeholder="10"
            className="rounded-xl border-[var(--color-outline-variant)]/20 text-sm font-500"
          />
        </div>
        <div>
          <label className="block text-xs font-600 text-[var(--color-on-surface)] mb-1.5">
            Marketing tagline
          </label>
          <Input
            value={form.marketing_tagline}
            onChange={(e) => onChange({ marketing_tagline: e.target.value })}
            placeholder="e.g. Most popular"
            className="rounded-xl border-[var(--color-outline-variant)]/20 text-sm font-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-6 pt-1">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.is_popular}
            onChange={(e) => onChange({ is_popular: e.target.checked })}
            className="size-4 rounded accent-[var(--color-accent-gold)]"
          />
          <span className="text-sm font-600 text-[var(--color-on-surface)]">
            Mark as popular
          </span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => onChange({ is_active: e.target.checked })}
            className="size-4 rounded accent-[var(--color-primary)]"
          />
          <span className="text-sm font-600 text-[var(--color-on-surface)]">
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
    if (!input.code) { toast.error("Code is required"); return; }
    if (!input.display_name) { toast.error("Display name is required"); return; }
    if (input.credits < 0) { toast.error("Credits must be >= 0"); return; }

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
        const data = await res.json().catch(() => ({})) as { error?: string };
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
            p.code === pack.code ? { ...p, [field]: !pack[field] } : p
          )
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

  return (
    <>
      {/* ── Header row ── */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-800 tracking-tight text-[var(--color-on-surface)]">
            Credit pack catalog
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-outline-variant)]">
            {packs.length} packs — including inactive
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={reloadPacks}
            disabled={isPending}
            className="rounded-xl text-[var(--color-outline-variant)] hover:text-[var(--color-on-surface)]"
          >
            <RefreshCw className={`size-4 ${isPending ? "animate-spin" : ""}`} />
          </Button>
          <Button
            onClick={openAdd}
            className="rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)] font-600 text-white hover:opacity-90"
          >
            <Plus className="size-4" />
            Add new pack
          </Button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="rounded-2xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-low)]">
                {["Sort", "Code", "Name", "Credits", "Bonus", "Price (₹)", "Per credit", "Active", "Popular", ""].map(
                  (col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)] whitespace-nowrap"
                    >
                      {col}
                    </th>
                  )
                )}
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
                    className={`border-b border-[var(--color-outline-variant)]/10 transition-colors hover:bg-[var(--color-surface-container-low)]/50 ${
                      !pack.is_active ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-[var(--color-outline-variant)] font-500">
                      {pack.sort_order}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-700 text-[var(--color-on-surface)] bg-[var(--color-surface-container-low)] px-2 py-0.5 rounded-md">
                        {pack.code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-600 text-[var(--color-on-surface)]">
                        {pack.display_name}
                      </p>
                      {pack.marketing_tagline && (
                        <p className="text-xs text-[var(--color-outline-variant)] truncate max-w-[140px]">
                          {pack.marketing_tagline}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-700 text-[var(--color-on-surface)]">
                      {pack.credits.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-outline-variant)] font-500">
                      {pack.bonus_credits > 0 ? `+${pack.bonus_credits}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-700 text-[var(--color-on-surface)]">
                      {formatINR(pack.price_paise)}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-outline-variant)] font-500">
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
                          <CheckCircle2 className="size-4 text-green-500" />
                        ) : (
                          <XCircle className="size-4 text-[var(--color-outline-variant)]" />
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
                              ? "fill-[var(--color-accent-gold)] text-[var(--color-accent-gold)]"
                              : "text-[var(--color-outline-variant)]"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => openEdit(pack)}
                          className="rounded-lg text-[var(--color-outline-variant)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)]"
                          title="Edit pack"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setDeleteTarget(pack)}
                          className="rounded-lg text-[var(--color-outline-variant)] hover:text-red-500 hover:bg-red-50"
                          title="Deactivate pack"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {packs.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Package className="size-8 text-[var(--color-outline-variant)]" />
                      <p className="text-sm text-[var(--color-outline-variant)]">
                        No packs yet. Add one above.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add / Edit modal ── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-xl rounded-2xl border-[var(--color-outline-variant)]/15">
          <DialogHeader>
            <DialogTitle className="text-lg font-700 text-[var(--color-on-surface)]">
              {editingPack ? `Edit pack — ${editingPack.code}` : "Add new pack"}
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--color-outline-variant)]">
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
            <Button
              variant="ghost"
              onClick={() => setModalOpen(false)}
              disabled={formPending}
              className="rounded-xl text-[var(--color-outline-variant)]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={formPending}
              className="rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)] font-600 text-white hover:opacity-90"
            >
              {formPending ? (
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white inline-block" />
              ) : null}
              {editingPack ? "Save changes" : "Create pack"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm modal ── */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-sm rounded-2xl border-[var(--color-outline-variant)]/15">
          <DialogHeader>
            <DialogTitle className="text-lg font-700 text-[var(--color-on-surface)]">
              Deactivate pack?
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--color-outline-variant)]">
              Pack{" "}
              <span className="font-mono font-700 text-[var(--color-on-surface)]">
                {deleteTarget?.code}
              </span>{" "}
              will be set to inactive. Brands won&apos;t be able to purchase it. Existing
              purchases are unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deletePending}
              className="rounded-xl text-[var(--color-outline-variant)]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deletePending}
              className="rounded-xl bg-red-500 text-white hover:bg-red-600 font-600"
            >
              {deletePending ? (
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white inline-block" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
