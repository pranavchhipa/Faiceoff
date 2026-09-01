"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Toaster.
 *
 * The colour variables here were the shadcn defaults — `var(--popover)`,
 * `var(--popover-foreground)`, `var(--border)`. In this codebase those hold
 * raw HSL CHANNELS (`222 12% 11%`), not finished colours; they only work
 * wrapped as `hsl(var(--popover))`. Passed straight through, each one
 * resolved to an invalid colour, so every toast in the app rendered with a
 * transparent background and no border — bare text floating over whatever
 * was underneath it. Using the composed `--color-*` tokens (the canonical
 * ones in this design system) fixes it everywhere at once.
 *
 * Position is bottom-right: toasts here are outcome notices (a render
 * finished, a payment landed), not blocking confirmations, and top-center
 * put them over the page title and the top bar's own controls.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      // The app surface is dark-only; letting next-themes pick left the
      // toast light-on-light for anyone whose OS was in light mode.
      theme="dark"
      position="bottom-right"
      offset={20}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        style: {
          background: "var(--color-card)",
          color: "var(--color-foreground)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-card)",
          // Without an explicit shadow the toast reads as part of the page
          // rather than a layer above it.
          boxShadow: "0 12px 32px -8px rgba(0,0,0,0.55)",
        },
      }}
      style={
        {
          "--normal-bg": "var(--color-card)",
          "--normal-text": "var(--color-foreground)",
          "--normal-border": "var(--color-border)",
          "--border-radius": "var(--radius-card)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
