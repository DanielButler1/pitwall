import { entityOgImage } from "@/lib/og-cards";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og-image";
import { prebuild } from "@/lib/static-params";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "A Formula 1 race's result on Pitwall";

export function generateStaticParams() {
	return prebuild.races();
}

export default async function Image({ params }: { params: Promise<{ year: string; round: string }> }) {
	const { year, round } = await params;
	return entityOgImage("race", `${year}-${round}`);
}
