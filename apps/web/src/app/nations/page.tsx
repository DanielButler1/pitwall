import type { Metadata } from "next";
import { NationsPage } from "@/components/pages/entities";
import { getDb } from "@/lib/server";
import { nationsView } from "@pitwall/core/f1/views";

export const metadata: Metadata = { title: "Nations" };

export default function Page() {
	return <NationsPage view={nationsView(getDb())} />;
}
