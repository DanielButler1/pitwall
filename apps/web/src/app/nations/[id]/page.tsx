import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NationPage } from "@/components/pages/entities";
import { describe, getDb } from "@/lib/server";
import { nationView } from "@pitwall/core/f1/views";
import { prebuild } from "@/lib/static-params";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
	return prebuild.none();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	return { title: getDb().countries.get(id)?.name ?? "Nation", description: describe("nation", id) };
}

export default async function Page({ params }: Props) {
	const view = nationView(getDb(), (await params).id);
	if (!view) notFound();
	return <NationPage view={view} />;
}
