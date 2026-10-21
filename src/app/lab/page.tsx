import type { Metadata } from "next";
import { Suspense } from "react";
import { Lab } from "@/components/lab/lab";

export const metadata: Metadata = { title: "Lab" };

export default function Page() {
	return (
		<Suspense>
			<Lab />
		</Suspense>
	);
}
