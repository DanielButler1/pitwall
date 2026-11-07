import type { Metadata } from "next";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export type StaticOgKind = "race" | "driver" | "season";

/** Written by scripts/build-social-images.ts, never rendered by a request handler. */
export function staticOgUrl(kind: StaticOgKind, id: string): string {
	return `/social/${kind}/${encodeURIComponent(id)}.png`;
}

export function staticOgMetadata(kind: StaticOgKind, id: string, alt: string): Pick<Metadata, "openGraph" | "twitter"> {
	const image = { url: staticOgUrl(kind, id), ...OG_SIZE, alt };
	return {
		// Page metadata replaces, rather than merges, the layout's openGraph object.
		openGraph: { siteName: "Pitwall", type: "website", images: [image] },
		twitter: { card: "summary_large_image", images: [image] },
	};
}
