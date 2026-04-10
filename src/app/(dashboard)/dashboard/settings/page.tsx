"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Settings,
  User as UserIcon,
  Save,
  Loader2,
  LogOut,
  Trash2,
  AtSign,
  Building2,
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

/* ── Page Component ── */

export default function SettingsPage() {
  const { user, supabase, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const role = user?.user_metadata?.role ?? "creator";

  /* ── State ── */
  const [profileLoading, setProfileLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

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

  /* ── Fetch profile data ── */
  const fetchProfile = useCallback(async () => {
    if (!user) return;

    setProfileLoading(true);

    // Fetch user row
    const { data: userData } = await supabase
      .from("users")
      .select("display_name, email, phone, avatar_url")
      .eq("id", user.id)
      .single();

    if (userData) {
      setUserProfile({
        display_name: userData.display_name ?? "",
        email: userData.email ?? user.email ?? "",
        phone: userData.phone ?? "",
        avatar_url: userData.avatar_url ?? "",
      });
    } else {
      // Fallback to auth metadata
      setUserProfile({
        display_name:
          user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "",
        email: user.email ?? "",
        phone: user.phone ?? "",
        avatar_url: user.user_metadata?.avatar_url ?? "",
      });
    }

    // Fetch role-specific data
    if (role === "creator") {
      const { data: creatorData } = await supabase
        .from("creators")
        .select("instagram_handle, bio")
        .eq("user_id", user.id)
        .single();

      if (creatorData) {
        setCreatorProfile({
          instagram_handle: creatorData.instagram_handle ?? "",
          bio: creatorData.bio ?? "",
        });
      }
    } else if (role === "brand") {
      const { data: brandData } = await supabase
        .from("brands")
        .select("company_name, website_url, gst_number, industry")
        .eq("user_id", user.id)
        .single();

      if (brandData) {
        setBrandProfile({
          company_name: brandData.company_name ?? "",
          website_url: brandData.website_url ?? "",
          gst_number: brandData.gst_number ?? "",
          industry: brandData.industry ?? "",
        });
      }
    }

    setProfileLoading(false);
  }, [user, role, supabase]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  /* ── Save handler ── */
  async function handleSave() {
    if (!user) return;

    setIsSaving(true);

    try {
      // Update users table
      const { error: userError } = await supabase
        .from("users")
        .update({
          display_name: userProfile.display_name.trim(),
          phone: userProfile.phone.trim() || null,
        })
        .eq("id", user.id);

      if (userError) {
        toast.error("Failed to update profile. Please try again.");
        console.error("User update error:", userError);
        setIsSaving(false);
        return;
      }

      // Update role-specific table
      if (role === "creator") {
        const { error: creatorError } = await supabase
          .from("creators")
          .update({
            instagram_handle:
              creatorProfile.instagram_handle.trim() || null,
            bio: creatorProfile.bio.trim() || null,
          })
          .eq("user_id", user.id);

        if (creatorError) {
          toast.error("Failed to update creator profile.");
          console.error("Creator update error:", creatorError);
          setIsSaving(false);
          return;
        }
      } else if (role === "brand") {
        const { error: brandError } = await supabase
          .from("brands")
          .update({
            company_name: brandProfile.company_name.trim(),
            website_url: brandProfile.website_url.trim() || null,
            industry: brandProfile.industry || null,
          })
          .eq("user_id", user.id);

        if (brandError) {
          toast.error("Failed to update brand profile.");
          console.error("Brand update error:", brandError);
          setIsSaving(false);
          return;
        }
      }

      toast.success("Profile updated successfully!");
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
      console.error("Save error:", err);
    } finally {
      setIsSaving(false);
    }
  }

  /* ── Sign out handler ── */
  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Failed to sign out.");
      setIsSigningOut(false);
    }
  }

  /* ── Loading state ── */
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-gold)]" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mx-auto max-w-2xl"
    >
      {/* ── Page header ── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex size-10 items-center justify-center rounded-[var(--radius-card)] bg-[var(--color-neutral-100)]">
            <Settings className="size-5 text-[var(--color-neutral-600)]" />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-800 tracking-tight text-[var(--color-ink)]">
            Settings
          </h1>
        </div>
        <p className="text-[var(--color-neutral-500)]">
          Manage your profile information and account settings.
        </p>
      </div>

      {/* ── Profile loading ── */}
      {profileLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="size-5 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-gold)]" />
        </div>
      )}

      {!profileLoading && (
        <div className="flex flex-col gap-8">
          {/* ══════════════════════════════════════
             Section: Basic Profile
             ══════════════════════════════════════ */}
          <section className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-6 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex size-9 items-center justify-center rounded-[var(--radius-input)] bg-[var(--color-blush)]/40">
                <UserIcon className="size-4 text-[var(--color-neutral-600)]" />
              </div>
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-lg font-700 text-[var(--color-ink)]">
                  Profile
                </h2>
                <p className="text-xs text-[var(--color-neutral-400)]">
                  Your basic account information
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              {/* Avatar preview */}
              <div className="flex items-center gap-4">
                <div className="flex size-16 items-center justify-center rounded-full bg-[var(--color-neutral-200)] overflow-hidden shrink-0">
                  {userProfile.avatar_url ? (
                    <img
                      src={userProfile.avatar_url}
                      alt="Avatar"
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="text-xl font-700 text-[var(--color-neutral-500)]">
                      {userProfile.display_name?.charAt(0)?.toUpperCase() ||
                        "?"}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-600 text-[var(--color-ink)] truncate">
                    {userProfile.display_name || "No name set"}
                  </p>
                  <p className="text-xs text-[var(--color-neutral-400)] truncate">
                    {userProfile.email}
                  </p>
                  <span className="mt-1 inline-block rounded-[var(--radius-pill)] bg-[var(--color-neutral-100)] px-2.5 py-0.5 text-[10px] font-600 uppercase tracking-wider text-[var(--color-neutral-500)]">
                    {role}
                  </span>
                </div>
              </div>

              <Separator className="bg-[var(--color-neutral-200)]" />

              {/* Display Name */}
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="display-name"
                  className="text-[var(--color-ink)]"
                >
                  Display Name
                </Label>
                <Input
                  id="display-name"
                  type="text"
                  placeholder="Your name"
                  value={userProfile.display_name}
                  onChange={(e) =>
                    setUserProfile((prev) => ({
                      ...prev,
                      display_name: e.target.value,
                    }))
                  }
                  className="rounded-[var(--radius-input)]"
                />
              </div>

              {/* Email (read-only) */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-[var(--color-ink)]">
                  Email{" "}
                  <span className="text-[var(--color-neutral-400)] font-400">
                    (read-only)
                  </span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={userProfile.email}
                  disabled
                  className="rounded-[var(--radius-input)] bg-[var(--color-neutral-50)] text-[var(--color-neutral-500)]"
                />
              </div>

              {/* Phone */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone" className="text-[var(--color-ink)]">
                  Phone
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={userProfile.phone}
                  onChange={(e) =>
                    setUserProfile((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                  className="rounded-[var(--radius-input)]"
                />
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════
             Section: Creator-specific fields
             ══════════════════════════════════════ */}
          {role === "creator" && (
            <section className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-6 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex size-9 items-center justify-center rounded-[var(--radius-input)] bg-[var(--color-lilac)]/40">
                  <AtSign className="size-4 text-[var(--color-neutral-600)]" />
                </div>
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-lg font-700 text-[var(--color-ink)]">
                    Creator Profile
                  </h2>
                  <p className="text-xs text-[var(--color-neutral-400)]">
                    Public details visible to brands
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-5">
                {/* Instagram Handle */}
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="instagram-handle"
                    className="text-[var(--color-ink)]"
                  >
                    Instagram Handle
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-neutral-400)]">
                      @
                    </span>
                    <Input
                      id="instagram-handle"
                      type="text"
                      placeholder="yourhandle"
                      value={creatorProfile.instagram_handle}
                      onChange={(e) =>
                        setCreatorProfile((prev) => ({
                          ...prev,
                          instagram_handle: e.target.value.replace(/^@/, ""),
                        }))
                      }
                      className="rounded-[var(--radius-input)] pl-8"
                    />
                  </div>
                </div>

                {/* Bio */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="bio" className="text-[var(--color-ink)]">
                    Bio
                  </Label>
                  <textarea
                    id="bio"
                    placeholder="Tell brands about yourself..."
                    value={creatorProfile.bio}
                    onChange={(e) =>
                      setCreatorProfile((prev) => ({
                        ...prev,
                        bio: e.target.value,
                      }))
                    }
                    rows={4}
                    className="w-full rounded-[var(--radius-input)] border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 resize-none"
                  />
                  <p className="text-xs text-[var(--color-neutral-400)]">
                    {creatorProfile.bio.length}/500 characters
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* ══════════════════════════════════════
             Section: Brand-specific fields
             ══════════════════════════════════════ */}
          {role === "brand" && (
            <section className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-6 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex size-9 items-center justify-center rounded-[var(--radius-input)] bg-[var(--color-ocean)]/40">
                  <Building2 className="size-4 text-[var(--color-neutral-600)]" />
                </div>
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-lg font-700 text-[var(--color-ink)]">
                    Brand Profile
                  </h2>
                  <p className="text-xs text-[var(--color-neutral-400)]">
                    Company details visible to creators
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-5">
                {/* Company Name */}
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="company-name"
                    className="text-[var(--color-ink)]"
                  >
                    Company Name
                  </Label>
                  <Input
                    id="company-name"
                    type="text"
                    placeholder="Acme Inc."
                    value={brandProfile.company_name}
                    onChange={(e) =>
                      setBrandProfile((prev) => ({
                        ...prev,
                        company_name: e.target.value,
                      }))
                    }
                    className="rounded-[var(--radius-input)]"
                  />
                </div>

                {/* Website URL */}
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="website-url"
                    className="text-[var(--color-ink)]"
                  >
                    Website URL
                  </Label>
                  <Input
                    id="website-url"
                    type="url"
                    placeholder="https://yourcompany.com"
                    value={brandProfile.website_url}
                    onChange={(e) =>
                      setBrandProfile((prev) => ({
                        ...prev,
                        website_url: e.target.value,
                      }))
                    }
                    className="rounded-[var(--radius-input)]"
                  />
                </div>

                {/* GST Number (read-only) */}
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="gst-number"
                    className="text-[var(--color-ink)]"
                  >
                    GST Number{" "}
                    <span className="text-[var(--color-neutral-400)] font-400">
                      (read-only)
                    </span>
                  </Label>
                  <Input
                    id="gst-number"
                    type="text"
                    value={brandProfile.gst_number || "Not provided"}
                    disabled
                    className="rounded-[var(--radius-input)] bg-[var(--color-neutral-50)] text-[var(--color-neutral-500)]"
                  />
                </div>

                {/* Industry */}
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="industry"
                    className="text-[var(--color-ink)]"
                  >
                    Industry
                  </Label>
                  <select
                    id="industry"
                    value={brandProfile.industry}
                    onChange={(e) =>
                      setBrandProfile((prev) => ({
                        ...prev,
                        industry: e.target.value,
                      }))
                    }
                    className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-transparent px-3 py-1 text-sm text-[var(--color-ink)] shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <option value="">Select your industry</option>
                    {INDUSTRIES.map((ind) => (
                      <option key={ind} value={ind}>
                        {ind}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>
          )}

          {/* ══════════════════════════════════════
             Save button
             ══════════════════════════════════════ */}
          <Button
            onClick={handleSave}
            disabled={isSaving || !userProfile.display_name.trim()}
            className="h-11 w-full rounded-[var(--radius-button)] bg-[var(--color-gold)] font-600 text-white hover:bg-[var(--color-gold-hover)] disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="size-4" />
                Save changes
              </>
            )}
          </Button>

          <Separator className="bg-[var(--color-neutral-200)]" />

          {/* ══════════════════════════════════════
             Section: Sign Out
             ══════════════════════════════════════ */}
          <section className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-6 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-base font-700 text-[var(--color-ink)]">
                  Sign out
                </h3>
                <p className="text-sm text-[var(--color-neutral-400)]">
                  Sign out of your Faiceoff account on this device.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="shrink-0 rounded-[var(--radius-button)] font-600"
              >
                {isSigningOut ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Signing out...
                  </>
                ) : (
                  <>
                    <LogOut className="size-4" />
                    Sign out
                  </>
                )}
              </Button>
            </div>
          </section>

          {/* ══════════════════════════════════════
             Section: Delete Account (placeholder)
             ══════════════════════════════════════ */}
          <section className="rounded-[var(--radius-card)] border border-red-200 bg-red-50/30 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-base font-700 text-[var(--color-ink)]">
                  Delete account
                </h3>
                <p className="text-sm text-[var(--color-neutral-400)]">
                  Permanently delete your account and all associated data. This
                  action cannot be undone.
                </p>
              </div>
              <Button
                variant="destructive"
                disabled
                className="shrink-0 rounded-[var(--radius-button)] font-600 opacity-50 cursor-not-allowed"
              >
                <Trash2 className="size-4" />
                Delete account
              </Button>
            </div>
          </section>

          {/* Bottom spacer */}
          <div className="h-4" />
        </div>
      )}
    </motion.div>
  );
}
