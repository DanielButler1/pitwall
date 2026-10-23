import type { Metadata } from "next";
import { ConstructorsPage } from "@/components/pages/people";
import { getDb } from "@/lib/server";
import { constructorsView } from "@pitwall/core/f1/views";

export const metadata: Metadata = { title: "Constructors" };

export default function Page() {
	return <ConstructorsPage view={constructorsView(getDb())} />;
}
