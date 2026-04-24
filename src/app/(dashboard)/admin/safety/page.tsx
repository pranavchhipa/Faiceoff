// ─────────────────────────────────────────────────────────────────────────────
// /admin/safety — Hive safety review queue (Split Stage)
//
// Server component shell — the split-stage layout, polling, and action
// mutations all live inside SafetyCards.
// ─────────────────────────────────────────────────────────────────────────────

import { SafetyCards } from "./safety-cards";

export const metadata = {
  title: "Safety review — Admin",
};

export default function AdminSafetyPage() {
  return <SafetyCards />;
}
