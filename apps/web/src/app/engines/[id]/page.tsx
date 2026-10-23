import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SupplierPage } from "@/components/pages/entities";
import { getDb } from "@/lib/server";
import { engineView } from "@pitwall/core/f1/views";
import { prebuild } from "@/lib/static-params";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
	return prebuild.none();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	return { title: getDb().engines.get((await params).id)?.name ?? "Engine" };
}

export default async function Page({ params }: Props) {
	const view = engineView(getDb(), (await params).id);
	if (!view) notFound();
	return <SupplierPage view={view} />;
}
