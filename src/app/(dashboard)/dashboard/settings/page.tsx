"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Save, Loader2, LogOut, Trash2, CheckCircle2, AlertCircle, Camera,
  AtSign, User as UserIcon, Building2, Lock, ShieldAlert, Mail, Phone,
  Globe, Briefcase, HelpCircle,
} from "lucide-react";

const INDUSTRIES = [
  "Fashion & Apparel", "Beauty & Cosmetics", "Food & Beverage", "Health & Fitness",
  "Technology", "Finance", "Education", "Real Estate", "Entertainment",
  "Travel & Hospitality", "E-commerce", "Other",
] as const;

interface UserProfile { display_name: string; email: string; phone: string; avatar_url: string; }
interface CreatorProfile { instagram_handle: string; bio: string; }
interface BrandProfile { company_name: string; website_url: string; gst_number: string; industry: string; }

const BIO_MAX = 250;
const SECTIONS = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "identity", label: "Identity", icon: AtSign },
  { id: "security", label: "Account & Security", icon: Lock },
  { id: "danger", label: "Danger Zone", icon: ShieldAlert },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const isValidUrl = (v: string) => {
  if (!v) return true;
  try { return new URL(v.startsWith("http") ? v : `https://${v}`).hostname.includes("."); }
  catch { return false; }
};
const isValidHandle = (v: string) => !v || /^[A-Za-z0-9._]{1,30}$/.test(v);

