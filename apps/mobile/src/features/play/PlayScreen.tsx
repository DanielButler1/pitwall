// The Play tab: every game, with today's progress read from the play log and each game's saved
// stats (core's gameStore), refreshed whenever the tab comes back into view.

import { useFocusEffect } from "expo-router";
import { CircleCheck, Flame } from "lucide-react-native";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { currentStreak, emptyStats, playStreak, readPlayLog, type GameStats } from "@pitwall/core/game/daily";
import { Page, Stat, StatGrid, TabScreen } from "@/components/f1";
import { Icon, Row, Section, Text } from "@/components/ui";
import { plural } from "@/lib/format";
import { useOpen } from "@/lib/links";
import { kv } from "@/lib/storage";
import { DAILY, MORE, type Game } from "./games";
import { Countdown, useToday } from "./kit";

/** A game's best current streak across its variants (e.g. guess's Modern and All time). */
function gameStreaks(today: number): Map<string, number> {
	const best = new Map<string, number>();
	let keys: string[] = [];
	try {
		keys = kv.getAllKeysSync();
	} catch {
		return best;
	}
	for (const g of DAILY) {
		const prefix = `pitwall-${g.id}:stats`;
		for (const key of keys) {
			if (!key.startsWith(prefix)) continue;
			try {
				const stats: GameStats = { ...emptyStats(0), ...JSON.parse(kv.getItemSync(key) ?? "{}") };
				best.set(g.id, Math.max(best.get(g.id) ?? 0, currentStreak(stats, today)));
			} catch {
				// a damaged save counts as no streak
			}
		}
	}
	return best;
}

type Progress = { day: number; done: Set<string>; streaks: Map<string, number>; streak: number };

function readProgress(today: number): Progress {
	const log = readPlayLog();
	return { day: today, done: new Set(log.find(([d]) => d === today)?.[1] ?? []), streaks: gameStreaks(today), streak: playStreak(log, today) };
}

export function PlayScreen() {
	const open = useOpen();
	const { today, rollover } = useToday();
	const [progress, setProgress] = useState<Progress>(() => readProgress(today));
	useFocusEffect(useCallback(() => setProgress(readProgress(today)), [today]));
	const current = progress.day === today ? progress : readProgress(today);
	const doneCount = DAILY.filter((g) => current.done.has(g.id)).length;

	return (
		<TabScreen title="Play">
			<Page>
				<Text variant="muted" className="px-4 pt-1">
					Games built on every Formula 1 season since 1950. New daily puzzles at midnight UTC, the same for everyone.
				</Text>
				<StatGrid className="mt-4">
					<Stat label="Today's puzzles" value={`${doneCount} of ${DAILY.length}`} />
					<Stat
						label="Daily streak"
						value={
							<View className="flex-row items-center gap-1.5">
								<Icon icon={Flame} tone={current.streak ? "warning" : "muted"} size={20} />
								<Text variant="title" className="tabular-nums">
									{plural(current.streak, "day")}
								</Text>
							</View>
						}
					/>
				</StatGrid>
				<Countdown onRollover={rollover} label="New puzzles in" className="mt-2" />

				<Section title="Daily puzzles">
					{DAILY.map((g, i) => (
						<GameRow key={g.id} game={g} done={current.done.has(g.id)} streak={current.streaks.get(g.id) ?? 0} last={i === DAILY.length - 1} onPress={() => open(g.href)} />
					))}
				</Section>

				<Section title="More games">
					{MORE.map((g, i) => (
						<GameRow key={g.id} game={g} tag={g.tag} last={i === MORE.length - 1} onPress={() => open(g.href)} />
					))}
				</Section>
			</Page>
		</TabScreen>
	);
}

function GameRow({ game: g, done, streak = 0, tag, last, onPress }: { game: Game; done?: boolean; streak?: number; tag?: string; last: boolean; onPress: () => void }) {
	const status = done ? "Done today" : tag;
	return (
		<Row
			title={g.title}
			subtitle={g.description}
			last={last}
			onPress={onPress}
			leading={
				<View className="h-10 w-10 items-center justify-center rounded-md bg-primary/10">
					<Icon icon={g.icon} tone="primary" size={20} />
				</View>
			}
			trailing={
				done ? (
					<View className="flex-row items-center gap-1">
						<Icon icon={CircleCheck} tone="success" size={16} />
						<Text variant="caption" className="font-semibold text-success">
							{status}
						</Text>
					</View>
				) : streak > 1 ? (
					<View className="flex-row items-center gap-0.5" accessibilityLabel={`${streak}-day streak`}>
						<Icon icon={Flame} tone="warning" size={16} />
						<Text variant="caption" className="font-semibold text-foreground tabular-nums">
							{streak}
						</Text>
					</View>
				) : tag ? (
					<Text variant="caption">{tag}</Text>
				) : null
			}
		/>
	);
}
