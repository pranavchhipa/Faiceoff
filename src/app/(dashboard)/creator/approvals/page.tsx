// Thin wrapper — the underlying Approvals page (role-aware, creator-only
// in practice) lives at /dashboard/approvals. Sidebar links here so creators
// always have a stable, role-prefixed entry point. Same pattern as
// /creator/dashboard, /brand/settings, etc.
export { default } from "../../dashboard/approvals/page";
