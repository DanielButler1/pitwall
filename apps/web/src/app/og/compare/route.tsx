import type { NextRequest } from "next/server";
import { compareQuery } from "@pitwall/core/f1/compare";
import { compareOgImage } from "@/lib/og-pages";

// /compare's share picture. The ids are in the query string, which an opengraph-image file never sees, so the
// page's metadata points here with the same query (src/app/compare/page.tsx).
export function GET(request: NextRequest) {
	const { kind, ids } = compareQuery(request.nextUrl.searchParams);
	const image = compareOgImage(kind, ids);
	// one picture per query: keep it at the edge for a day (a new deployment starts afresh)
	image.headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
	return image;
}
