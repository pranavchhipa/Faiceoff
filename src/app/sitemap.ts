import type { MetadataRoute } from "next";
import { listPublishedCreatorSlugs } from "@/lib/profile/public-creators";
import { ALL_CATEGORY_KEYS } from "@/lib/profile/demo-prompts";

/**
 * Dynamic sitemap. Static marketing routes + the programmatic SEO surfaces:
 *   - /creators (directory)
 *   - /creators/category/<cat> (10 category landings)
 *   - /creators/<slug> (every published creator profile)
 *
 * Auth / dashboard surfaces are excluded — behind login, no crawl value.
 * Revalidated hourly so newly-published creators get indexed.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "https://faiceoff.com";

  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`,             lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${base}/creators`,     lastModified: now, changeFrequency: "daily",   priority: 0.95 },
    { url: `${base}/for-brands`,   lastModified: now, changeFrequency: "weekly",  priority: 0.9 },
    { url: `${base}/for-creators`, lastModified: now, changeFrequency: "weekly",  priority: 0.9 },
    { url: `${base}/pricing`,      lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/contact`,      lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  // Category landing pages
  const categoryRoutes: MetadataRoute.Sitemap = ALL_CATEGORY_KEYS.map((cat) => ({
    url: `${base}/creators/category/${cat}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // Every published creator profile (best-effort — never break the sitemap)
  let creatorRoutes: MetadataRoute.Sitemap = [];
  try {
    const slugs = await listPublishedCreatorSlugs();
    creatorRoutes = slugs.map((slug) => ({
      url: `${base}/creators/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    }));
  } catch {
    // DB hiccup — serve static + category routes only
  }

  return [...staticRoutes, ...categoryRoutes, ...creatorRoutes];
}
