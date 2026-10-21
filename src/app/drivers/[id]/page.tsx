import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DriverPage } from "@/components/pages/profiles";
import { getDb } from "@/lib/f1/server";
import { driverTeammatesView } from "@/lib/f1/teammates";
import { driverView } from "@/lib/f1/views";
import { staticParams } from "@/lib/f1/static-params";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
	return staticParams.drivers();
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
