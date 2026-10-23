import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Lab universes (/u/…) and shared links (/share) are personal what-if copies of the site:
// kept out of search so only the real history is indexed.
export default function robots(): MetadataRoute.Robots {
	return {
		rules: { userAgent: "*", allow: "/", disallow: ["/u/", "/share", "/search-index"] },
		sitemap: `${SITE_URL}/sitemap.xml`,
	};
}
