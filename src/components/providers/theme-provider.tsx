"use client";

import type { ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * ThemeProvider — Faiceoff dashboard theme switcher.
 *
 * - Uses `next-themes` with `class` attribute on <html>.
 * - Default: "light" (Hybrid Soft Luxe, paper/cream surface).
 * - Dark: dashboard dark (cool slate — distinct from the landing
 *   page's warm "Studio Black" which is scoped via `.landing-scope`
 *   and overrides tokens regardless of the `.dark` class).
 * - Only the internal (dashboard) pages render a toggle UI. Landing
 *   stays dark always because its CSS scope wins over `.dark`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="faiceoff-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
