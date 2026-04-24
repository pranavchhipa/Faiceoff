// ─────────────────────────────────────────────────────────────────────────────
// /admin/stuck-gens — Stuck generation triage list
//
// Server component shell — data loading + triage actions live in StuckList.
// ─────────────────────────────────────────────────────────────────────────────

import { StuckList } from "./stuck-list";

export const metadata = {
  title: "Stuck generations — Admin",
};

export default function AdminStuckGensPage() {
  return <StuckList />;
}
