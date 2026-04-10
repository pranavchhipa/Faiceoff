"use client";

import { Suspense } from "react";
import { NewCampaignForm } from "./new-campaign-form";

export default function NewCampaignPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-gold)]" />
        </div>
      }
    >
      <NewCampaignForm />
    </Suspense>
  );
}
