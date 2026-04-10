"use client";

import type { ReactNode } from "react";

/**
 * ThemeProvider — Hybrid Soft Luxe v2 (light only).
 *
 * Currently a pass-through wrapper. When dark mode or theme
 * switching is needed later, this provider will manage that state.
 * All design tokens live in globals.css via CSS custom properties.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
