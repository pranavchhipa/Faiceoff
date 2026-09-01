"use client";

import { useEffect, useState } from "react";

/**
 * Hook: globally listen for ⌘K / Ctrl+K to open the palette.
 *
 * Lives in its own module (NOT command-palette.tsx) so the dashboard layout
 * can import it statically without dragging the whole palette — including
 * cmdk — into the layout's first-load chunk. The palette component itself is
 * loaded via dynamic() only when this hook's state first opens it.
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return { open, setOpen };
}
