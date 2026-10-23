import type { Metadata } from "next";
import { DiaryIndexPage } from "@/components/pages/diary";
import { diaryIndexView } from "@pitwall/core/f1/diary";
import { getDb } from "@/lib/server";

export const metadata: Metadata = { title: "Diary" };

export default function Page() {
	return <DiaryIndexPage view={diaryIndexView(getDb())} />;
}
