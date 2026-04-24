"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, UserCircle2, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Role } from "@/config/routes";

interface UserMenuProps {
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
  role: Role | null;
  variant?: "rail" | "topbar";
}

/**
 * UserMenu — avatar + dropdown with profile, settings, sign out.
 * Used in the top bar (all roles).
 */
export function UserMenu({ displayName, email, avatarUrl, role, variant = "topbar" }: UserMenuProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const settingsHref =
    role === "brand"
      ? "/brand/settings"
      : role === "admin"
      ? "/admin"
      : "/creator/settings";

  async function handleSignOut() {
    setSigningOut(true);
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const initial = (displayName || "?").charAt(0).toUpperCase();

  if (variant === "rail") {
    // Compact avatar-only trigger for the Brand icon rail
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-700 text-[var(--color-foreground)] transition-all hover:border-[var(--color-primary)] hover:shadow-[0_0_0_3px_rgba(201,169,110,0.15)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={displayName} className="h-full w-full rounded-full object-cover" />
            ) : (
              <span>{initial}</span>
            )}
          </button>
        </DropdownMenuTrigger>
        <MenuBody displayName={displayName} email={email} settingsHref={settingsHref} signingOut={signingOut} onSignOut={handleSignOut} role={role} />
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] py-1 pl-1 pr-3 text-sm transition-colors hover:bg-[var(--color-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-[11px] font-700 text-[var(--color-primary-foreground)]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={displayName} className="h-full w-full rounded-full object-cover" />
            ) : (
              initial
            )}
          </span>
          <span className="hidden max-w-[140px] truncate font-600 md:block">
            {displayName || "…"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
        </button>
      </DropdownMenuTrigger>
      <MenuBody displayName={displayName} email={email} settingsHref={settingsHref} signingOut={signingOut} onSignOut={handleSignOut} role={role} />
    </DropdownMenu>
  );
}

function MenuBody({
  displayName,
  email,
  settingsHref,
  signingOut,
  onSignOut,
  role,
}: {
  displayName: string;
  email?: string | null;
  settingsHref: string;
  signingOut: boolean;
  onSignOut: () => void;
  role: Role | null;
}) {
  return (
    <DropdownMenuContent align="end" className="w-64">
      <DropdownMenuLabel className="flex flex-col gap-0.5">
        <span className="text-sm font-600">{displayName || "Signed in"}</span>
        {email && (
          <span className="truncate text-[11px] font-normal text-[var(--color-muted-foreground)]">
            {email}
          </span>
        )}
        {role && (
          <span className="mt-1 inline-flex w-fit items-center rounded-full border border-[var(--color-border)] bg-[var(--color-secondary)] px-2 py-0.5 text-[10px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {role}
          </span>
        )}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link href={settingsHref} className="flex cursor-pointer items-center gap-2">
          <UserCircle2 className="h-4 w-4" />
          Profile
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href={settingsHref} className="flex cursor-pointer items-center gap-2">
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={onSignOut}
        disabled={signingOut}
        className="flex cursor-pointer items-center gap-2 text-[var(--color-destructive)] focus:text-[var(--color-destructive)]"
      >
        <LogOut className="h-4 w-4" />
        {signingOut ? "Signing out…" : "Sign out"}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
