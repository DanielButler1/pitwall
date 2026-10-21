import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareRoute } from "@/components/pages/compare-route";

export const metadata: Metadata = { title: "Compare" };

// a static shell: the comparison itself is built in the browser from the query string
export default function Page() {
	return (
		<Suspense>
			<CompareRoute />
		</Suspense>
	);
}
