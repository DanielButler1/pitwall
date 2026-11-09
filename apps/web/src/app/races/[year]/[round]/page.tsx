import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RacePage } from "@/components/pages/race";
import { describe, getDb } from "@/lib/server";
import { raceView } from "@pitwall/core/f1/views";
import { factsFor, sprintFacts } from "@pitwall/core/f1/race-facts";
import { staticParams } from "@/lib/static-params";
import { staticOgMetadata } from "@/lib/static-og";

type Props = { params: Promise<{ year: string; round: string }> };

export function generateStaticParams() {
	return staticParams.races();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { year, round } = await params;
	const view = raceView(getDb(), Number(year), Number(round));
	return {
		title: view ? `${year} ${view.race.name} Grand Prix` : "Race",
		description: describe("race", `${year}-${round}`),
		...staticOgMetadata("race", `${Number(year)}-${Number(round)}`, "A Formula 1 race's result on Pitwall"),
	};
}

export default async function Page({ params }: Props) {
	const { year, round } = await params;
	const view = raceView(getDb(), Number(year), Number(round));
	if (!view) notFound();
	// the lap chart and pit stops fetch /data/laps/<raceId>.json when their tab opens, keeping the page small
	return <RacePage view={view} labHref={`/lab?race=${view.raceId}`} facts={{ ...factsFor(getDb(), view.raceId), sprint: sprintFacts(getDb(), view.raceId) }} />;
}
