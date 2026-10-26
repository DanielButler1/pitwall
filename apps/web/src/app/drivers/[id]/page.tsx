import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DriverPage } from "@/components/pages/profiles";
import { describe, getDb } from "@/lib/server";
import { driverTeammatesView } from "@pitwall/core/f1/teammates";
import { driverView } from "@pitwall/core/f1/views";
import { prebuild } from "@/lib/static-params";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
	return prebuild.drivers();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	return { title: getDb().drivers.get(id)?.name ?? "Driver", description: describe("driver", id) };
}

export default async function Page({ params }: Props) {
	const id = (await params).id;
	const view = driverView(getDb(), id);
	if (!view) notFound();
	return <DriverPage view={view} teammates={driverTeammatesView(getDb(), id)} />;
}
