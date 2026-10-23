import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecordCategoryPage } from "@/components/pages/records";
import { findRecord, recordCategoryView } from "@/lib/f1/records";
import { getDb } from "@/lib/f1/server";
import { prebuild } from "@/lib/f1/static-params";

type Props = { params: Promise<{ slug: string[] }> };

export function generateStaticParams() {
	return prebuild.none();
}

const idOf = (slug: string[]) => slug.map(decodeURIComponent).join("/");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const meta = findRecord(idOf((await params).slug));
	return { title: meta ? `${meta.family}: ${meta.title} | Records` : "Records" };
}

export default async function Page({ params }: Props) {
	const view = recordCategoryView(getDb(), idOf((await params).slug));
	if (!view) notFound();
	return <RecordCategoryPage view={view} />;
}
