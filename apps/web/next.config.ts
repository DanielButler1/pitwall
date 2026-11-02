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
		return [{ source: "/:path((?!_next/|data/).*)", headers: [{ key: "Link", value: `<${SITE_URL}/:path>; rel="canonical"` }] }];
	},
};

export default nextConfig;