export default function SettingsPage() {
  const { user, isLoading: authLoading, refreshUser } = useAuth();
  const router = useRouter();

  const [role, setRole] = useState<string>("creator");
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("profile");
  const [isDragging, setIsDragging] = useState(false);

  const [up, setUp] = useState<UserProfile>({ display_name: "", email: "", phone: "", avatar_url: "" });
  const [cp, setCp] = useState<CreatorProfile>({ instagram_handle: "", bio: "" });
  const [bp, setBp] = useState<BrandProfile>({ company_name: "", website_url: "", gst_number: "", industry: "" });

  const baselineRef = useRef<{ user: UserProfile; creator: CreatorProfile; brand: BrandProfile } | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data = await res.json();
      const r = data.role ?? "creator";
      const nu: UserProfile = {
        display_name: data.profile?.display_name ?? "",
        email: data.profile?.email ?? user.email ?? "",
        phone: data.profile?.phone ?? "",
        avatar_url: data.profile?.avatar_url ?? "",
      };
      const nc: CreatorProfile = { instagram_handle: data.creator?.instagram_handle ?? "", bio: data.creator?.bio ?? "" };
      const nb: BrandProfile = {
        company_name: data.brand?.company_name ?? "", website_url: data.brand?.website_url ?? "",
        gst_number: data.brand?.gst_number ?? "", industry: data.brand?.industry ?? "",
      };
      setRole(r); setUp(nu); setCp(nc); setBp(nb);
      baselineRef.current = { user: nu, creator: nc, brand: nb };
    } catch (err) { console.error("Settings fetch error:", err); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { if (!authLoading) fetchProfile(); }, [authLoading, fetchProfile]);

  const isDirty = useMemo(() => {
    const b = baselineRef.current;
    if (!b) return false;
    if (b.user.display_name !== up.display_name) return true;
    if (role === "creator") return b.creator.instagram_handle !== cp.instagram_handle || b.creator.bio !== cp.bio;
    if (role === "brand") return b.brand.company_name !== bp.company_name || b.brand.website_url !== bp.website_url || b.brand.industry !== bp.industry;
    return false;
  }, [up, cp, bp, role]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!up.display_name.trim()) e.display_name = "Required";
    if (role === "creator" && !isValidHandle(cp.instagram_handle)) e.instagram_handle = "Letters, numbers, dots, underscores only";
    if (role === "brand" && !isValidUrl(bp.website_url)) e.website_url = "Enter a valid URL";
    return e;
  }, [up, cp, bp, role]);

  const canSave = isDirty && Object.keys(errors).length === 0 && !isSaving;
  const flash = (kind: "success" | "error", msg?: string) => {
    setSaveStatus(kind);
    if (msg) setSaveError(msg);
    setTimeout(() => setSaveStatus("idle"), kind === "success" ? 2400 : 3500);
  };

  async function handleSave() {
    if (!user || !canSave) return;
    setIsSaving(true); setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        profile: { display_name: up.display_name.trim(), phone: up.phone.trim() },
      };
      if (role === "creator") body.creator = { instagram_handle: cp.instagram_handle.trim(), bio: cp.bio.trim() };
      else if (role === "brand") body.brand = { company_name: bp.company_name.trim(), website_url: bp.website_url.trim(), industry: bp.industry };
      const res = await fetch("/api/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
      await refreshUser();
      baselineRef.current = { user: up, creator: cp, brand: bp };
      flash("success");
    } catch (err) {
      flash("error", err instanceof Error ? err.message : "Something went wrong");
    } finally { setIsSaving(false); }
  }

  async function uploadAvatarFile(file: File) {
    if (!file.type.startsWith("image/")) return flash("error", "Please pick an image file");
    if (file.size > 5 * 1024 * 1024) return flash("error", "Image must be under 5 MB");
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/settings/avatar", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setUp((p) => ({ ...p, avatar_url: data.avatar_url }));
      if (baselineRef.current) {
        baselineRef.current = { ...baselineRef.current, user: { ...baselineRef.current.user, avatar_url: data.avatar_url } };
      }
      await refreshUser();
      flash("success");
    } catch (err) { flash("error", err instanceof Error ? err.message : "Upload failed"); }
    finally { setAvatarUploading(false); }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") return;
    setIsDeleting(true);
    try {
      const res = await fetch("/api/auth/delete-account", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Delete failed");
      router.push("/"); router.refresh();
    } catch (err) { console.error("Delete error:", err); setIsDeleting(false); }
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    try { await fetch("/api/auth/sign-out", { method: "POST" }); router.push("/"); router.refresh(); }
    catch { setIsSigningOut(false); }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  const initial = up.display_name?.charAt(0)?.toUpperCase() || up.email?.charAt(0)?.toUpperCase() || "?";
  const eyebrow = role === "brand" ? "Brand workspace" : role === "admin" ? "Admin workspace" : "Creator workspace";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-8 lg:py-8 pb-32"
    >
      {/* Hero header */}
      <div className="mb-8">
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">{eyebrow}</p>
        <h1 className="mt-1 font-display text-[28px] font-800 leading-[1.1] tracking-tight text-[var(--color-foreground)] sm:text-[34px]">
          Account settings
        </h1>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
          Manage how you appear on Faiceoff — your public identity, contact details, and account preferences.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        {/* Section nav */}
        <nav className="sticky top-6 hidden h-fit lg:block">
          <ul className="space-y-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = activeSection === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSection(s.id);
                      document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-600 transition-all ${
                      isActive
                        ? "bg-[var(--color-secondary)] text-[var(--color-foreground)]"
                        : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)]/60 hover:text-[var(--color-foreground)]"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${isActive ? (s.id === "danger" ? "text-red-500" : "text-[var(--color-primary)]") : ""}`} />
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Content */}
        <div className="space-y-6">
          {/* Profile */}
          <Section id="section-profile" title="Profile" subtitle="Your photo and display name — visible across the marketplace.">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <label
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault(); setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void uploadAvatarFile(file);
                }}
                className={`group relative block shrink-0 cursor-pointer self-start rounded-full ring-2 ring-offset-2 ring-offset-[var(--color-card)] transition-all ${
                  isDragging ? "ring-[var(--color-primary)]" : "ring-[var(--color-border)] hover:ring-[var(--color-primary)]/40"
                }`}
              >
                <input
                  type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarUploading} className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) await uploadAvatarFile(f);
                    e.target.value = "";
                  }}
                />
                <div className="flex size-24 items-center justify-center overflow-hidden rounded-full bg-[var(--color-secondary)]">
                  {avatarUploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
                  ) : up.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async" src={up.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-display text-[26px] font-800 text-[var(--color-foreground)]">{initial}</span>
                  )}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 flex size-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm transition-transform group-hover:scale-110">
                  <Camera className="h-3.5 w-3.5" />
                </div>
              </label>

              <div className="flex-1 space-y-4">
                <Field label="Display name" hint="Shown on your invoices and creator card." error={errors.display_name}>
                  <input
                    type="text" value={up.display_name} maxLength={60} placeholder="Your name"
                    onChange={(e) => setUp((p) => ({ ...p, display_name: e.target.value }))}
                    className={inputCls(!!errors.display_name)}
                  />
                </Field>
                <p className="text-[11px] text-[var(--color-muted-foreground)]">
                  Drag and drop a photo onto the avatar, or click to upload — JPG / PNG / WebP, max 5 MB.
                </p>
              </div>
            </div>
          </Section>

          {/* Identity */}
          <Section
            id="section-identity"
            title={role === "brand" ? "Brand details" : "Creator identity"}
            subtitle={
              role === "brand"
                ? "Public-facing brand information used on requests and licences."
                : "How brands find and recognise you on Faiceoff."
            }
          >
            {role === "creator" && (
              <div className="space-y-5">
                <Field label="Instagram handle" hint="Without the @ — we display it on your creator card." error={errors.instagram_handle}>
                  <IconInput
                    icon={AtSign} hasError={!!errors.instagram_handle} maxLength={30} placeholder="yourhandle"
                    value={cp.instagram_handle}
                    onChange={(v) => setCp((p) => ({ ...p, instagram_handle: v.replace(/^@/, "").trim() }))}
                  />
                </Field>
                <Field label="Short bio" hint="Tell brands about your style and the kind of work you take on.">
                  <textarea
                    value={cp.bio}
                    onChange={(e) => { if (e.target.value.length <= BIO_MAX) setCp((p) => ({ ...p, bio: e.target.value })); }}
                    placeholder="I'm a fashion creator focusing on streetwear and editorial moods…"
                    rows={4}
                    className={`${inputCls(false)} h-auto resize-none py-3 leading-relaxed`}
                  />
                  <div className="mt-1.5 flex justify-end">
                    <span className="font-mono text-[10px] text-[var(--color-muted-foreground)]">{cp.bio.length}/{BIO_MAX}</span>
                  </div>
                </Field>
              </div>
            )}

            {role === "brand" && (
              <div className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Company name">
                    <IconInput
                      icon={Building2} maxLength={80} placeholder="Acme Inc."
                      value={bp.company_name}
                      onChange={(v) => setBp((p) => ({ ...p, company_name: v }))}
                    />
                  </Field>
                  <Field label="Website URL" error={errors.website_url}>
                    <IconInput
                      icon={Globe} hasError={!!errors.website_url} placeholder="https://yourcompany.com" type="url"
                      value={bp.website_url}
                      onChange={(v) => setBp((p) => ({ ...p, website_url: v }))}
                    />
                  </Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Industry" hint="Helps creators evaluate brand fit.">
                    <div className="relative">
                      <Briefcase className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
                      <select
                        value={bp.industry}
                        onChange={(e) => setBp((p) => ({ ...p, industry: e.target.value }))}
                        className={`${inputCls(false)} pl-9 appearance-none`}
                      >
                        <option value="">Select industry</option>
                        {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                      </select>
                    </div>
                  </Field>
                  <Field label="GST number" hint="Linked at signup. Contact support to update.">
                    <IconInput
                      icon={Lock} disabled value={bp.gst_number || "Not provided"} onChange={() => {}}
                    />
                  </Field>
                </div>
              </div>
            )}

            {role !== "brand" && role !== "creator" && (
              <p className="text-[13px] text-[var(--color-muted-foreground)]">No additional identity fields for your role.</p>
            )}
          </Section>

          {/* Account & Security */}
          <Section id="section-security" title="Account & security" subtitle="Login credentials and contact information — changes here require support.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Email address" hint="Used for login and notifications.">
                <IconInput icon={Mail} disabled value={up.email} onChange={() => {}} type="email" />
              </Field>
              <Field label="Phone number" hint={up.phone ? "Linked at signup." : "Not linked yet."}>
                <IconInput icon={Phone} disabled value={up.phone || "—"} onChange={() => {}} type="tel" />
              </Field>
            </div>

            <InfoRow
              icon={HelpCircle}
              title="Need to change email or phone?"
              description={
                <>
                  For security, our team handles these manually. Reply to any Faiceoff email or write to{" "}
                  <span className="font-600 text-[var(--color-foreground)]">support@faiceoff.com</span>.
                </>
              }
              action={
                <a
                  href="mailto:support@faiceoff.com?subject=Update%20account%20details"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[12px] font-700 text-[var(--color-foreground)] transition hover:border-[var(--color-primary)]/40 hover:text-[var(--color-primary)]"
                >
                  Contact support
                </a>
              }
              tone="muted"
            />

            <InfoRow
              icon={LogOut}
              title="Sign out of this device"
              description="You'll need to verify with an OTP next time you log in."
              action={
                <button
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[12px] font-700 text-[var(--color-foreground)] transition hover:border-[var(--color-primary)]/40 hover:text-[var(--color-primary)] disabled:opacity-50"
                >
                  {isSigningOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                  {isSigningOut ? "Signing out…" : "Sign out"}
                </button>
              }
            />
          </Section>

          {/* Danger zone */}
          <section id="section-danger" className="rounded-2xl border border-red-500/25 bg-[var(--color-card)] p-5 sm:p-6">
            <div className="mb-4 flex items-start gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-display text-[16px] font-700 text-red-500">Danger zone</h2>
                <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
                  Permanently remove your account and all associated data. This cannot be undone.
                </p>
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {!showDeleteConfirm ? (
                <motion.button
                  key="delete-btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-transparent px-3 py-2 text-[12px] font-700 text-red-500 transition hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete account
                </motion.button>
              ) : (
                <motion.div
                  key="delete-confirm" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <p className="text-[12px] text-[var(--color-muted-foreground)]">
                    Type <span className="font-mono font-700 text-red-500">DELETE</span> to confirm — your wallet balance, generations, licences, and earnings history will be wiped.
                  </p>
                  <input
                    type="text" value={deleteConfirmText} placeholder="DELETE" autoFocus
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="mt-3 h-10 w-full max-w-[280px] rounded-lg border border-red-500/30 bg-transparent px-3 font-mono text-[13px] font-700 text-red-500 outline-none placeholder:text-red-500/30 focus:ring-2 focus:ring-red-500/20"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                      disabled={isDeleting}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[12px] font-700 text-[var(--color-foreground)] transition hover:border-[var(--color-primary)]/40 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== "DELETE" || isDeleting}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-[12px] font-700 text-white transition hover:bg-red-600 disabled:opacity-40"
                    >
                      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      {isDeleting ? "Deleting…" : "Permanently delete"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </div>

      {/* Sticky save bar */}
      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-4 left-1/2 z-40 w-[min(680px,calc(100%-1.5rem))] -translate-x-1/2"
          >
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 shadow-[0_12px_36px_-12px_rgba(0,0,0,0.45)] backdrop-blur-md">
              <div className="flex min-w-0 items-center gap-2">
                {saveStatus === "success" ? (
                  <span className="flex items-center gap-1.5 text-[12px] font-700 text-emerald-500">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                  </span>
                ) : saveStatus === "error" ? (
                  <span className="flex items-center gap-1.5 text-[12px] font-700 text-red-500">
                    <AlertCircle className="h-3.5 w-3.5" /> {saveError || "Failed to save"}
                  </span>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-primary)] opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-primary)]" />
                    </span>
                    <p className="truncate text-[12px] font-600 text-[var(--color-foreground)]">Unsaved changes</p>
                  </>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => {
                    if (!baselineRef.current) return;
                    setUp(baselineRef.current.user); setCp(baselineRef.current.creator); setBp(baselineRef.current.brand);
                  }}
                  disabled={isSaving}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-700 text-[var(--color-foreground)] transition hover:border-[var(--color-primary)]/40 disabled:opacity-50"
                >
                  Reset
                </button>
                <button
                  onClick={handleSave} disabled={!canSave}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3.5 py-1.5 text-[12px] font-700 text-[var(--color-primary-foreground)] transition hover:-translate-y-0.5 hover:shadow-[0_4px_14px_-4px_rgba(201,169,110,0.55)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {isSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Reusable bits ── */
function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="font-display text-[16px] font-700 text-[var(--color-foreground)]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">{label}</label>
        {error && <span className="text-[11px] font-600 text-red-500">{error}</span>}
      </div>
      {children}
      {hint && !error && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">{hint}</p>
      )}
    </div>
  );
}

