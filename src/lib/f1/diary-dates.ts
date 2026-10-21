// Diary date slugs, kept apart from diary.ts so client components can use them
// without pulling in the stats code.

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** "21-october" <-> { month: 10, day: 21 }. */
export const diarySlug = (month: number, day: number) => `${day}-${MONTHS[month - 1].toLowerCase()}`;
export function parseDiarySlug(slug: string): { month: number; day: number } | null {
	const m = /^(\d{1,2})-([a-z]+)$/.exec(slug.toLowerCase());
	if (!m) return null;
	const month = MONTHS.findIndex((x) => x.toLowerCase() === m[2]) + 1;
	const day = Number(m[1]);
	if (!month || day < 1 || day > DAYS_IN_MONTH[month - 1]) return null;
	return { month, day };
}
export const allDiaryDays = () => DAYS_IN_MONTH.flatMap((n, i) => Array.from({ length: n }, (_, d) => ({ month: i + 1, day: d + 1 })));
