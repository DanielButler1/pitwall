import type { Metadata } from "next";
import { SeasonsPage } from "@/components/pages/season";
import { getDb } from "@/lib/server";
import { seasonsView } from "@pitwall/core/f1/views";

export const metadata: Metadata = { title: "Seasons" };

export default function Page() {
	return <SeasonsPage view={seasonsView(getDb())} />;
}
