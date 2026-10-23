"use client";

// "in 3 days" for a race date: today is only known in the browser (pages are
// pre-rendered), so this renders after mount.

import { useEffect, useState } from "react";

export function DaysUntil({ date }: { date: string }) {
	const [days, setDays] = useState<number | null>(null);
	useEffect(() => {
		const now = new Date();
		const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
		setDays(Math.round((Date.parse(date + "T00:00:00Z") - today) / 86_400_000));
	}, [date]);
	if (days == null || days < 0) return null;
	return <span className="text-foreground font-medium">{days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}</span>;
}
