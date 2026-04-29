import type { MetadataRoute } from "next";

/**
 * Static sitemap covering all public marketing routes. The auth /
 * dashboard surfaces are intentionally excluded — they're behind a login
 * and don't need to be crawled.
 *
 * Next.js converts this into a runtime-served /sitemap.xml at the root.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "https://faiceoff.com";

  const lastModified = new Date();

  return [
    { url: `${base}/`,             lastModified, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${base}/for-brands`,   lastModified, changeFrequency: "weekly",  priority: 0.9 },
    { url: `${base}/for-creators`, lastModified, changeFrequency: "weekly",  priority: 0.9 },
    { url: `${base}/pricing`,      lastModified, changeFrequency: "monthly", priority: 0.7 },
  ];
}
