import { ChatInbox } from "@/components/chat/chat-inbox";

export const metadata = {
  title: "Inbox · Faiceoff",
};

export default function BrandInboxPage() {
  return (
    <div className="w-full max-w-6xl">
      <div className="mb-5">
        <h1 className="text-2xl font-800 tracking-tight text-[var(--color-foreground)]">
          Inbox
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Chat with creators you&apos;ve already licensed from. New
          conversations unlock after the first approved image.
        </p>
      </div>
      <ChatInbox />
    </div>
  );
}
