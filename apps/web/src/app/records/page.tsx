import type { Metadata } from "next";
import { RecordsPage } from "@/components/pages/records";
import { recordsIndexView } from "@pitwall/core/f1/records";
import { getDb } from "@/lib/server";

export const metadata: Metadata = { title: "Records" };

export default function Page() {
	return <RecordsPage view={recordsIndexView(getDb())} />;
}
