// After locking in: the total, rating and share of random teams beaten, the benchmark's
// distribution, and the breakdown per pick (tap a pick for its races, round by round).

import { ChevronDown, ChevronRight, Share2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { percentile, rating, scoreTeam, shareText, teamCost, type Challenge, type Pool, type RaceScore, type Team } from "@pitwall/core/game/fantasy";
import { Flag, Stat, StatGrid } from "@/components/f1";
import { Button, Icon, Section, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { num } from "@/lib/format";
import { href, useOpen } from "@/lib/links";
import { shareResult } from "@/features/play/kit";
import { money, nationFlag } from "./shared";

type PickRow = { id: string; flag: string | undefined; name: string; year: number; sub: string; price: number; points: number; season: number; captain: boolean; races: RaceScore[]; rounds: number; driver: boolean };

export function Results({ pool, challenge, team, benchmark }: { pool: Pool; challenge: Challenge; team: Team; benchmark: number[] | null }) {
	const { data } = pool;
	const result = useMemo(() => scoreTeam(pool, team), [pool, team]);
	const pct = benchmark ? percentile(benchmark, result.total) : null;
	const [open, setOpen] = useState<string | null>(null);

	const share = () => {
		const date = (challenge as { date?: string }).date;
		void shareResult(shareText(pool, team, result, pct ?? 0, challenge.title + (date ? ` (${date})` : "")));
	};

	const rows: PickRow[] = [
		...result.drivers.map((d) => ({
			id: d.season.id,
			flag: nationFlag(pool, data.drivers[d.season.d][1]),
			name: data.drivers[d.season.d][0],
			year: d.season.y,
			sub: data.teams[d.season.t[0]]?.[0] ?? "",
			price: d.season.p,
			points: d.points,
			season: d.score.total,
			captain: d.captain,
			races: d.score.races,
			rounds: d.score.rounds,
			driver: true,
		})),
		...(result.constructor
			? [
					{
						id: result.constructor.season.id,
						flag: nationFlag(pool, data.teams[result.constructor.season.t][1]),
						name: data.teams[result.constructor.season.t][0],
						year: result.constructor.season.y,
						sub: "Constructor",
						price: result.constructor.season.p,
						points: result.constructor.score.total,
						season: result.constructor.score.total,
						captain: false,
						races: result.constructor.score.races,
						rounds: result.constructor.score.rounds,
						driver: false,
					},
				]
			: []),
	];

	return (
		<View className="mt-4">
			<StatGrid>
				<Stat label="Total" value={`${num(result.total)} pts`} />
				<Stat label="Rating" value={pct == null ? "…" : rating(pct).label} />
				<Stat label="Beats random teams" value={pct == null ? "…" : `${num(Math.round(pct))}%`} />
				<Stat label="Spent" value={money(teamCost(pool, team))} />
			</StatGrid>
			{benchmark && benchmark.length > 0 ? <Distribution sorted={benchmark} score={result.total} /> : null}
			<Section
				title="Breakdown"
				description="Season score = average points per race × 20 (rounds the pick missed count as zero). Tap a pick for its races."
				action={<Button label="Share" icon={Share2} variant="outline" size="sm" onPress={share} />}
			>
				<View className="mt-1">
					{rows.map((r) => (
						<View key={r.id} className="border-b border-border">
							<Pressable accessibilityRole="button" accessibilityState={{ expanded: open === r.id }} onPress={() => setOpen(open === r.id ? null : r.id)} className="flex-row items-center gap-2 px-4 py-3 active:bg-accent">
								<Icon icon={open === r.id ? ChevronDown : ChevronRight} tone="muted" size={16} />
								<View className="flex-1 gap-0.5">
									<View className="flex-row items-center gap-1.5">
										<Flag code={r.flag} />
										<Text variant="label" numberOfLines={1} className="shrink">
											{r.name}
										</Text>
										<Text variant="muted" className="tabular-nums">
											{r.year}
										</Text>
									</View>
									<Text variant="caption" numberOfLines={1}>
										{r.captain ? "Captain ×2 · " : ""}{r.sub} · {money(r.price)} · {num(Math.round((r.races.reduce((a, x) => a + x.total, 0) / r.rounds) * 10) / 10)} per race · season {num(r.season)}
									</Text>
								</View>
								<Text variant="label" className="tabular-nums">
									{num(r.points)}
								</Text>
							</Pressable>
							{open === r.id ? <RaceBreakdown pool={pool} year={r.year} races={r.races} driver={r.driver} /> : null}
						</View>
					))}
					<View className="flex-row items-center justify-between px-4 py-3">
						<Text variant="label">Total · {money(teamCost(pool, team))}</Text>
						<Text variant="label" className="tabular-nums">
							{num(result.total)}
						</Text>
					</View>
				</View>
			</Section>
		</View>
	);
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Each round of the season: the total, and what made it up (finish, places, pole, fastest lap, best car, penalty). */
function RaceBreakdown({ pool, year, races, driver }: { pool: Pool; year: number; races: RaceScore[]; driver: boolean }) {
	const open = useOpen();
	const byRound = new Map(races.map((r) => [r.round, r]));
	const seasonRounds = pool.data.races[year] ?? [];
	return (
		<View className="bg-muted/40 pb-2">
			{seasonRounds.map(([round, name, cc]) => {
				const r = byRound.get(round);
				const parts: string[] = [];
				if (r) {
					if (r.finish) parts.push(`finish ${signed(r.finish)}`);
					if (driver && r.gained) parts.push(`places ${signed(r.gained)}`);
					if (r.pole) parts.push(`pole ${signed(r.pole)}`);
					if (r.fastestLap) parts.push(`fastest lap ${signed(r.fastestLap)}`);
					if (driver && r.teammate) parts.push(`best car ${signed(r.teammate)}`);
					if (r.penalty) parts.push(`penalty ${signed(r.penalty)}`);
				}
				return (
					<Pressable key={round} accessibilityRole="link" onPress={() => open(href.race({ year, round }))} className="flex-row items-start gap-2 px-4 py-2 active:bg-accent">
						<View className="flex-1">
							<View className="flex-row items-center gap-1.5">
								<Flag code={cc} className="text-[13px]" />
								<Text variant="small" numberOfLines={1}>
									{name}
								</Text>
							</View>
							<Text variant="caption">{r ? parts.join(" · ") || "No points" : "Not entered"}</Text>
						</View>
						{r ? (
							<Text variant="small" className={cn("font-semibold tabular-nums", r.total < 0 ? "text-destructive" : r.total === 0 ? "text-muted-foreground" : "text-foreground")}>
								{r.total === 0 ? "·" : signed(r.total)}
							</Text>
						) : null}
					</Pressable>
				);
			})}
		</View>
	);
}

/** Where the score sits among the random valid teams. */
function Distribution({ sorted, score }: { sorted: number[]; score: number }) {
	const bins = 30;
	const lo = sorted[0];
	const hi = Math.max(sorted[sorted.length - 1], score);
	const width = (hi - lo) / bins || 1;
	const counts = Array.from({ length: bins }, () => 0);
	for (const v of sorted) counts[Math.min(bins - 1, Math.floor((v - lo) / width))]++;
	const max = Math.max(...counts);
	const at = Math.min(bins - 1, Math.max(0, Math.floor((score - lo) / width)));
	return (
		<Section title="Against random teams" description={`Your score against ${num(sorted.length)} random valid teams under the same rules`}>
			<View className="px-4">
				<View className="mt-2 h-20 flex-row items-end gap-px" accessible accessibilityLabel={`Your score of ${num(score)} beats ${num(Math.round(percentile(sorted, score)))}% of random teams`}>
					{counts.map((c, i) => (
						<Bar key={i} height={Math.max(2, (c / max) * 100)} tone={i === at ? "bg-primary" : i < at ? "bg-primary/25" : "bg-muted"} />
					))}
				</View>
				<View className="mt-1.5 flex-row justify-between">
					<Text variant="caption" className="tabular-nums">
						{num(lo)}
					</Text>
					<Text variant="caption" className="tabular-nums">
						median {num(sorted[Math.floor(sorted.length / 2)])}
					</Text>
					<Text variant="caption" className="tabular-nums">
						{num(hi)}
					</Text>
				</View>
			</View>
		</Section>
	);
}

function Bar({ height, tone }: { height: number; tone: string }) {
	return <View className={cn("flex-1 rounded-t-[2px]", tone)} style={{ height: `${height}%` }} />;
}
