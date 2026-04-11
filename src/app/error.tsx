"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-blush)]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 className="mt-6 text-2xl font-700 text-[var(--color-ink)]">
        Something went wrong
      </h2>
      <p className="mt-2 max-w-md text-center text-[var(--color-neutral-500)]">
        An unexpected error occurred. Please try again or contact support if the
        problem persists.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-[var(--color-neutral-400)]">
          Error ID: {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex items-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-ink)] px-6 py-3 text-sm font-600 text-[var(--color-background)] transition-opacity hover:opacity-90"
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
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M21 21v-5h-5" />
        </svg>
        Try again
      </button>
    </div>
  );
}
