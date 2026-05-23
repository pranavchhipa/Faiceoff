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
    { url: `${base}/earn`,         lastModified: now, changeFrequency: "weekly",  priority: 0.85 },
    { url: `${base}/learn`,        lastModified: now, changeFrequency: "weekly",  priority: 0.7 },
    { url: `${base}/pricing`,      lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/contact`,      lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  // Learn articles (content/authority)
  const learnRoutes: MetadataRoute.Sitemap = [
    "what-is-ai-face-licensing",
    "ai-photoshoot-vs-traditional",
    "is-ai-influencer-legal-india",
  ].map((slug) => ({
    url: `${base}/learn/${slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.75,
  }));

  // Industry landing pages
  const industryRoutes: MetadataRoute.Sitemap = [
    "fashion", "beauty", "tech", "food", "travel",
    "fitness", "jewellery", "home", "automotive", "d2c",
  ].map((ind) => ({
    url: `${base}/for-brands/${ind}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // Creator category landing pages
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

  return [
    ...staticRoutes,
    ...learnRoutes,
    ...industryRoutes,
    ...categoryRoutes,
    ...creatorRoutes,
  ];
}
