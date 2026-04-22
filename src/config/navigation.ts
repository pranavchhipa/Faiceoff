/**
 * DEPRECATED shim: the legacy /dashboard/* tree (soft-cutover for 90 days)
 * still imports from here. New code should import from nav-items.<role>.ts
 * directly.
 */
export { BRAND_SIDE_NAV as brandNav } from "./nav-items.brand";
export { CREATOR_SIDE_NAV as creatorNav } from "./nav-items.creator";
export { ADMIN_SIDE_NAV as adminNav } from "./nav-items.admin";
export type { NavItem } from "./nav-items.brand";
