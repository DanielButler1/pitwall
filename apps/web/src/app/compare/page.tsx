import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareRoute } from "@/components/pages/compare-route";
import { compareNames, compareQuery } from "@pitwall/core/f1/compare";
import { OG_SIZE } from "@/lib/og-image";
import { getDb } from "@/lib/server";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// The comparison is built in the browser, but a shared link is read by a server that runs no script: name who is
// compared, and point at a share picture of them (src/app/og/compare).
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
	const { kind, ids } = compareQuery(await searchParams);
	const names = compareNames(getDb(), kind, ids);
	const title = names.length >= 2 ? names.join(" vs ") : "Compare";
	const query = ids.length ? `?${kind === "team" ? "t" : "d"}=${ids.map(encodeURIComponent).join(",")}` : "";
	return {
		title,
		// replaces the layout's openGraph, so its fields are repeated
		openGraph: { siteName: "Pitwall", type: "website", images: [{ url: `/og/compare${query}`, ...OG_SIZE, alt: `${title} on Pitwall` }] },
	};
}

// a static shell: the comparison itself is built in the browser from the query string
export default function Page() {
	return (
		<Suspense>
			<CompareRoute />
		</Suspense>
	);
}
