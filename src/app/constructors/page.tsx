import type { Metadata } from "next";
import { ConstructorsPage } from "@/components/pages/people";
import { getDb } from "@/lib/f1/server";
import { constructorsView } from "@/lib/f1/views";

export const metadata: Metadata = { title: "Constructors" };

export default function Page() {
	return <ConstructorsPage view={constructorsView(getDb())} />;
}
