import type { Metadata } from "next";
import { SuppliersPage } from "@/components/pages/entities";
import { getDb } from "@/lib/f1/server";
import { tyresView } from "@/lib/f1/views";

export const metadata: Metadata = { title: "Tyres" };

export default function Page() {
	return <SuppliersPage view={tyresView(getDb())} />;
}
