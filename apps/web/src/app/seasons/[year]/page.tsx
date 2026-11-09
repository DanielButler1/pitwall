import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeasonPage } from "@/components/pages/season";
import { seasonProgression } from "@pitwall/core/f1/progression";
import { describe, getDb, getFactIndex } from "@/lib/server";
import { seasonFacts } from "@pitwall/core/f1/race-facts";
import { seasonView } from "@pitwall/core/f1/views";
import { staticParams } from "@/lib/static-params";
import { staticOgMetadata } from "@/lib/static-og";

type Props = { params: Promise<{ year: string }> };

export function generateStaticParams() {
	return staticParams.seasons();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { year } = await params;
	return { title: `${year} season`, description: describe("season", year), ...staticOgMetadata("season", String(Number(year)), "A Formula 1 season on Pitwall") };
}

export default async function Page({ params }: Props) {
	const year = Number((await params).year);
	const view = seasonView(getDb(), year);
	if (!view) notFound();
	return <SeasonPage view={view} progression={seasonProgression(getDb(), year)} facts={seasonFacts(getDb(), getFactIndex(), year)} />;
}
