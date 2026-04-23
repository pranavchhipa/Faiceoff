// Brand home — re-exports the shared dashboard page.
// The shared /dashboard page branches on role internally, so pointing
// /brand/dashboard at it gives brands their correct home without
// duplicating UI. Nav items, redirects, and ROLE_HOME all reference
// this URL, so it must exist even if the content lives elsewhere.
export { default } from "../../dashboard/page";
