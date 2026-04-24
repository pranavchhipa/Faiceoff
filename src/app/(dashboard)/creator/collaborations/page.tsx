// Thin wrapper — underlying Campaigns page is role-aware: shows
// "Collaborations" header + creator-side data when role=creator, "Campaigns"
// + brand-side data when role=brand. We mount it at /creator/collaborations
// for creator's sidebar; brand has its own newer view at /brand/sessions.
export { default } from "../../dashboard/campaigns/page";
