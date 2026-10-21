"use client";

// Today's date is only known in the browser (pages are pre-rendered), so this
// renders after mount.

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { MONTHS, diarySlug } from "@/lib/f1/diary-dates";
import { href } from "./f1";
import { ULink } from "./universe-link";
import { buttonVariants } from "./ui/button";

function useToday() {
	const [today, setToday] = useState<{ month: number; day: number } | null>(null);
	useEffect(() => {
		const d = new Date();
		setToday({ month: d.getMonth() + 1, day: d.getDate() });
	}, []);
	return today;
}

export function DiaryTodayButton() {
	const today = useToday();
	if (!today) return null;
	return (
		<ULink href={href.diary(diarySlug(today.month, today.day))} className={cn(buttonVariants({ size: "lg" }))}>
			<CalendarDays data-icon="inline-start" />
			Today, {today.day} {MONTHS[today.month - 1]}
		</ULink>
	);
}

