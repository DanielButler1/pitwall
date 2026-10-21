// Round-number anniversaries of notable events (built by milestones.ts). Kept
// free of the stats code so client components can pick the upcoming ones for
// the visitor's own "today" (pages are pre-rendered).

import type { DriverRef, RaceRef, TeamRef } from "./views.ts";

export type AnniversaryKind = "first-race" | "title" | "team-title" | "first-win" | "team-first-win" | "debut" | "birth";

export type AnniversaryEvent = {
	kind: AnniversaryKind;
	/** ISO date of the event. */
	date: string;
	driver: DriverRef | null;
	team: TeamRef | null;
	race: RaceRef | null;
	/** Births: the driver has died, so it is "born N years ago" rather than a birthday. */
	died?: boolean;
};

export type UpcomingAnniversary = AnniversaryEvent & {
	years: number;
	/** ISO date of the anniversary itself. */
	on: string;
	/** Days from today (0 = today). */
	inDays: number;
};

const DAY = 86400000;

/** Anniversaries worth marking: every 10 years and the 25th/75th; birthdays only at round ages, and centenaries for those no longer with us. */
export function isRoundAnniversary(e: Pick<AnniversaryEvent, "kind" | "died">, years: number): boolean {
	if (years < 10) return false;
	if (e.kind === "birth") return e.died ? years % 100 === 0 : years % 10 === 0;
	return years % 10 === 0 || years % 25 === 0;
}

/** Events whose round anniversary falls within `days` of `today` (YYYY-MM-DD), soonest first. */
export function upcomingAnniversaries(events: AnniversaryEvent[], today: string, days = 30): UpcomingAnniversary[] {
	const t = Date.parse(today.slice(0, 10) + "T00:00:00Z");
	const year = new Date(t).getUTCFullYear();
	const out: UpcomingAnniversary[] = [];
	for (const e of events) {
		const md = e.date.slice(5, 10);
		for (const y of [year, year + 1]) {
			const on = `${y}-${md}`;
			const at = Date.parse(on + "T00:00:00Z");
			// 29 February only has anniversaries in leap years
			if (Number.isNaN(at) || new Date(at).toISOString().slice(5, 10) !== md) continue;
			const inDays = Math.round((at - t) / DAY);
			if (inDays < 0 || inDays > days) continue;
			const years = y - Number(e.date.slice(0, 4));
			if (isRoundAnniversary(e, years)) out.push({ ...e, years, on, inDays });
		}
	}
	const weight: Record<AnniversaryKind, number> = { "first-race": 0, title: 1, "team-title": 2, "first-win": 3, "team-first-win": 4, debut: 5, birth: 6 };
	return out.sort((a, b) => a.inDays - b.inDays || weight[a.kind] - weight[b.kind] || a.date.localeCompare(b.date));
}

export const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th"));
