import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DriverPage } from "@/components/pages/profiles";
import { getDb } from "@/lib/server";
import { driverTeammatesView } from "@pitwall/core/f1/teammates";
import { driverView } from "@pitwall/core/f1/views";
import { prebuild } from "@/lib/static-params";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
	return prebuild.drivers();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	return { title: getDb().drivers.get((await params).id)?.name ?? "Driver" };
}

export default async function Page({ params }: Props) {
	const id = (await params).id;
	const view = driverView(getDb(), id);
	if (!view) notFound();
	return <DriverPage view={view} teammates={driverTeammatesView(getDb(), id)} />;
}
