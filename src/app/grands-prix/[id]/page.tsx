import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GrandPrixPage } from "@/components/pages/entities";
import { getDb } from "@/lib/f1/server";
import { grandPrixView } from "@/lib/f1/views";
import { prebuild } from "@/lib/f1/static-params";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
	return prebuild.none();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	return { title: getDb().grandsPrix.get((await params).id)?.fullName ?? "Grand Prix" };
}

export default async function Page({ params }: Props) {
	const view = grandPrixView(getDb(), (await params).id);
	if (!view) notFound();
	return <GrandPrixPage view={view} />;
}
