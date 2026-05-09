import { Suspense } from "react";
import { ChatInbox } from "@/components/chat/chat-inbox";
import { Loader2 } from "lucide-react";

export const metadata = {
  title: "Inbox · Faiceoff",
};

export default function BrandInboxPage() {
  return (
    <div className="w-full max-w-6xl pt-6 lg:pt-8">
      <div className="mb-5">
        <h1 className="text-2xl font-800 tracking-tight text-[var(--color-foreground)]">
          Inbox
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Chat with creators you&apos;ve already licensed from. New
          conversations unlock after the first approved image.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="flex h-[400px] items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
            <Loader2 className="size-5 animate-spin text-[var(--color-muted-foreground)]" />
          </div>
        }
      >
        <ChatInbox />
      </Suspense>
    </div>
  );
}
