import type { Metadata } from "next";
import { SuppliersPage } from "@/components/pages/entities";
import { getDb } from "@/lib/f1/server";
import { enginesView } from "@/lib/f1/views";

export const metadata: Metadata = { title: "Engines" };

export default function Page() {
	return <SuppliersPage view={enginesView(getDb())} />;
}
