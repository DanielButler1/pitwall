import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GrandPrixPage } from "@/components/pages/entities";
import { getDb, getFactIndex } from "@/lib/server";
import { upcomingAbout, venueFacts } from "@pitwall/core/f1/race-facts";
import { grandPrixView } from "@pitwall/core/f1/views";
import { prebuild } from "@/lib/static-params";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
	return prebuild.none();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	return { title: getDb().grandsPrix.get((await params).id)?.fullName ?? "Grand Prix" };
}

export default async function Page({ params }: Props) {
	const view = grandPrixView(getDb(), (await params).id);
	if (!view) notFound();
	return <GrandPrixPage view={view} facts={venueFacts(getDb(), getFactIndex(), { grandPrixId: view.gp.id })} upcoming={upcomingAbout(getDb(), { grandPrixId: view.gp.id })} />;
}
