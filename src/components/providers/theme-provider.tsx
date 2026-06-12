"use client";

import type { ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * ThemeProvider — Faiceoff is DARK-ONLY.
 *
 * Light mode was removed (2026-06): the product is a single warm "Studio
 * Black" + brass-gold surface everywhere. `forcedTheme="dark"` pins the
 * `.dark` class on <html> permanently — there is no toggle and stored
 * preferences are ignored. Marketing/landing pages still render their own
 * cream editorial palette because `.landing-scope` overrides the tokens
 * within its own subtree regardless of the `.dark` class.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      forcedTheme="dark"
      enableSystem={false}
      storageKey="faiceoff-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
