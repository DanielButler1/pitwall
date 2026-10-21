import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConstructorPage } from "@/components/pages/profiles";
import { getDb } from "@/lib/f1/server";
import { constructorView } from "@/lib/f1/views";
import { staticParams } from "@/lib/f1/static-params";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
	return staticParams.constructors();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	return { title: getDb().constructors.get((await params).id)?.name ?? "Constructor" };
}

export default async function Page({ params }: Props) {
	const view = constructorView(getDb(), (await params).id);
	if (!view) notFound();
	return <ConstructorPage view={view} />;
}
