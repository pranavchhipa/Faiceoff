export { ROLE_HOME, getRoleHome } from "./routes";
export type { Role } from "./routes";

export const siteConfig = {
  name: 'Faiceoff',
  description: 'India\'s first consent-first AI likeness licensing marketplace',
  url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
} as const;
