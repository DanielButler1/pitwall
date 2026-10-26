import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeasonPage } from "@/components/pages/season";
import { seasonProgression } from "@pitwall/core/f1/progression";
import { describe, getDb } from "@/lib/server";
import { seasonView } from "@pitwall/core/f1/views";
import { prebuild } from "@/lib/static-params";

type Props = { params: Promise<{ year: string }> };

export function generateStaticParams() {
	return prebuild.seasons();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { year } = await params;
	return { title: `${year} season`, description: describe("season", year) };
}

export default async function Page({ params }: Props) {
	const year = Number((await params).year);
	const view = seasonView(getDb(), year);
	if (!view) notFound();
	return <SeasonPage view={view} progression={seasonProgression(getDb(), year)} />;
}
