import { diaryOgImage } from "@/lib/og-pages";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "What happened on this day in Formula 1, on Pitwall";

// drawn the first time each is asked for, then cached
export function generateStaticParams() {
	return [];
}

export default async function Image({ params }: { params: Promise<{ date: string }> }) {
	return diaryOgImage((await params).date);
}
