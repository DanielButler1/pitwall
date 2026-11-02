import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecordCategoryPage } from "@/components/pages/records";
import { findRecord, recordCategoryView } from "@pitwall/core/f1/records";
import { OG_SIZE } from "@/lib/og-image";
import { getDb } from "@/lib/server";
import { prebuild } from "@/lib/static-params";

type Props = { params: Promise<{ slug: string[] }> };

export function generateStaticParams() {
	return prebuild.none();
}

const idOf = (slug: string[]) => slug.map(decodeURIComponent).join("/");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const meta = findRecord(idOf(slug));
	if (!meta) return { title: "Records" };
	const title = `${meta.family}: ${meta.title} | Records`;
	return {
		title,
		// its share picture is drawn by src/app/og/records (an opengraph-image file can't follow a catch-all segment);
		// this replaces the layout's openGraph, so its fields are repeated
		openGraph: { siteName: "Pitwall", type: "website", images: [{ url: `/og/records/${slug.join("/")}`, ...OG_SIZE, alt: `${title} on Pitwall` }] },
	};
}

export default async function Page({ params }: Props) {
	const view = recordCategoryView(getDb(), idOf((await params).slug));
	if (!view) notFound();
	return <RecordCategoryPage view={view} />;
}
