import type { Metadata } from "next";
import { DriversPage } from "@/components/pages/people";
import { getDb } from "@/lib/server";
import { driversView } from "@pitwall/core/f1/views";

export const metadata: Metadata = { title: "Drivers" };

export default function Page() {
	return <DriversPage view={driversView(getDb())} />;
}
