// Brand onboarding routes through the CANONICAL verification-aware setup form.
//
// The old 2-step wizard here POSTed to /api/settings/brand-profile and never
// collected PAN or created a brand_verifications row — so new brands silently
// skipped the manual-review queue. The canonical form (collects company + GST
// + PAN, POSTs /api/brand-setup, creates a pending brand_verifications row and
// keeps is_verified=false) lives under /dashboard/brand-setup. Re-export it so
// the proxy onboarding gate funnels new brands through the real flow.
//
// onboardingComplete (get-session-role.ts) flips true once brands.company_name
// is filled by /api/brand-setup, so the brand won't loop back here.
export { default } from "../../dashboard/brand-setup/page";
