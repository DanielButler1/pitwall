import type { Metadata } from "next";
import { RecordsPage } from "@/components/pages/records";
import { recordsIndexView } from "@/lib/f1/records";
import { getDb } from "@/lib/f1/server";

export const metadata: Metadata = { title: "Records" };

export default function Page() {
	return <RecordsPage view={recordsIndexView(getDb())} />;
}
