import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TeammatePairPage } from "@/components/pages/teammates";
import { getDb } from "@/lib/server";
import { staticParams } from "@/lib/static-params";
import { teammatePairView } from "@pitwall/core/f1/teammates";

type Props = { params: Promise<{ a: string; b: string }> };

// Real team-mates are a finite archive, just like the races and driver profiles.
export const dynamicParams = false;

export function generateStaticParams() {
	return staticParams.teammates();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { a, b } = await params;
	const db = getDb();
	const name = (id: string) => db.drivers.get(decodeURIComponent(id))?.name ?? id;
	return { title: `${name(a)} vs ${name(b)}` };
}

export default async function Page({ params }: Props) {
	const { a, b } = await params;
	const view = teammatePairView(getDb(), decodeURIComponent(a), decodeURIComponent(b));
	if (!view) notFound();
	return <TeammatePairPage view={view} />;
}
