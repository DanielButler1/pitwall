import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SupplierPage } from "@/components/pages/entities";
import { getDb } from "@/lib/f1/server";
import { tyreView } from "@/lib/f1/views";
import { prebuild } from "@/lib/f1/static-params";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
	return prebuild.none();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	return { title: getDb().tyres.get((await params).id)?.name ?? "Tyres" };
}

export default async function Page({ params }: Props) {
	const view = tyreView(getDb(), (await params).id);
	if (!view) notFound();
	return <SupplierPage view={view} />;
}
