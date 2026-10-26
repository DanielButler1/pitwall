import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConstructorPage } from "@/components/pages/profiles";
import { describe, getDb } from "@/lib/server";
import { constructorView } from "@pitwall/core/f1/views";
import { prebuild } from "@/lib/static-params";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
	return prebuild.constructors();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	return { title: getDb().constructors.get(id)?.name ?? "Constructor", description: describe("team", id) };
}

export default async function Page({ params }: Props) {
	const view = constructorView(getDb(), (await params).id);
	if (!view) notFound();
	return <ConstructorPage view={view} />;
}
