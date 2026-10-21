import type { Metadata } from "next";
import { ShareOpener } from "@/components/lab/share-opener";

export const metadata: Metadata = { title: "Shared universe" };

// /share#<data>: the universe is in the fragment, which only the browser sees (see src/lib/universe/share.ts).
export default function Page() {
	return <ShareOpener />;
}
