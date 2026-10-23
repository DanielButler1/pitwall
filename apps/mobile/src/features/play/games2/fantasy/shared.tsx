// Fantasy helpers shared by its parts: money, the saved teams (same keys as the website's
// localStorage, in the app's store), and the per-round form chips.

import { memo } from "react";
import { View } from "react-native";
import { gameStore } from "@pitwall/core/game/daily";
import { DNF, DNS, DSQ, NC, type Pool, type Team } from "@pitwall/core/game/fantasy";
import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { num } from "@/lib/format";

/** "pitwall-fantasy:…", as the website saves them. */
export const fantasyStore = gameStore("fantasy");

export type Mode = "daily" | "free";
export type Saved = { team: Team; locked: boolean };
export type Best = Record<string, { score: number; pct: number; team: Team; date: string }>;

export const money = (n: number) => `${num(Math.round(n * 10) / 10)}M`;

/** A nation's flag code (the file keeps nations by id). */
export const nationFlag = (pool: Pool, nation: string | undefined) => (nation ? pool.data.nations[nation]?.[1] : undefined);

const finishText = (f: number | undefined) => (f == null ? "–" : f >= 1 ? String(f) : f === DNF ? "R" : f === DSQ ? "DQ" : f === NC ? "NC" : f === DNS ? "NS" : "–");
export const finishTone = (f: number | undefined) =>
	f == null
		? "text-muted-foreground/50"
		: f === 1
			? "bg-gold/30 text-foreground"
			: f === 2
				? "bg-silver/35 text-foreground"
				: f === 3
					? "bg-bronze/30 text-foreground"
					: f >= 4 && f <= 10
						? "bg-muted text-foreground"
						: f === DNF || f === DSQ
							? "bg-destructive/10 text-destructive"
							: "text-muted-foreground";

/** A small chip for one result: finishing position, R retired, NS didn't start, – not entered. */
export function FinishChip({ f, label }: { f: number | undefined; label?: string }) {
	const tone = finishTone(f);
	const bg = tone.split(" ").filter((c) => c.startsWith("bg-"));
	const fg = tone.split(" ").filter((c) => c.startsWith("text-"));
	return (
		<View className={cn("h-4 min-w-5 items-center justify-center rounded-[4px] px-0.5", bg)}>
			<Text className={cn("text-[10px] leading-[12px] font-semibold tabular-nums", fg)}>{label ?? finishText(f)}</Text>
		</View>
	);
}

/** One chip per round of the season. */
export const FormLine = memo(function FormLine({ pool, year, finishes }: { pool: Pool; year: number; finishes: Map<number, number> }) {
	const rounds = pool.data.races[year] ?? [];
	return (
		<View className="flex-row flex-wrap gap-0.5" accessible accessibilityLabel={`Form: ${rounds.map(([r]) => finishText(finishes.get(r))).join(", ")}`}>
			{rounds.map(([round]) => (
				<FinishChip key={round} f={finishes.get(round)} />
			))}
		</View>
	);
});
