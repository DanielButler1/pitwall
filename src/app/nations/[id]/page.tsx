import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NationPage } from "@/components/pages/entities";
import { getDb } from "@/lib/f1/server";
import { nationView } from "@/lib/f1/views";
import { staticParams } from "@/lib/f1/static-params";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
	return staticParams.nations();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	return { title: getDb().countries.get((await params).id)?.name ?? "Nation" };
}

export default async function Page({ params }: Props) {
	const view = nationView(getDb(), (await params).id);
	if (!view) notFound();
	return <NationPage view={view} />;
}
