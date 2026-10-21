import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// data/f1.json is read at runtime by src/lib/f1/server.ts
	outputFileTracingIncludes: { "/**": ["./data/f1.json"] },
};

export default nextConfig;
