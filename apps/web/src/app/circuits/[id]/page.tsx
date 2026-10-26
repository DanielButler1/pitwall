import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircuitPage } from "@/components/pages/profiles";
import { describe, getDb } from "@/lib/server";
import { circuitView } from "@pitwall/core/f1/views";
import { prebuild } from "@/lib/static-params";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
	return prebuild.none();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	return { title: getDb().circuits.get(id)?.fullName ?? "Circuit", description: describe("circuit", id) };
}

export default async function Page({ params }: Props) {
	const view = circuitView(getDb(), (await params).id);
	if (!view) notFound();
	return <CircuitPage view={view} />;
}
