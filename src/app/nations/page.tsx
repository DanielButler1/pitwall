import type { Metadata } from "next";
import { NationsPage } from "@/components/pages/entities";
import { getDb } from "@/lib/f1/server";
import { nationsView } from "@/lib/f1/views";

export const metadata: Metadata = { title: "Nations" };

export default function Page() {
	return <NationsPage view={nationsView(getDb())} />;
}
