import type { Metadata } from "next";
import { PointsPage } from "@/components/pages/points";
import { pointsCompareView } from "@pitwall/core/f1/points-compare";
import { getDb } from "@/lib/server";

export const metadata: Metadata = { title: "Points systems" };

export default function Page() {
	return <PointsPage view={pointsCompareView(getDb())} />;
}
