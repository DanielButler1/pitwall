import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeasonPage } from "@/components/pages/season";
import { seasonProgression } from "@/lib/f1/progression";
import { getDb } from "@/lib/f1/server";
import { seasonView } from "@/lib/f1/views";
import { prebuild } from "@/lib/f1/static-params";

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
	return <SeasonPage view={view} progression={seasonProgression(getDb(), year)} />;
}
