import type { NextConfig } from "next";
import { SITE_URL } from "./src/lib/site";

const host = new URL(SITE_URL).host;

// what the share pictures (src/lib/og-image.tsx) read: their font, the logo and the flags
const OG_FILES = [
	"./assets/fonts/*.ttf",
	"./src/app/icon.svg",
	"../../node_modules/.pnpm/flag-icons@*/node_modules/flag-icons/package.json",
	"../../node_modules/.pnpm/flag-icons@*/node_modules/flag-icons/flags/4x3/*.svg",
];

// Keep existing shared image URLs working without invoking an image function.
const staticSocialRewrites = [
	{ source: "/races/:year/:round/opengraph-image", destination: "/social/race/:year-:round.png" },
	{ source: "/drivers/:id/opengraph-image", destination: "/social/driver/:id.png" },
	{ source: "/seasons/:year/opengraph-image", destination: "/social/season/:year.png" },
];

const nextConfig: NextConfig = {
	// data/f1.json and data/facts.json are read at runtime by src/lib/server.ts
	outputFileTracingIncludes: {
		"/**": ["./data/f1.json", "./data/facts.json"],
		// and the share pictures read OG_FILES, including the ones drawn by a route under /og (src/app/og)
		"/**/opengraph-image": OG_FILES,
		"/og/**": OG_FILES,
	},

	// The production build answers on its *.vercel.app addresses too: send those to the real
	// domain so search engines see one copy. Preview deployments keep their own addresses.
	async redirects() {
		if (process.env.VERCEL_ENV !== "production") return [];
		return [{ source: "/:path*", missing: [{ type: "host", value: host }], destination: `${SITE_URL}/:path*`, permanent: true }];
	},

	// Every page names its address on the real domain as the canonical one (without any query).
	async headers() {
		return [
			{ source: "/:path((?!_next/|data/).*)", headers: [{ key: "Link", value: `<${SITE_URL}/:path>; rel="canonical"` }] },
			...["/social/:path*", ...staticSocialRewrites.map(({ source }) => source)].map((source) => ({
				source,
				// Browsers revalidate across releases; Vercel's deployment-scoped CDN can keep the file.
				headers: [{ key: "Cache-Control", value: "public, max-age=0, s-maxage=31536000" }],
			})),
		];
	},
	async rewrites() {
		return staticSocialRewrites;
	},
};

export default nextConfig;
