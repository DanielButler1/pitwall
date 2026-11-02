import { teammatesOgImage } from "@/lib/og-pages";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Two Formula 1 team-mates head to head, on Pitwall";

// drawn the first time each is asked for, then cached
export function generateStaticParams() {
	return [];
}

export default async function Image({ params }: { params: Promise<{ a: string; b: string }> }) {
	const { a, b } = await params;
	return teammatesOgImage(decodeURIComponent(a), decodeURIComponent(b));
}
