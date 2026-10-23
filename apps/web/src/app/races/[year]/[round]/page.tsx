import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RacePage } from "@/components/pages/race";
import { getDb } from "@/lib/server";
import { raceView } from "@pitwall/core/f1/views";
import { prebuild } from "@/lib/static-params";

type Props = { params: Promise<{ year: string; round: string }> };

export function generateStaticParams() {
	return prebuild.races();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { year, round } = await params;
	const view = raceView(getDb(), Number(year), Number(round));
	return { title: view ? `${year} ${view.race.name} Grand Prix` : "Race" };
}

export default async function Page({ params }: Props) {
	const { year, round } = await params;
	const view = raceView(getDb(), Number(year), Number(round));
	if (!view) notFound();
	// the lap chart and pit stops fetch /data/laps/<raceId>.json when their tab opens, keeping the page small
	return <RacePage view={view} labHref={`/lab?race=${view.raceId}`} />;
}
