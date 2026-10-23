import type { Metadata } from "next";
import { CircuitsPage } from "@/components/pages/profiles";
import { getDb } from "@/lib/server";
import { circuitsView } from "@pitwall/core/f1/views";

export const metadata: Metadata = { title: "Circuits" };

export default function Page() {
	return <CircuitsPage view={circuitsView(getDb())} />;
}
