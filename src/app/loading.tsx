export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
      <div className="flex flex-col items-center gap-4">
        {/* Pulsing gold dot spinner */}
        <div className="flex gap-2">
          <span className="h-3 w-3 animate-pulse rounded-full bg-[var(--color-gold)] [animation-delay:0ms]" />
          <span className="h-3 w-3 animate-pulse rounded-full bg-[var(--color-gold)] [animation-delay:150ms]" />
          <span className="h-3 w-3 animate-pulse rounded-full bg-[var(--color-gold)] [animation-delay:300ms]" />
        </div>
        <p className="font-[family-name:var(--font-sans)] text-sm text-[var(--color-neutral-500)]">
          Loading...
        </p>
      </div>
    </div>
  );
}
