// "Lap chart mystery" (/play/lap-chart): a race's lap-by-lap position chart with the drivers'
// names hidden. Hints (round, continent, decade, winner's team, winner, every driver) can be
// opened at any time, in any order; each uses one of the six tries. The pool is the website's
// /data/lap-chart.json and the chart an anonymous positions-only copy under a hashed name (so the
// answer never appears in a request), both fetched as the website does; the guesses use the race
// catalogue built on the device.

import { ChartLine, Lightbulb, Lock } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { gameStore, type GameMode } from "@pitwall/core/game/daily";
import {
	canTakeHint,
	compareLapGuess,
	dailyLapRace,
	decadeOf,
	LAP_CHART_FROM,
	LAP_HINTS,
	LAP_TILES,
	lapOver,
	lapReveal,
	lapShareText,
	mysteryLapsName,
	randomLapRace,
	roundsPerYear,
	slotsUsed,
	unpackLapChart,
	type LapChartFile,
	type LapHintKey,
	type LapRace,
	type MysteryLaps,
} from "@pitwall/core/game/lap-chart";
import { CONTINENT_NAME, continentOf, MAX_GUESSES, recordResult, type RgRace } from "@pitwall/core/game/race-guess";
import { Flag } from "@/components/f1";
import { Button, Icon, Section, Skeleton, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { webUrl } from "@/lib/config";
import { haptic } from "@/lib/haptics";
import { href, useOpen } from "@/lib/links";
import { GameError, GameHeader, GameLoading, GameScreen, ResultCard, shareResult, StatsPanel, useDataFile, useDbData, useToday } from "./kit";
import { MysteryChart } from "./lap-chart-view";
import { CoarseLegend, loadRaceCatalog, RaceBoard, RacePicker, RaceTitle } from "./race-shared";
import { GuessFooter } from "./shared";

const store = gameStore("lap-chart");
type Progress = { guesses: number[]; hints: LapHintKey[] };
const FRESH: Progress = { guesses: [], hints: [] };
const isHint = (k: unknown): k is LapHintKey => LAP_HINTS.some((h) => h.key === k);

export function LapChartScreen() {
	const open = useOpen();
	const catalog = useDbData(loadRaceCatalog);
	const poolFile = useDataFile("lap-chart.json", (f: LapChartFile) => unpackLapChart(f));
	const { today, rollover } = useToday();
	const [mode, setMode] = useState<GameMode>("daily");
	const [practice, setPractice] = useState<(Progress & { target: number }) | null>(null);
	const [statsOpen, setStatsOpen] = useState(false);
	const [version, setVersion] = useState(0);

	const data = useMemo(() => {
		if (!catalog.data || !poolFile.data) return null;
		const c = catalog.data;
		return {
			...c,
			pool: poolFile.data.races.filter((r) => c.byId.has(r.id)),
			lapById: poolFile.data.byId,
			pickable: c.races.filter((r) => r.year >= LAP_CHART_FROM),
			rounds: roundsPerYear(c.races),
		};
	}, [catalog.data, poolFile.data]);

	const daily = useMemo(() => {
		const saved = store.readDaily<Partial<Progress>>("daily", today);
		return { guesses: saved?.guesses ?? [], hints: (saved?.hints ?? []).filter(isHint) };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [today, version]);
	const stats = useMemo(
		() => store.readStats("stats", MAX_GUESSES),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[version],
	);

	// adjusting state while rendering: practice starts with a random chart the first time
	if (data && mode === "practice" && !practice) setPractice({ target: randomLapRace(data.pool).id, ...FRESH });

	const dailyLap = useMemo(() => (data ? dailyLapRace(data.pool, today) : null), [data, today]);
	const lapTarget: LapRace | null = !data ? null : mode === "daily" ? dailyLap : practice ? (data.lapById.get(practice.target) ?? null) : null;
	const target = lapTarget && data ? (data.byId.get(lapTarget.id) ?? null) : null;
	const laps = useDataFile(lapTarget ? `lap-chart/${mysteryLapsName(lapTarget.id)}.json` : null, (f: MysteryLaps) => f);

	const progress = mode === "daily" ? daily : (practice ?? FRESH);
	const { guesses, hints } = progress;
	const rows = useMemo(
		() => (data && target ? guesses.map((id) => data.byId.get(id)).filter((r) => !!r).map((r) => compareLapGuess(r, target)) : []),
		[data, target, guesses],
	);
	const won = rows.some((r) => r.correct);
	const over = lapOver(rows.length, hints.length, won);
	const used = slotsUsed(rows.length, hints.length);
	const reveal = lapReveal(hints, over);

	const update = (next: Progress) => {
		if (mode === "practice") setPractice((p) => p && { ...p, ...next });
		else {
			store.writeDaily("daily", today, next);
			setVersion((v) => v + 1);
		}
	};

	const guess = (r: RgRace) => {
		if (over || !target || guesses.includes(r.id)) return;
		const next = { guesses: [...guesses, r.id], hints };
		const right = r.id === target.id;
		haptic(right ? "success" : "error");
		if (mode === "daily" && lapOver(next.guesses.length, hints.length, right)) {
			store.write("stats", recordResult(store.readStats("stats", MAX_GUESSES), today, right, slotsUsed(next.guesses.length, hints.length)));
		}
		update(next);
	};

	const takeHint = (key: LapHintKey) => {
		if (over || hints.includes(key) || !canTakeHint(rows.length, hints.length)) return;
		haptic("selection");
		update({ guesses, hints: [...hints, key] });
	};

	const newPractice = () => data && setPractice({ target: randomLapRace(data.pool, Math.random, lapTarget?.id).id, ...FRESH });
	const hintNote = hints.length ? ` (${hints.length} ${hints.length === 1 ? "hint" : "hints"})` : " without a hint";
	const error = catalog.error || poolFile.isError;
	const retry = () => {
		catalog.retry();
		void poolFile.refetch();
	};

	return (
		<GameScreen title="Lap chart mystery" today={today} mode={mode} onStats={() => setStatsOpen(true)}>
			<GameHeader mode={mode} onModeChange={setMode}>
				{`Every day at midnight UTC, a new race's lap-by-lap position chart with the drivers' names hidden. Name the race in ${MAX_GUESSES} tries. Stuck? Open a hint whenever you like (the round, continent, decade, winner's team, winner or every driver), but each one uses up a try. Races from ${LAP_CHART_FROM} on.`}
			</GameHeader>

			{error ? (
				<GameError what="the races" onRetry={retry} />
			) : !data || !target || !lapTarget ? (
				<GameLoading />
			) : (
				<View className="mt-2">
					{over ? (
						<ResultCard
							won={won}
							status={won ? (used === 1 ? "Straight from the chart! Got it in 1." : `Got it in ${used} of ${MAX_GUESSES}${hintNote}.`) : "Out of tries. The mystery race was"}
							mode={mode}
							nextLabel={mode === "practice" ? "Next practice chart" : "Practice with a random chart"}
							countdownLabel="Next chart in"
							onShare={() => shareResult(lapShareText({ rows, hints, won, label: mode === "daily" ? `#${today + 1}` : "practice", url: webUrl("/play/lap-chart") }))}
							onNext={() => {
								setMode("practice");
								newPractice();
							}}
							onStats={() => setStatsOpen(true)}
							onRollover={rollover}
						>
							<RaceTitle race={target} />
							<Button label="See the lap chart on the race page" icon={ChartLine} variant="ghost" size="sm" className="self-start px-0" onPress={() => open(href.race(target))} />
						</ResultCard>
					) : (
						<HintPanel
							key={`${mode}:${lapTarget.id}`}
							race={target}
							lapRace={lapTarget}
							rounds={data.rounds.get(target.year) ?? target.round}
							taken={hints}
							left={MAX_GUESSES - used}
							canTake={canTakeHint(rows.length, hints.length)}
							onTake={takeHint}
						/>
					)}
					<View className="mt-4">
						{laps.isError ? (
							<GameError what="the lap chart" onRetry={() => void laps.refetch()} />
						) : !laps.data?.positions ? (
							<Skeleton className="mx-4 h-72" />
						) : (
							<MysteryChart key={lapTarget.id} file={laps.data} race={lapTarget} reveal={reveal} over={over} />
						)}
					</View>
					{!over ? (
						<View className="mt-4 gap-1">
							<RacePicker races={data.pickable} exclude={guesses} onPick={guess} placeholder={`Type a year (${LAP_CHART_FROM}+), Grand Prix or circuit`} />
							<GuessFooter
								text={`${MAX_GUESSES - used} ${MAX_GUESSES - used === 1 ? "try" : "tries"} left${hints.length ? ` · ${hints.length} used on ${hints.length === 1 ? "a hint" : "hints"}` : ""}`}
								practice={mode === "practice"}
								newLabel="New chart"
								onNew={newPractice}
							/>
						</View>
					) : null}
					<RaceBoard rows={rows} columns={LAP_TILES} />
					<CoarseLegend />
				</View>
			)}

			<StatsPanel
				open={statsOpen}
				onClose={() => setStatsOpen(false)}
				stats={stats}
				today={today}
				description="Daily puzzles. Tries count guesses and hints. Saved on this device."
				distributionTitle="Try distribution"
				distributionLabel="Wins by tries used (guesses plus hints)"
				highlight={mode === "daily" && won ? used - 1 : null}
			/>
		</GameScreen>
	);
}

/* ---------------------------------------------------------------- hints --- */

function HintPanel({
	race,
	lapRace,
	rounds,
	taken,
	left,
	canTake,
	onTake,
}: {
	race: RgRace;
	lapRace: LapRace;
	rounds: number;
	taken: LapHintKey[];
	left: number;
	canTake: boolean;
	onTake: (key: LapHintKey) => void;
}) {
	// a hint costs a try, so the first tap only arms it; a second tap opens it
	const [armed, setArmed] = useState<LapHintKey | null>(null);

	const value = (key: LapHintKey) => {
		const winner = lapRace.entries[0];
		switch (key) {
			case "round":
				return <Text variant="label">{`${race.round} of ${rounds}`}</Text>;
			case "continent":
				return <Text variant="label">{CONTINENT_NAME[continentOf(race.circuit.country) ?? ""] ?? "Unknown"}</Text>;
			case "decade":
				return <Text variant="label">{`The ${decadeOf(race.year)}`}</Text>;
			case "team":
				return <Text variant="label" numberOfLines={1}>{winner?.team.name ?? "Unknown"}</Text>;
			case "winner":
				return winner ? (
					<View className="flex-row items-center gap-1.5">
						<Flag code={winner.driver.flag} />
						<Text variant="label" numberOfLines={1} className="flex-1">
							{winner.driver.name}
						</Text>
					</View>
				) : (
					<Text variant="label">Unknown</Text>
				);
			case "drivers":
				return <Text variant="label">Named on the chart</Text>;
		}
	};

	return (
		<Section title="Hints" description={`Each hint uses 1 of your ${MAX_GUESSES} tries · ${left} left`} className="mt-3" action={<Icon icon={Lightbulb} tone="gold" size={18} />}>
			<View className="flex-row flex-wrap gap-1.5 px-4 pt-2">
				{LAP_HINTS.map((h) => {
					const open = taken.includes(h.key);
					if (open)
						return (
							<Animated.View key={h.key} entering={ZoomIn.duration(300)} style={{ flexBasis: "48%", flexGrow: 1 }}>
								<View className="min-h-16 justify-center gap-0.5 rounded-md border border-border bg-secondary px-3 py-2" accessible accessibilityLabel={`${h.label} hint`}>
									<Text variant="caption">{h.label}</Text>
									{value(h.key)}
								</View>
							</Animated.View>
						);
					const isArmed = armed === h.key;
					return (
						<Pressable
							key={h.key}
							disabled={!canTake}
							accessibilityRole="button"
							accessibilityLabel={isArmed ? `Reveal ${h.label}: uses 1 try. Press again to confirm.` : `${h.label} hint, locked. Uses 1 try.`}
							onPress={() => {
								if (isArmed) {
									setArmed(null);
									onTake(h.key);
								} else setArmed(h.key);
							}}
							style={{ flexBasis: "48%", flexGrow: 1 }}
							className={cn("min-h-16 justify-center gap-0.5 rounded-md border px-3 py-2 active:bg-accent disabled:opacity-50", isArmed ? "border-primary bg-primary/5" : "border-dashed border-border")}
						>
							<View className="flex-row items-center gap-1.5">
								<Icon icon={Lock} tone="muted" size={12} />
								<Text variant="small" className="flex-1 font-semibold">
									{h.label}
								</Text>
								<View className="rounded-full bg-muted px-1.5 py-px">
									<Text variant="caption" className="text-[10px] tabular-nums">
										−1 try
									</Text>
								</View>
							</View>
							<Text variant="caption" numberOfLines={2} className={isArmed ? "font-semibold text-link" : undefined}>
								{isArmed ? "Tap again to reveal" : canTake ? h.about : "Keep your last try"}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</Section>
	);
}
