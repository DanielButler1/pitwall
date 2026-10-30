import { entityOgImage } from "@/lib/og-cards";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og-image";
import { prebuild } from "@/lib/static-params";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "A nation in Formula 1 on Pitwall";

export function generateStaticParams() {
	return prebuild.none();
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
	return entityOgImage("nation", (await params).id);
}
