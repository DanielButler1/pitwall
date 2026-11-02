import { entityOgImage } from "@/lib/og-cards";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og-image";
import { prebuild } from "@/lib/static-params";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "A Formula 1 driver's career on Pitwall";

export function generateStaticParams() {
	return prebuild.drivers();
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
	return entityOgImage("driver", (await params).id);
}
