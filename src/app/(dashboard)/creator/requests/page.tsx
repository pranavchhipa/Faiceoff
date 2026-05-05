"use client";

import { Inbox } from "lucide-react";

export default function CreatorRequestsPage() {
  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 lg:px-8 lg:py-8">
      <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
        <Inbox className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
        Collab Requests
      </p>
      <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
        Requests
      </h1>
      <p className="mt-6 text-sm text-[var(--color-muted-foreground)]">
        Incoming collab requests from brands will appear here. Coming soon.
      </p>
    </div>
  );
}
