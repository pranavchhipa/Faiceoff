"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { motion } from "framer-motion";
import { Building2, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const INDUSTRIES = [
  "Advertising",
  "E-commerce",
  "Entertainment",
  "Fashion",
  "FMCG",
  "Healthcare",
  "Real Estate",
  "Technology",
  "Other",
] as const;

export default function BrandSetupPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-fill company name from user metadata
  useEffect(() => {
    if (user?.user_metadata?.company_name) {
      setCompanyName(user.user_metadata.company_name);
    }
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!companyName.trim()) {
      toast.error("Company name is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/brand-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          website_url: websiteUrl || null,
          industry: industry || null,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!res.ok) {
        toast.error(
          json.error ?? "Failed to save your profile. Please try again.",
        );
        console.error("Brand setup error:", json.error ?? res.statusText);
        return;
      }

      toast.success("Brand profile saved successfully!");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
      console.error("Brand setup error:", err);
    } finally {
      setIsSubmitting(false);
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="max-w-3xl py-8"
    >
      {/* Ocean accent badge */}
      <div className="mb-6 flex justify-center">
        <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-primary)]/12 px-4 py-1.5 text-xs font-600 text-[var(--color-primary)]">
          <Building2 className="size-3.5" />
          Brand Profile Setup
        </span>
      </div>

      <Card className="border-[var(--color-neutral-200)] shadow-[var(--shadow-card)]">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-700 tracking-tight text-[var(--color-ink)]">
            Set up your brand
          </CardTitle>
          <CardDescription className="text-[var(--color-neutral-500)]">
            Tell us about your company so creators know who they are working
            with. You can verify your GST from the dashboard next — your brand
            goes live for collaborations once verification is approved.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Company Name */}
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="company-name"
                className="text-[var(--color-ink)]"
              >
                Company Name <span className="text-[var(--color-primary)]">*</span>
              </Label>
              <Input
                id="company-name"
                type="text"
                placeholder="Acme Inc."
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                className="rounded-[var(--radius-input)]"
              />
            </div>

            {/* Website URL */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="website-url" className="text-[var(--color-ink)]">
                Website URL{" "}
                <span className="text-[var(--color-neutral-400)] font-400">
                  (optional)
                </span>
              </Label>
              <Input
                id="website-url"
                type="url"
                placeholder="https://yourcompany.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="rounded-[var(--radius-input)]"
              />
            </div>

            {/* Industry */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="industry" className="text-[var(--color-ink)]">
                Industry{" "}
                <span className="text-[var(--color-neutral-400)] font-400">
                  (optional)
                </span>
              </Label>
              <select
                id="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
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

            {/* Submit */}
            <Button
              type="submit"
              disabled={isSubmitting || !companyName.trim()}
              className="mt-2 h-11 w-full rounded-[var(--radius-button)] bg-[var(--color-primary)] font-600 text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Save & continue
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>

            <p className="text-center text-xs text-[var(--color-neutral-500)]">
              Next, verify your GST from the dashboard to unlock collaborations.
            </p>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
