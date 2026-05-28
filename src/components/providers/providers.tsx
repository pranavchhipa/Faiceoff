"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "./auth-provider";
import { ThemeProvider } from "./theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { RouteProgress } from "@/components/ui/route-progress";

/**
 * Providers — Composes all application-level providers.
 * Add new providers here as the application grows.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        {/* Tiny rust route-progress bar pulses on every navigation. Mounted
            here so it covers every authenticated AND public surface. */}
        <RouteProgress />
        {children}
        <Toaster position="top-center" />
      </AuthProvider>
    </ThemeProvider>
  );
}
