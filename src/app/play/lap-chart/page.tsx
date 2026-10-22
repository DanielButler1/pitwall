import type { Metadata } from "next";
import { LapChartGame } from "@/components/play/lap-chart";

export const metadata: Metadata = {
	title: "Lap chart mystery",
	description: "A daily Formula 1 puzzle: name the race from its lap-by-lap position chart, with the drivers' names hidden, in six tries. Spend a try on a hint when you're stuck.",
};

export default function Page() {
	return <LapChartGame />;
}
