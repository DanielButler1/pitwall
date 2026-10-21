import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TeammatePairPage } from "@/components/pages/teammates";
import { getDb } from "@/lib/f1/server";
import { teammatePairView } from "@/lib/f1/teammates";

type Props = { params: Promise<{ a: string; b: string }> };

// 5,000-odd pairings: each is rendered on its first visit and cached from then on
export function generateStaticParams() {
	return [];
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
