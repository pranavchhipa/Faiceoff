import type { ReactNode } from "react";
import { ThemeProvider } from "./theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { RouteProgress } from "@/components/ui/route-progress";

/**
 * Providers — Composes all application-level providers.
 *
 * NOTE: AuthProvider deliberately does NOT live here anymore. Only the
 * (dashboard) tree consumes it, and mounting it globally shipped the
 * Supabase browser client + a session-restore round trip to every
 * anonymous marketing/SEO page. It now wraps the dashboard layout only.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      {/* Tiny rust route-progress bar pulses on every navigation. Mounted
          here so it covers every authenticated AND public surface. */}
      <RouteProgress />
      {children}
      <Toaster position="top-center" />
    </ThemeProvider>
  );
}