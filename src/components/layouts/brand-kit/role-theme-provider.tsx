"use client";

import type { CSSProperties, ReactNode } from "react";
import type { Role } from "@/config/routes";

interface Props {
  role: Role;
  children: ReactNode;
}

const THEME: Record<Role, CSSProperties> = {
  brand: {
    "--role-accent": "var(--color-ocean)",
    "--role-accent-strong": "var(--color-ocean-deep)",
    "--role-accent-fg": "var(--color-ink)",
  } as CSSProperties,
  creator: {
    "--role-accent": "var(--color-blush)",
    "--role-accent-strong": "var(--color-blush-deep)",
    "--role-accent-fg": "var(--color-ink)",
  } as CSSProperties,
  admin: {
    "--role-accent": "#e6e6e6",
    "--role-accent-strong": "#999999",
    "--role-accent-fg": "var(--color-ink)",
  } as CSSProperties,
};

/**
 * Scope role-aware CSS variables to a subtree. All child components reading
 * `var(--role-accent)` pick up the right tint without prop drilling.
 */
export function RoleThemeProvider({ role, children }: Props) {
  return (
    <div data-role={role} style={THEME[role]}>
      {children}
    </div>
  );
}
