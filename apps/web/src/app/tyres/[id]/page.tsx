import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SupplierPage } from "@/components/pages/entities";
import { describe, getDb } from "@/lib/server";
import { tyreView } from "@pitwall/core/f1/views";
import { prebuild } from "@/lib/static-params";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
	return prebuild.none();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	return { title: getDb().tyres.get(id)?.name ?? "Tyres", description: describe("tyre", id) };
}

export default async function Page({ params }: Props) {
	const view = tyreView(getDb(), (await params).id);
	if (!view) notFound();
	return <SupplierPage view={view} />;
}
