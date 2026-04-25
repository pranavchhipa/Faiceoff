"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Save,
  Loader2,
  LogOut,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Camera,
  Fingerprint,
  Eye,
  Lock,
  AtSign,
} from "lucide-react";

/* ── Industry options for brands ── */
const INDUSTRIES = [
  "Fashion & Apparel",
  "Beauty & Cosmetics",
  "Food & Beverage",
  "Health & Fitness",
  "Technology",
  "Finance",
  "Education",
  "Real Estate",
  "Entertainment",
  "Travel & Hospitality",
  "E-commerce",
  "Other",
] as const;

/* ── Types ── */
interface UserProfile {
  display_name: string;
  email: string;
  phone: string;
  avatar_url: string;
}

interface CreatorProfile {
  instagram_handle: string;
  bio: string;
}

interface BrandProfile {
  company_name: string;
  website_url: string;
  gst_number: string;
  industry: string;
}

const BIO_MAX = 250;

/* ── Page Component ── */
export default function SettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [role, setRole] = useState<string>("creator");
  const [profileLoading, setProfileLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const [userProfile, setUserProfile] = useState<UserProfile>({
    display_name: "",
    email: "",
    phone: "",
    avatar_url: "",
  });

  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile>({
    instagram_handle: "",
    bio: "",
  });

  const [brandProfile, setBrandProfile] = useState<BrandProfile>({
    company_name: "",
    website_url: "",
    gst_number: "",
    industry: "",
  });

  /* ── Fetch ── */
  const fetchProfile = useCallback(async () => {
    if (!user) return;
    setProfileLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) { setProfileLoading(false); return; }
      const data = await res.json();
      setRole(data.role ?? "creator");
      if (data.profile) {
        setUserProfile({
          display_name: data.profile.display_name ?? "",
          email: data.profile.email ?? user.email ?? "",
          phone: data.profile.phone ?? "",
          avatar_url: data.profile.avatar_url ?? "",
        });
      }
      if (data.creator) {
        setCreatorProfile({
          instagram_handle: data.creator.instagram_handle ?? "",
          bio: data.creator.bio ?? "",
        });
      }
      if (data.brand) {
        setBrandProfile({
          company_name: data.brand.company_name ?? "",
          website_url: data.brand.website_url ?? "",
          gst_number: data.brand.gst_number ?? "",
          industry: data.brand.industry ?? "",
        });
      }
    } catch (err) {
      console.error("Settings fetch error:", err);
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) fetchProfile();
  }, [authLoading, fetchProfile]);

  /* ── Save ── */
  async function handleSave() {
    if (!user) return;
    setIsSaving(true);
    setSaveStatus("idle");
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        profile: {
          display_name: userProfile.display_name.trim(),
          phone: userProfile.phone.trim(),
        },
      };
      if (role === "creator") {
        body.creator = {
          instagram_handle: creatorProfile.instagram_handle.trim(),
          bio: creatorProfile.bio.trim(),
        };
      } else if (role === "brand") {
        body.brand = {
          company_name: brandProfile.company_name.trim(),
          website_url: brandProfile.website_url.trim(),
          industry: brandProfile.industry,
        };
      }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Save failed");
      }
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSaving(false);
    }
  }

  /* ── Avatar upload ── */
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      setSaveStatus("error");
      setSaveError("Image must be under 5MB");
      return;
    }
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/settings/avatar", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setUserProfile((prev) => ({ ...prev, avatar_url: data.avatar_url }));
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  }

  /* ── Delete account ── */
  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") return;
    setIsDeleting(true);
    try {
      const res = await fetch("/api/auth/delete-account", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Delete failed");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("Delete error:", err);
      setIsDeleting(false);
    }
  }

  /* ── Sign out ── */
  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
      router.push("/");
      router.refresh();
    } catch {
      setIsSigningOut(false);
    }
  }

  /* ── Loading ── */
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-muted-foreground)]/30 border-t-[var(--color-primary)]" />
      </div>
    );
  }

  const ghostBorder = { border: "1px solid rgba(171,173,174,0.18)" } as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="max-w-5xl"
    >
      {/* ══════════ Page Header ══════════ */}
      <div className="mb-6">
        <h1 className="text-3xl font-700 tracking-tight text-[var(--color-foreground)]">
          Account Settings
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Manage your profile and security preferences.
        </p>
      </div>

      {profileLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="size-5 animate-spin rounded-full border-2 border-[var(--color-muted-foreground)]/30 border-t-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="space-y-5">

          {/* ══════════════════════════════════════════════════
             1. Profile Card — Avatar + Display Name + Email
             ══════════════════════════════════════════════════ */}
          <section
            className="rounded-2xl bg-[var(--color-card)] p-6 lg:p-8"
            style={ghostBorder}
          >
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              {/* Avatar */}
              <label className="group relative cursor-pointer shrink-0 self-start">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarUpload}
                  className="hidden"
                  disabled={avatarUploading}
                />
                <div className="flex size-20 items-center justify-center rounded-full bg-[var(--color-lilac)] overflow-hidden">
                  {avatarUploading ? (
                    <Loader2 className="size-6 animate-spin text-[var(--color-muted-foreground)]" />
                  ) : userProfile.avatar_url ? (
                    <img src={userProfile.avatar_url} alt="Avatar" className="size-full object-cover" />
                  ) : (
                    <span className="text-2xl font-700 text-[var(--color-foreground)]">
                      {userProfile.display_name?.charAt(0)?.toUpperCase() || "?"}
                    </span>
                  )}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)] text-white shadow-sm transition-transform group-hover:scale-110">
                  <Camera className="size-3.5" />
                </div>
              </label>

              {/* Name + Email inline */}
              <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:gap-5">
                {/* Display Name */}
                <div className="flex-1">
                  <p className="mb-1.5 text-[10px] font-700 uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                    Display Name
                  </p>
                  <input
                    type="text"
                    value={userProfile.display_name}
                    onChange={(e) =>
                      setUserProfile((prev) => ({ ...prev, display_name: e.target.value }))
                    }
                    placeholder="Your name"
                    className="h-11 w-full rounded-xl bg-[var(--color-secondary)] px-4 text-[15px] font-500 text-[var(--color-foreground)] outline-none transition-all placeholder:text-[var(--color-muted-foreground)] focus:bg-[var(--color-card)] focus:ring-1 focus:ring-[var(--color-primary)]"
                    style={{ border: "none" }}
                  />
                </div>

                {/* Email (read-only) */}
                <div className="flex-1">
                  <p className="mb-1.5 text-[10px] font-700 uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                    Email Address
                  </p>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
                    <input
                      type="email"
                      value={userProfile.email}
                      disabled
                      className="h-11 w-full rounded-xl bg-[var(--color-muted)] px-4 pl-9 text-[15px] font-500 text-[var(--color-muted-foreground)] outline-none"
                      style={{ border: "none" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════
             2. Creator: Creative Identity + Status Card
             ══════════════════════════════════════════════════ */}
          {role === "creator" && (
            <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
              {/* Creative Identity */}
              <section
                className="rounded-2xl bg-[var(--color-card)] p-6 lg:p-8"
                style={ghostBorder}
              >
                <div className="mb-6 flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-lilac)]">
                    <Fingerprint className="size-4 text-[var(--color-primary)]" />
                  </div>
                  <h2 className="text-lg font-700 text-[var(--color-foreground)]">Creative Identity</h2>
                </div>

                <div className="space-y-5">
                  {/* Instagram */}
                  <div>
                    <p className="mb-1.5 text-[10px] font-700 uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                      Instagram Handle
                    </p>
                    <div className="relative">
                      <AtSign className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
                      <input
                        type="text"
                        value={creatorProfile.instagram_handle}
                        onChange={(e) =>
                          setCreatorProfile((prev) => ({
                            ...prev,
                            instagram_handle: e.target.value.replace(/^@/, ""),
                          }))
                        }
                        placeholder="yourhandle"
                        className="h-11 w-full rounded-xl bg-[var(--color-secondary)] px-4 pl-10 text-[15px] font-500 text-[var(--color-foreground)] outline-none transition-all placeholder:text-[var(--color-muted-foreground)] focus:bg-[var(--color-card)] focus:ring-1 focus:ring-[var(--color-primary)]"
                        style={{ border: "none" }}
                      />
                    </div>
                  </div>

                  {/* Bio */}
                  <div>
                    <p className="mb-1.5 text-[10px] font-700 uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                      Short Bio
                    </p>
                    <textarea
                      value={creatorProfile.bio}
                      onChange={(e) => {
                        if (e.target.value.length <= BIO_MAX) {
                          setCreatorProfile((prev) => ({ ...prev, bio: e.target.value }));
                        }
                      }}
                      placeholder="Tell brands about yourself and your content style..."
                      rows={4}
                      className="w-full rounded-xl bg-[var(--color-secondary)] px-4 py-3 text-[15px] font-500 text-[var(--color-foreground)] outline-none transition-all placeholder:text-[var(--color-muted-foreground)] focus:bg-[var(--color-card)] focus:ring-1 focus:ring-[var(--color-primary)] resize-none leading-relaxed"
                      style={{ border: "none" }}
                    />
                    <p className="mt-1.5 text-right text-[11px] text-[var(--color-muted-foreground)]">
                      {creatorProfile.bio.length}/{BIO_MAX} characters
                    </p>
                  </div>
                </div>
              </section>

              {/* Status Card */}
              <section
                className="flex flex-col items-center justify-center rounded-2xl bg-[var(--color-card)] p-6 text-center"
                style={ghostBorder}
              >
                <div className="flex size-12 items-center justify-center rounded-2xl bg-[var(--color-mint)]">
                  <CheckCircle2 className="size-6 text-[#1a6b3c]" />
                </div>
                <h3 className="mt-4 text-base font-700 text-[var(--color-foreground)]">
                  Verified Creator
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
                  Your profile is currently featured in the marketplace. Keep your bio updated to maintain conversion rates.
                </p>
                <button
                  className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-600 text-[var(--color-primary)] transition-all hover:bg-[var(--color-lilac)]"
                  style={ghostBorder}
                >
                  <Eye className="size-4" />
                  View Public Profile
                </button>
              </section>
            </div>
          )}

          {/* ══════════════════════════════════════════════════
             2b. Brand-specific fields
             ══════════════════════════════════════════════════ */}
          {role === "brand" && (
            <section
              className="rounded-2xl bg-[var(--color-card)] p-6 lg:p-8"
              style={ghostBorder}
            >
              <div className="mb-6 flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-ocean)]">
                  <Fingerprint className="size-4 text-[#2a5a8c]" />
                </div>
                <h2 className="text-lg font-700 text-[var(--color-foreground)]">Brand Profile</h2>
              </div>

              <div className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-[10px] font-700 uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                      Company Name
                    </p>
                    <input
                      type="text"
                      value={brandProfile.company_name}
                      onChange={(e) =>
                        setBrandProfile((prev) => ({ ...prev, company_name: e.target.value }))
                      }
                      placeholder="Acme Inc."
                      className="h-11 w-full rounded-xl bg-[var(--color-secondary)] px-4 text-[15px] font-500 text-[var(--color-foreground)] outline-none transition-all placeholder:text-[var(--color-muted-foreground)] focus:bg-[var(--color-card)] focus:ring-1 focus:ring-[var(--color-primary)]"
                      style={{ border: "none" }}
                    />
                  </div>

                  <div>
                    <p className="mb-1.5 text-[10px] font-700 uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                      Website URL
                    </p>
                    <input
                      type="url"
                      value={brandProfile.website_url}
                      onChange={(e) =>
                        setBrandProfile((prev) => ({ ...prev, website_url: e.target.value }))
                      }
                      placeholder="https://yourcompany.com"
                      className="h-11 w-full rounded-xl bg-[var(--color-secondary)] px-4 text-[15px] font-500 text-[var(--color-foreground)] outline-none transition-all placeholder:text-[var(--color-muted-foreground)] focus:bg-[var(--color-card)] focus:ring-1 focus:ring-[var(--color-primary)]"
                      style={{ border: "none" }}
                    />
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-[10px] font-700 uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                      GST Number <span className="normal-case text-[var(--color-muted-foreground)]">(read-only)</span>
                    </p>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
                      <input
                        type="text"
                        value={brandProfile.gst_number || "Not provided"}
                        disabled
                        className="h-11 w-full rounded-xl bg-[var(--color-muted)] px-4 pl-9 text-[15px] font-500 text-[var(--color-muted-foreground)] outline-none"
                        style={{ border: "none" }}
                      />
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-[10px] font-700 uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                      Industry
                    </p>
                    <select
                      value={brandProfile.industry}
                      onChange={(e) =>
                        setBrandProfile((prev) => ({ ...prev, industry: e.target.value }))
                      }
                      className="h-11 w-full rounded-xl bg-[var(--color-secondary)] px-4 text-[15px] font-500 text-[var(--color-foreground)] outline-none transition-all focus:bg-[var(--color-card)] focus:ring-1 focus:ring-[var(--color-primary)]"
                      style={{ border: "none" }}
                    >
                      <option value="">Select your industry</option>
                      {INDUSTRIES.map((ind) => (
                        <option key={ind} value={ind}>{ind}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ══════════════════════════════════════════════════
             3. Save Bar
             ══════════════════════════════════════════════════ */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-[var(--color-card)] px-4 py-4 sm:px-6" style={ghostBorder}>
            <div className="flex items-center gap-2 min-w-0">
              {saveStatus === "success" ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2 text-sm font-500 text-[#1a6b3c]"
                >
                  <CheckCircle2 className="size-4" />
                  Changes saved successfully
                </motion.div>
              ) : saveStatus === "error" ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2 text-sm font-500 text-red-500"
                >
                  <AlertCircle className="size-4" />
                  {saveError || "Failed to save"}
                </motion.div>
              ) : (
                <p className="text-[13px] text-[var(--color-muted-foreground)]">
                  Unsaved changes will be lost if you leave this page.
                </p>
              )}
            </div>

            <button
              onClick={handleSave}
              disabled={isSaving || !userProfile.display_name.trim()}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-container)] px-6 py-2.5 text-sm font-600 text-white transition-all hover:shadow-[0_4px_16px_rgba(106,28,246,0.3)] disabled:opacity-50 w-full sm:w-auto"
            >
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {isSaving ? "Saving..." : "Save all changes"}
            </button>
          </div>

          {/* ══════════════════════════════════════════════════
             4. Session Control + Danger Zone (side by side)
             ══════════════════════════════════════════════════ */}
          <div className="grid gap-5 sm:grid-cols-2">
            {/* Session Control */}
            <section
              className="rounded-2xl bg-[var(--color-card)] p-6"
              style={ghostBorder}
            >
              <h3 className="text-base font-700 text-[var(--color-foreground)]">Session Control</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
                Sign out from your current device. Your creator dashboard will be locked until you log in again.
              </p>
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="mt-5 inline-flex items-center gap-2 text-sm font-600 text-[var(--color-foreground)] transition-colors hover:text-[var(--color-primary)] disabled:opacity-50"
              >
                <LogOut className="size-4" />
                {isSigningOut ? "Signing out..." : "Sign out of Faiceoff"}
              </button>
            </section>

            {/* Danger Zone */}
            <section
              className="rounded-2xl bg-[var(--color-card)] p-6"
              style={{ border: "1px solid rgba(180,19,64,0.12)" }}
            >
              <h3 className="text-base font-700 text-red-600">Danger Zone</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
                Deleting your account will permanently remove all models, earnings history, and marketplace listings. This action is irreversible.
              </p>

              <AnimatePresence mode="wait">
                {!showDeleteConfirm ? (
                  <motion.button
                    key="delete-btn"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowDeleteConfirm(true)}
                    className="mt-5 inline-flex items-center gap-2 text-sm font-600 text-red-500 transition-colors hover:text-red-700"
                  >
                    <Trash2 className="size-4" />
                    Delete account
                  </motion.button>
                ) : (
                  <motion.div
                    key="delete-confirm"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 space-y-3 overflow-hidden"
                  >
                    <p className="text-xs font-600 text-red-500">
                      Type <span className="font-700">DELETE</span> to confirm:
                    </p>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="DELETE"
                      className="h-10 w-full rounded-xl bg-red-50 px-3 text-sm text-red-600 outline-none placeholder:text-red-300 focus:ring-1 focus:ring-red-400"
                      style={{ border: "none" }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                        disabled={isDeleting}
                        className="flex-1 rounded-xl bg-[var(--color-secondary)] py-2 text-xs font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-muted)]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteAccount}
                        disabled={deleteConfirmText !== "DELETE" || isDeleting}
                        className="flex-1 rounded-xl bg-red-500 py-2 text-xs font-600 text-white transition-colors hover:bg-red-600 disabled:opacity-40"
                      >
                        {isDeleting ? "Deleting..." : "Confirm delete"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </div>

          <div className="h-4" />
        </div>
      )}
    </motion.div>
  );
}
