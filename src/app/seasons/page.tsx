import type { Metadata } from "next";
import { SeasonsPage } from "@/components/pages/season";
import { getDb } from "@/lib/f1/server";
import { seasonsView } from "@/lib/f1/views";

export const metadata: Metadata = { title: "Seasons" };

export default function Page() {
	return <SeasonsPage view={seasonsView(getDb())} />;
}