function IconInput({
  icon: Icon, value, onChange, placeholder, maxLength, type = "text", disabled = false, hasError = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string; maxLength?: number; type?: string; disabled?: boolean; hasError?: boolean;
}) {
  return (
    <div className="relative">
      <Icon className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
      <input
        type={type} value={value} placeholder={placeholder} maxLength={maxLength} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls(hasError)} pl-9 ${disabled ? "cursor-not-allowed bg-[var(--color-secondary)]/40 text-[var(--color-muted-foreground)]" : ""}`}
      />
    </div>
  );
}

function InfoRow({
  icon: Icon, title, description, action, tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: React.ReactNode;
  action: React.ReactNode;
  tone?: "default" | "muted";
}) {
  return (
    <div
      className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] p-4 ${
        tone === "muted" ? "bg-[var(--color-secondary)]/40" : "bg-[var(--color-card)]"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
        <div>
          <p className="text-[13px] font-700 text-[var(--color-foreground)]">{title}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function inputCls(hasError: boolean): string {
  return [
    "h-10 w-full rounded-lg border bg-[var(--color-card)] px-3 text-[13px] font-500 text-[var(--color-foreground)]",
    "outline-none transition-all placeholder:text-[var(--color-muted-foreground)]/60",
    "focus:ring-2",
    hasError
      ? "border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20"
      : "border-[var(--color-border)] focus:border-[var(--color-primary)]/50 focus:ring-[var(--color-primary)]/15",
  ].join(" ");
}
