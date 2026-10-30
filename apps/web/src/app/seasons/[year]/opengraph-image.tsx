import { entityOgImage } from "@/lib/og-cards";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og-image";
import { prebuild } from "@/lib/static-params";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "A Formula 1 season on Pitwall";

export function generateStaticParams() {
	return prebuild.seasons();
}

export default async function Image({ params }: { params: Promise<{ year: string }> }) {
	return entityOgImage("season", (await params).year);
}
