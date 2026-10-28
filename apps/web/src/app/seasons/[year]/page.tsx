import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeasonPage } from "@/components/pages/season";
import { seasonProgression } from "@pitwall/core/f1/progression";
import { getDb, getFactIndex } from "@/lib/server";
import { seasonFacts } from "@pitwall/core/f1/race-facts";
import { seasonView } from "@pitwall/core/f1/views";
import { prebuild } from "@/lib/static-params";

type Props = { params: Promise<{ year: string }> };

export function generateStaticParams() {
	return prebuild.seasons();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	return { title: `${(await params).year} season` };
}

export default async function Page({ params }: Props) {
	const year = Number((await params).year);
	const view = seasonView(getDb(), year);
	if (!view) notFound();
	return <SeasonPage view={view} progression={seasonProgression(getDb(), year)} facts={seasonFacts(getDb(), getFactIndex(), year)} />;
}
