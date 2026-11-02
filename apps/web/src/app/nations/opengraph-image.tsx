import { sectionOgImage } from "@/lib/og-cards";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Pitwall: Formula 1 statistics";

export default function Image() {
	return sectionOgImage("nations");
}
