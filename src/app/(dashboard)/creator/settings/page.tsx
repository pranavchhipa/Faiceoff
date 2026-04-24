// Thin wrapper — underlying Settings page is fully role-aware (renders
// creator fields when role=creator, brand fields when role=brand). Same
// page mounted at both /creator/settings and /brand/settings so each role
// has a stable, role-prefixed URL in its sidebar.
export { default } from "../../dashboard/settings/page";
