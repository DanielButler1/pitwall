import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircuitPage } from "@/components/pages/profiles";
import { getDb } from "@/lib/f1/server";
import { circuitView } from "@/lib/f1/views";
import { prebuild } from "@/lib/f1/static-params";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
	return prebuild.none();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	return { title: getDb().circuits.get((await params).id)?.fullName ?? "Circuit" };
}

export default async function Page({ params }: Props) {
	const view = circuitView(getDb(), (await params).id);
	if (!view) notFound();
	return <CircuitPage view={view} />;
}
