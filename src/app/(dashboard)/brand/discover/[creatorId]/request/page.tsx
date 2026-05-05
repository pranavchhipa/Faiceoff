"use client";

import { useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function SendRequestPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const creatorId = params.creatorId as string;
  const packageId = searchParams.get("package");

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href={`/brand/discover/${creatorId}`}
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to profile
      </Link>

      <h1 className="font-display text-[28px] font-800 tracking-tight text-[var(--color-foreground)]">
        Send collab request
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
        Package ID: {packageId ?? "not selected"}
      </p>
      <p className="mt-4 text-sm text-[var(--color-muted-foreground)]">
        Request form coming in Phase 5. For now, this page is a placeholder.
      </p>
    </div>
  );
}
