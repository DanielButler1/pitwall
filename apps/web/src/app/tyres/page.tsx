import type { Metadata } from "next";
import { SuppliersPage } from "@/components/pages/entities";
import { getDb } from "@/lib/server";
import { tyresView } from "@pitwall/core/f1/views";

export const metadata: Metadata = { title: "Tyres" };

export default function Page() {
	return <SuppliersPage view={tyresView(getDb())} />;
}
