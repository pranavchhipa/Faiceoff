"use client";

/**
 * GeneratingMessage — rotating status copy for image generation waits.
 *
 * A render takes 60-90s, and every waiting surface used to print exactly
 * that: "~60-90 seconds". A countdown-shaped promise is the worst thing to
 * show during a wait — the user starts measuring you against it, and a run
 * that takes 95s reads as broken even though it succeeded. Worse, the screen
 * looked frozen: one static line for a minute and a half.
 *
 * These lines rotate every few seconds and describe what is actually
 * happening in the pipeline, in order — face references, scene, product,
 * lighting, safety check, upscale. Movement signals progress, and naming the
 * real steps makes the wait feel like work rather than a hang.
 */

import { useEffect, useState } from "react";

/** Ordered to loosely track the real pipeline stages. */
const MESSAGES = [
  "Reading your reference photos…",
  "Locking in your face…",
  "Building the scene…",
  "Placing the product…",
  "Matching the lighting…",
  "Working the fine details…",
  "Running the safety check…",
  "Sharpening the final frame…",
  "Almost there…",
];

const ROTATE_MS = 4_000;

export function GeneratingMessage({
  className = "",
  messages = MESSAGES,
  intervalMs = ROTATE_MS,
}: {
  className?: string;
  messages?: string[];
  intervalMs?: number;
}) {
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      // Stop at the last line rather than looping back to "Reading your
      // reference photos…" — restarting the sequence reads as a retry.
      setI((n) => (n + 1 < messages.length ? n + 1 : n));
    }, intervalMs);
    return () => clearInterval(id);
  }, [messages.length, intervalMs]);

  return (
    <span
      key={i}
      className={`animate-[fadeIn_0.4s_ease-out] ${className}`}
      aria-live="polite"
    >
      {messages[i]}
    </span>
  );
}
