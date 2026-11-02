import { recordOgImage } from "@/lib/og-pages";

// A record category's share picture. An opengraph-image file can't follow a catch-all segment, so the category page's
// metadata points here instead (src/app/records/[...slug]/page.tsx).

// drawn the first time each is asked for, then cached
export function generateStaticParams() {
	return [];
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
	return recordOgImage((await params).slug.map(decodeURIComponent).join("/"));
}
