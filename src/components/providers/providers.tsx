"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "./auth-provider";
import { ThemeProvider } from "./theme-provider";
import { Toaster } from "@/components/ui/sonner";

/**
 * Providers — Composes all application-level providers.
 * Add new providers here as the application grows.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        {children}
        <Toaster position="top-center" />
      </AuthProvider>
    </ThemeProvider>
  );
}
