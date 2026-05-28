/**
 * Reusable skeleton primitives. Used by per-route `loading.tsx` files so
 * the user sees the page shape paint immediately on navigation instead of
 * a blank stretch + a centered spinner.
 *
 * Everything here is intentionally tiny — no animations beyond the Tailwind
 * `animate-pulse` so the skeleton can render server-side with zero JS.
 */

interface PulseProps {
  className?: string;
}

/** Single pulsing block — drop-in for any rectangle that's loading. */
export function Pulse({ className = "" }: PulseProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-[var(--color-secondary)] ${className}`}
    />
  );
}

/** Header strip — title + sub. Common to every dashboard page. */
export function PageHeaderSkeleton({
  withCta = false,
}: {
  withCta?: boolean;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="flex-1">
        <Pulse className="h-3 w-24" />
        <Pulse className="mt-3 h-9 w-2/3 max-w-[420px]" />
        <Pulse className="mt-3 h-3.5 w-3/4 max-w-[560px]" />
      </div>
      {withCta && <Pulse className="h-11 w-[180px] shrink-0 rounded-xl" />}
    </div>
  );
}

/** 4-tile stat strip — Active / Completed / Images / Spent style. */
export function StatStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
        >
          <div className="flex items-center gap-2">
            <Pulse className="h-7 w-7 rounded-lg" />
            <Pulse className="h-3 w-20" />
          </div>
          <Pulse className="mt-3 h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Generic card grid (Discover / Vault / Collabs etc.). */
export function CardGridSkeleton({
  count = 6,
  aspect = "aspect-[4/5]",
}: {
  count?: number;
  /** Tailwind aspect class for the image area inside each card. */
  aspect?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
        >
          <div className={`${aspect} bg-[var(--color-secondary)] animate-pulse`} />
          <div className="space-y-2 p-4">
            <Pulse className="h-3 w-1/2" />
            <Pulse className="h-3 w-3/4" />
            <Pulse className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Two-up split for detail surfaces (Studio, Collab detail). */
export function SplitSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_460px] xl:grid-cols-[minmax(0,1fr)_520px]">
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
          >
            <div className="flex items-center gap-3">
              <Pulse className="h-9 w-9 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Pulse className="h-3 w-1/3" />
                <Pulse className="h-2.5 w-1/4" />
              </div>
              <Pulse className="h-4 w-4 rounded" />
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
        <div className="aspect-square bg-[var(--color-secondary)] animate-pulse" />
        <div className="space-y-2 p-4">
          <Pulse className="h-3 w-1/2" />
          <Pulse className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}
