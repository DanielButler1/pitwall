import type { Metadata } from "next";
import { DriversPage } from "@/components/pages/people";
import { getDb } from "@/lib/f1/server";
import { driversView } from "@/lib/f1/views";

export const metadata: Metadata = { title: "Drivers" };

export default function Page() {
	return <DriversPage view={driversView(getDb())} />;
}
