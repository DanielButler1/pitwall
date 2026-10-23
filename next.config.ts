import type { NextConfig } from "next";
import { SITE_URL } from "./src/lib/site";

const host = new URL(SITE_URL).host;

const nextConfig: NextConfig = {
	// data/f1.json is read at runtime by src/lib/f1/server.ts
	outputFileTracingIncludes: { "/**": ["./data/f1.json"] },

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
