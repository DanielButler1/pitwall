import type { Metadata } from "next";
import { GrandsPrixPage } from "@/components/pages/entities";
import { getDb } from "@/lib/f1/server";
import { grandsPrixView } from "@/lib/f1/views";

export const metadata: Metadata = { title: "Grands Prix" };

export default function Page() {
	return <GrandsPrixPage view={grandsPrixView(getDb())} />;
}
