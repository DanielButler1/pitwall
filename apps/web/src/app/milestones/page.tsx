import type { Metadata } from "next";
import { MilestonesPage } from "@/components/pages/milestones";
import { milestonesView } from "@pitwall/core/f1/milestones";
import { getDb } from "@/lib/server";

export const metadata: Metadata = { title: "Milestone watch" };

export default function Page() {
	return <MilestonesPage view={milestonesView(getDb())} />;
}
