// ─────────────────────────────────────────────────────────────────────────────
// /admin/safety — Hive safety review queue (E34)
//
// Server component shell — initial queue fetch happens client-side (auto-refresh
// every 30s). SafetyCards handles all data loading and action mutations.
// ─────────────────────────────────────────────────────────────────────────────

import { SafetyCards } from "./safety-cards";

export const metadata = {
  title: "Safety review queue — Admin",
};

export default function AdminSafetyPage() {
  return (
    <div>
      <SafetyCards />
    </div>
  );
}
