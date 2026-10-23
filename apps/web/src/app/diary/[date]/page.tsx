import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiaryPage } from "@/components/pages/diary";
import { MONTHS, diaryView, parseDiarySlug } from "@pitwall/core/f1/diary";
import { getDb } from "@/lib/server";
import { prebuild } from "@/lib/static-params";

type Props = { params: Promise<{ date: string }> };

export function generateStaticParams() {
	return prebuild.none();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const d = parseDiarySlug((await params).date);
	return { title: d ? `${d.day} ${MONTHS[d.month - 1]}` : "Diary" };
}

export default async function Page({ params }: Props) {
	const d = parseDiarySlug((await params).date);
	if (!d) notFound();
	return <DiaryPage view={diaryView(getDb(), d.month, d.day)} />;
}
