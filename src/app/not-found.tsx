import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-4">
      <h1 className="font-[family-name:var(--font-display)] text-6xl font-800 tracking-tight text-[var(--color-ink)]">
        404
      </h1>
      <p className="mt-4 font-[family-name:var(--font-display)] text-xl font-600 text-[var(--color-neutral-600)]">
        Page not found
      </p>
      <p className="mt-2 max-w-md text-center text-[var(--color-neutral-500)]">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-ink)] px-6 py-3 font-[family-name:var(--font-display)] text-sm font-600 text-[var(--color-background)] transition-opacity hover:opacity-90"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m12 19-7-7 7-7" />
          <path d="M19 12H5" />
        </svg>
        Back to home
      </Link>
    </div>
  );
}
