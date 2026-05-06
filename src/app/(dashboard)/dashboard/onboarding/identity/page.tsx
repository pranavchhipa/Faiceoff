"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { User, MapPin, ArrowRight, Shield, Upload, X, FileCheck } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ID_TYPES = [
  { value: "aadhaar", label: "Aadhaar Card" },
  { value: "pan", label: "PAN Card" },
  { value: "passport", label: "Passport" },
  { value: "voter_id", label: "Voter ID" },
] as const;

export default function IdentityPage() {
  const { user, supabase, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<string>("");
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [idType, setIdType] = useState<string>("aadhaar");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("File size must be under 5MB");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
      setError("Only JPG, PNG, WebP or PDF files are accepted");
      return;
    }
    setError(null);
    setIdFile(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    if (!gender) {
      setError("Please select your gender — it's required for accurate likeness generation.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: metaError } = await supabase.auth.updateUser({
        data: {
          full_legal_name: fullName,
          date_of_birth: `${dobYear}-${dobMonth.padStart(2, "0")}-${dobDay.padStart(2, "0")}`,
          city,
          state,
          kyc_id_type: idType,
        },
      });

      if (metaError) throw metaError;

      let kycDocPath: string | null = null;
      if (idFile) {
        const ext = idFile.name.split(".").pop() ?? "jpg";
        const filePath = `kyc/${user.id}/${idType}_${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("kyc-documents")
          .upload(filePath, idFile, { upsert: true });

        if (uploadError) {
          console.warn("KYC upload failed (bucket may not exist):", uploadError.message);
          kycDocPath = `pending:${filePath}`;
        } else {
          kycDocPath = filePath;
        }
      }

      const res = await fetch("/api/onboarding/update-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "instagram",
          gender,
          kyc_document_url: kycDocPath,
          kyc_status: idFile ? "pending" : "not_started",
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to update step");
      }

      router.push("/dashboard/onboarding/instagram");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-secondary)] px-3 py-1 text-xs font-600 text-[var(--color-muted-foreground)] mb-3">
          <User className="size-3.5" />
          Identity Verification
        </div>
        <h2 className="text-2xl font-700 text-[var(--color-foreground)] mb-1">
          Tell us about yourself
        </h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Required for KYC and DPDP Act compliance. Your information is encrypted and stored securely.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Full Name */}
        <div className="space-y-2">
          <Label htmlFor="fullName">Full legal name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-muted-foreground)]" />
            <Input
              id="fullName"
              type="text"
              required
              placeholder="As on your government ID"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="pl-10 rounded-[var(--radius-input)]"
            />
          </div>
        </div>

        {/* Gender — pill picker */}
        <div className="space-y-2">
          <Label>Gender</Label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
              { value: "non_binary", label: "Non-binary" },
              { value: "prefer_not_to_say", label: "Prefer not to say" },
            ].map((opt) => {
              const selected = gender === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGender(opt.value)}
                  className={`rounded-[var(--radius-pill)] px-4 py-2 text-sm font-600 transition-colors ${
                    selected
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "bg-[var(--color-secondary)] text-[var(--color-foreground)] hover:bg-[var(--color-border)]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Used so AI-generated images match your actual appearance. Required for accurate likeness.
          </p>
        </div>

        {/* DOB — 3 dropdowns */}
        <div className="space-y-2">
          <Label>Date of birth</Label>
          <div className="grid grid-cols-3 gap-3">
            <select
              value={dobDay}
              onChange={(e) => setDobDay(e.target.value)}
              required
              className="h-10 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            >
              <option value="">Day</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={String(d)}>{d}</option>
              ))}
            </select>
            <select
              value={dobMonth}
              onChange={(e) => setDobMonth(e.target.value)}
              required
              className="h-10 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            >
              <option value="">Month</option>
              {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                <option key={m} value={String(i + 1)}>{m}</option>
              ))}
            </select>
            <select
              value={dobYear}
              onChange={(e) => setDobYear(e.target.value)}
              required
              className="h-10 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            >
              <option value="">Year</option>
              {Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - 18 - i).map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* City + State */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-muted-foreground)]" />
              <Input
                id="city"
                type="text"
                required
                placeholder="e.g. Mumbai"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="pl-10 rounded-[var(--radius-input)]"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              type="text"
              required
              placeholder="e.g. Maharashtra"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="rounded-[var(--radius-input)]"
            />
          </div>
        </div>

        {/* KYC Document */}
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-secondary)] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-[var(--color-primary)]" />
            <p className="text-sm font-600 text-[var(--color-foreground)]">Government ID Verification</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="idType">ID type</Label>
            <select
              id="idType"
              value={idType}
              onChange={(e) => setIdType(e.target.value)}
              className="w-full h-10 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            >
              {ID_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Upload document</Label>
            {!idFile ? (
              <label
                htmlFor="kycFile"
                className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-input)] border-2 border-dashed border-[var(--color-border)] p-6 transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5"
              >
                <Upload className="size-6 text-[var(--color-muted-foreground)]" />
                <p className="text-sm font-500 text-[var(--color-muted-foreground)]">
                  Click to upload your {ID_TYPES.find((t) => t.value === idType)?.label}
                </p>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  JPG, PNG, WebP or PDF — max 5MB
                </p>
                <input
                  id="kycFile"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="flex items-center gap-3 rounded-[var(--radius-input)] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                <FileCheck className="size-5 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-500 text-[var(--color-foreground)]">{idFile.name}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {(idFile.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIdFile(null)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-border)] hover:text-[var(--color-foreground)]"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
          </div>

          <p className="text-xs text-[var(--color-muted-foreground)]">
            Your document is encrypted and stored securely. It will be auto-deleted after 90 days as per our data retention policy.
          </p>
        </div>

        {error && (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-500">
            {error}
          </p>
        )}

        <div className="pt-4">
          <Button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90 rounded-[var(--radius-button)] h-11 px-8 font-600"
          >
            {saving ? (
              <div className="size-4 animate-spin rounded-full border-2 border-[var(--color-primary-foreground)]/30 border-t-[var(--color-primary-foreground)]" />
            ) : (
              <>
                Continue
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
