"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls every 30s and triggers `router.refresh()` so the server
 * component re-runs its queries. Cheap because Next dedupes the
 * request and only the changed bytes get streamed.
 */
export default function OpsAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
