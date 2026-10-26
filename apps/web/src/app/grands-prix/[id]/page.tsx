import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GrandPrixPage } from "@/components/pages/entities";
import { describe, getDb } from "@/lib/server";
import { grandPrixView } from "@pitwall/core/f1/views";
import { prebuild } from "@/lib/static-params";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
	return prebuild.none();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	return { title: getDb().grandsPrix.get(id)?.fullName ?? "Grand Prix", description: describe("grandPrix", id) };
}

export default async function Page({ params }: Props) {
	const view = grandPrixView(getDb(), (await params).id);
	if (!view) notFound();
	return <GrandPrixPage view={view} />;
}
