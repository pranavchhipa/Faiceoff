// ─────────────────────────────────────────────────────────────────────────────
// /admin/stuck-gens — Stuck generation fallback queue (E35)
//
// Server component shell — StuckList handles all data loading and actions.
// ─────────────────────────────────────────────────────────────────────────────

import { StuckList } from "./stuck-list";

export const metadata = {
  title: "Stuck generations — Admin",
};

export default function AdminStuckGensPage() {
  return (
    <div>
      <StuckList />
    </div>
  );
}
