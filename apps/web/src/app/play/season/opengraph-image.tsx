import { gameOgImage } from "@/lib/og-pages";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "A Formula 1 game on Pitwall";

export default function Image() {
	return gameOgImage("season");
}
