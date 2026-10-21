import type { Metadata } from "next";
import { DiaryIndexPage } from "@/components/pages/diary";
import { diaryIndexView } from "@/lib/f1/diary";
import { getDb } from "@/lib/f1/server";

export const metadata: Metadata = { title: "Diary" };

export default function Page() {
	return <DiaryIndexPage view={diaryIndexView(getDb())} />;
}
