"use client";

// Phone layout of the diary calendar: one month at a time, starting on the
// visitor's current month (known only after mount; pages are pre-rendered).

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MONTHS } from "@/lib/f1/diary-dates";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

const OPTIONS = MONTHS.map((label, i) => ({ value: String(i), label }));

// Today's calendar cell (`data-diary-day="m-d"`) gets `data-today` for its highlight.
function markToday() {
	const d = new Date();
	document.querySelectorAll(`[data-diary-day="${d.getMonth() + 1}-${d.getDate()}"]`).forEach((el) => el.setAttribute("data-today", ""));
}

/** Highlights today in the server-rendered calendars. */
export function DiaryTodayMark() {
	useEffect(markToday, []);
	return null;
}

export function DiaryMonthPager({ months, className }: { months: React.ReactNode[]; className?: string }) {
	const [month, setMonth] = useState(0);
	useEffect(() => setMonth(new Date().getMonth()), []);
	useEffect(markToday, [month]);
	const step = (by: number) => setMonth((m) => (m + by + 12) % 12);
	return (
		<div className={cn("[&_[data-slot=card-header]]:hidden", className)}>
			<div className="mb-3 flex items-center gap-2">
				<Button variant="outline" size="icon-lg" aria-label="Previous month" onClick={() => step(-1)}>
					<ChevronLeft />
				</Button>
				<Select items={OPTIONS} value={String(month)} onValueChange={(v) => v != null && setMonth(Number(v))}>
					<SelectTrigger className="h-9 flex-1" aria-label="Month">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{OPTIONS.map((o) => (
							<SelectItem key={o.value} value={o.value}>
								{o.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button variant="outline" size="icon-lg" aria-label="Next month" onClick={() => step(1)}>
					<ChevronRight />
				</Button>
			</div>
			{months[month]}
		</div>
	);
}
