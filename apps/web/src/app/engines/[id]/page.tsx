import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SupplierPage } from "@/components/pages/entities";
import { describe, getDb } from "@/lib/server";
import { engineView } from "@pitwall/core/f1/views";
import { prebuild } from "@/lib/static-params";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
	return prebuild.none();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	return { title: getDb().engines.get(id)?.name ?? "Engine", description: describe("engine", id) };
}

export default async function Page({ params }: Props) {
	const view = engineView(getDb(), (await params).id);
	if (!view) notFound();
	return <SupplierPage view={view} />;
}
