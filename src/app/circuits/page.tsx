import type { Metadata } from "next";
import { CircuitsPage } from "@/components/pages/profiles";
import { getDb } from "@/lib/f1/server";
import { circuitsView } from "@/lib/f1/views";

export const metadata: Metadata = { title: "Circuits" };

export default function Page() {
	return <CircuitsPage view={circuitsView(getDb())} />;
}
