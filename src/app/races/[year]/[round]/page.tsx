import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RacePage } from "@/components/pages/race";
import { getDb, getRaceLaps } from "@/lib/f1/server";
import { raceView } from "@/lib/f1/views";
import { staticParams } from "@/lib/f1/static-params";

type Props = { params: Promise<{ year: string; round: string }> };

export function generateStaticParams() {
	return staticParams.races();
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
	const laps = view.lapData ? getRaceLaps(view.raceId) : null;
	return <RacePage view={view} laps={laps} labHref={`/lab?race=${view.raceId}`} />;
}
