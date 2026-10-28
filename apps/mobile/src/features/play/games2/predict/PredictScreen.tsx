// "Race prediction" (/play/predict): the website's components/play/predict.tsx for the phone.
// Tap starters on the grid to fill the top six in order; move picks up and down with the arrows
// (or tap one to take it out); optionally pick the fastest lap; lock in, then the reveal.

import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronRight, Dices, Timer, Trophy, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeInLeft, useReducedMotion } from "react-native-reanimated";
import { puzzleNumber, VERDICT_SQUARE } from "@pitwall/core/game/daily";
import {
	complete,
	isWin,
	MAX_POINTS,
	percentBucketLabel,
	percentBucketSrLabel,
	podium,
	POINTS,
	resultBucket,
	shareText,
	SLOTS,
	swap,
	toggle,
	WIN_POINTS,
	type Score,
} from "@pitwall/core/game/predict";
import { shortNames, type Entry, type RaceData, type RaceEntry } from "@pitwall/core/game/race-entries";
import { Flag } from "@/components/f1";
import { Button, Icon, IconButton, Section, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { webUrl } from "@/lib/config";
import { fmtDate, num } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { href, useOpen } from "@/lib/links";
import { GameError, GameHeader, GameLoading, GameScreen, LegendItem, ResultCard, shareResult, StatsPanel, useDbData, useToday, VERDICT_STYLE } from "@/features/play/kit";
import { raceLoader } from "../data";
import { NameLink, Sheet } from "../parts";
import { usePredict, type Pick } from "./usePredict";

const gridLabel = (e: Entry) => (e.grid ? `P${e.grid}` : "PL");

export function PredictScreen() {
	const { data, error, retry } = useDbData(raceLoader);
	const { today, rollover } = useToday();
	if (data) return <PredictGame key={today} data={data} today={today} rollover={rollover} />;
	return (
		<GameScreen title="Race prediction" today={today} mode="daily">
			{error ? <GameError what="the races" onRetry={retry} /> : <GameLoading />}
		</GameScreen>
	);
}

function PredictGame({ data, today, rollover }: { data: RaceData; today: number; rollover: () => void }) {
	const p = usePredict(data, today);
	const [statsOpen, setStatsOpen] = useState(false);
	const { mode, race, pick, result } = p;

	const share = () => {
		if (!race || !result) return;
		const label = mode === "daily" ? `#${puzzleNumber(today)}` : "practice";
		void shareResult(shareText({ label, race, result, url: webUrl("/play/predict") }));
	};

	return (
		<GameScreen title="Race prediction" today={today} mode={mode} onStats={() => setStatsOpen(true)}>
			<GameHeader mode={mode} onModeChange={p.setMode}>
				<Text variant="muted">
					A race from the archive every day at midnight UTC, the same for everyone. From the starting grid, predict the top six and who set the fastest lap, then
					see how it really went. One go a day, and don&apos;t look it up!
				</Text>
			</GameHeader>

			{!race ? (
				<GameLoading />
			) : (
				<>
					<RaceHeader race={race} linked={pick.done} />
					{result ? (
						<>
							<ResultCard
								won={isWin(result.total)}
								status={result.total === MAX_POINTS ? "A perfect prediction!" : isWin(result.total) ? "Good call. Here's how it finished:" : "Not quite. Here's how it finished:"}
								mode={mode}
								nextLabel={mode === "practice" ? "Next practice race" : "Practice with a random race"}
								countdownLabel="Next race in"
								onShare={share}
								onStats={() => setStatsOpen(true)}
								onNext={() => {
									p.setMode("practice");
									p.newPractice(race.id);
								}}
								onRollover={rollover}
							>
								<View className="flex-row flex-wrap items-baseline gap-x-3">
									<Text className="text-[36px] leading-[42px] font-bold tracking-tight text-foreground tabular-nums">
										{result.total}
										<Text className="text-[22px] text-muted-foreground">/{result.max}</Text>
									</Text>
									<Text className="text-[20px] tracking-widest" importantForAccessibility="no">
										{result.slots.map((s) => VERDICT_SQUARE[s.verdict]).join("")}
									</Text>
								</View>
								<Text variant="muted">
									{result.slots.filter((s) => s.verdict === "match").length} exact, {result.slots.filter((s) => s.points === POINTS.close).length} off by one
									{result.bonus.points ? ", and the fastest lap" : ""}.
								</Text>
							</ResultCard>
							<Reveal race={race} result={result} />
						</>
					) : (
						<Picker race={race} pick={pick} onChange={p.update} onNewRace={mode === "practice" ? () => p.newPractice(race.id) : undefined} />
					)}
					<Section title="Scoring">
						<View className="gap-2 px-4">
							<LegendItem verdict="match" icon={Check}>
								Exact: {POINTS.exact} pts
							</LegendItem>
							<LegendItem verdict="close" icon={ArrowUpDown}>
								One place off: {POINTS.close} pts
							</LegendItem>
							<LegendItem verdict="miss" icon={X}>
								Elsewhere in the top six: {POINTS.top} pts, otherwise 0
							</LegendItem>
							<View className="flex-row items-center gap-2">
								<View className="h-5 w-5 items-center justify-center">
									<Icon icon={Timer} tone="muted" size={15} />
								</View>
								<Text variant="caption">Fastest lap: {POINTS.bonus} pts</Text>
							</View>
						</View>
					</Section>
				</>
			)}

			<StatsPanel
				open={statsOpen}
				onClose={() => setStatsOpen(false)}
				stats={p.stats}
				today={today}
				description={`Daily races, saved on this phone. A win is ${WIN_POINTS} points or more out of ${MAX_POINTS}.`}
				distributionTitle="Score distribution"
				distributionLabel="Daily results by share of the maximum points"
				bucketLabel={percentBucketLabel}
				bucketSrLabel={percentBucketSrLabel}
				labelWidth={34}
				highlight={mode === "daily" && result ? resultBucket(result.total) : null}
			/>
		</GameScreen>
	);
}

/* ------------------------------------------------------------- the race --- */

function RaceHeader({ race: r, linked }: { race: RaceEntry; linked: boolean }) {
	const open = useOpen();
	return (
		<View className="gap-3 border-b border-border px-4 pb-4 pt-4">
			<View className="flex-row items-center gap-3">
				<Flag code={r.gp.flag} className="text-[28px]" />
				<View className="flex-1">
					<NameLink onPress={linked ? () => open(href.race(r)) : undefined} className="text-[17px] leading-6" numberOfLines={2}>
						{`${r.year} ${r.gp.name}`}
					</NameLink>
					<Text variant="caption">
						{r.circuit.name}, {r.circuit.place} · Round {r.round} of {r.rounds} · {fmtDate(r.date)}
					</Text>
				</View>
			</View>
			<View className="gap-1">
				<Text variant="caption">Championship before the race</Text>
				{r.leaders.length ? (
					<View className="flex-row flex-wrap gap-x-4 gap-y-0.5">
						{r.leaders.map((l, i) => (
							<View key={l.driver.id} className="flex-row items-center gap-1.5">
								<Text variant="caption" className="tabular-nums">
									{i + 1}.
								</Text>
								<Flag code={l.driver.flag} className="text-[12px]" />
								<Text variant="small" className="font-semibold">
									{l.driver.last}
								</Text>
								<Text variant="caption" className="tabular-nums">
									{num(l.points)}
								</Text>
							</View>
						))}
					</View>
				) : (
					<Text variant="small">Season opener: no points yet</Text>
				)}
			</View>
		</View>
	);
}

/* ------------------------------------------------------------ predicting --- */

function Picker({ race, pick, onChange, onNewRace }: { race: RaceEntry; pick: Pick; onChange: (p: Pick) => void; onNewRace?: () => void }) {
	const byId = useMemo(() => new Map(race.entries.map((e) => [e.driver.id, e])), [race]);
	const [flOpen, setFlOpen] = useState(false);
	const next = pick.picks.indexOf(null);
	const set = (picks: (string | null)[]) => {
		haptic("selection");
		onChange({ ...pick, picks });
	};
	const fl = pick.fl ? byId.get(pick.fl) : null;
	const ready = complete(pick.picks);

	return (
		<>
			<Section title="Your top six" description="Tap drivers on the grid below to fill it in order. Arrows move a pick; tap a pick to take it out.">
				<View className="mt-1 px-4">
					{pick.picks.map((id, i) => {
						const e = id ? byId.get(id) : null;
						return (
							<View key={i} className={cn("min-h-14 flex-row items-center gap-2 border-b border-border", i === next && "bg-accent")}>
								<View className={cn("ml-1 h-7 w-7 items-center justify-center rounded-md", e ? "bg-primary" : "bg-muted")}>
									<Text className={cn("text-[12px] font-bold tabular-nums", e ? "text-primary-foreground" : "text-muted-foreground")}>{i + 1}</Text>
								</View>
								{e ? (
									<Pressable
										accessibilityRole="button"
										accessibilityLabel={`P${i + 1}: ${e.driver.name}. Take out`}
										onPress={() => set(pick.picks.map((p, j) => (j === i ? null : p)))}
										className="min-h-12 flex-1 justify-center active:opacity-70"
									>
										<View className="flex-row items-center gap-1.5">
											<Flag code={e.driver.flag} className="text-[13px]" />
											<Text variant="label" numberOfLines={1} className="shrink">
												{e.driver.name}
											</Text>
										</View>
										<Text variant="caption" numberOfLines={1}>
											{e.team.name} · from {gridLabel(e)}
										</Text>
									</Pressable>
								) : (
									<Text variant="muted" className="flex-1">
										{i === next ? "Tap a driver" : "Empty"}
									</Text>
								)}
								{e ? (
									<View className="flex-row">
										<IconButton icon={ArrowUp} label={`Move ${e.driver.name} up`} tone={i === 0 ? "border" : "muted"} size={18} onPress={i === 0 ? undefined : () => set(swap(pick.picks, i, i - 1))} />
										<IconButton
											icon={ArrowDown}
											label={`Move ${e.driver.name} down`}
											tone={i === SLOTS - 1 ? "border" : "muted"}
											size={18}
											onPress={i === SLOTS - 1 ? undefined : () => set(swap(pick.picks, i, i + 1))}
										/>
									</View>
								) : null}
							</View>
						);
					})}
				</View>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={`Bonus: who sets the fastest lap? ${fl ? fl.driver.name : "Optional, none picked"}`}
					onPress={() => setFlOpen(true)}
					className="mt-1 min-h-14 flex-row items-center gap-3 px-4 active:bg-accent"
				>
					<Icon icon={Timer} tone="muted" size={19} />
					<View className="flex-1">
						<Text variant="body">Bonus: who sets the fastest lap?</Text>
						<Text variant="caption">{fl ? `${fl.driver.name} · ${fl.team.name}` : "Pick a driver (optional)"}</Text>
					</View>
					<Icon icon={ChevronRight} tone="muted" size={17} />
				</Pressable>
				<View className="mt-3 flex-row gap-2 px-4">
					<Button
						label="Lock in prediction"
						icon={Trophy}
						size="lg"
						className="flex-1"
						disabled={!ready}
						onPress={() => {
							haptic("success");
							onChange({ ...pick, done: true });
						}}
					/>
					{onNewRace ? <Button label="New race" icon={Dices} size="lg" variant="outline" onPress={onNewRace} /> : null}
				</View>
				<Text variant="caption" className="mt-2 px-4">
					{ready ? "Ready when you are. No changes after this, and no peeking at the result!" : `Pick ${pick.picks.filter((x) => !x).length} more to lock in.`}
				</Text>
			</Section>

			<Section title="Starting grid" description={`${race.entries.length} starters · tap to pick`}>
				<View className="mt-1">
					{race.entries.map((e, k) => {
						const at = pick.picks.indexOf(e.driver.id);
						const full = at < 0 && next < 0;
						return (
							<Pressable
								key={e.driver.id}
								accessibilityRole="button"
								accessibilityState={{ selected: at >= 0, disabled: full }}
								accessibilityLabel={`${gridLabel(e)} ${e.driver.name}, ${e.team.name}${at >= 0 ? `: your P${at + 1}` : ""}`}
								disabled={full}
								onPress={() => set(toggle(pick.picks, e.driver.id))}
								className={cn("flex-row items-center gap-3 pl-4 pr-3 active:bg-accent", at >= 0 && "bg-primary/10", full && "opacity-50")}
							>
								<Text variant="caption" className="w-8 font-semibold tabular-nums">
									{gridLabel(e)}
								</Text>
								<View className={cn("min-h-12 flex-1 flex-row items-center gap-2 py-2", k < race.entries.length - 1 && "border-b border-border")}>
									<Flag code={e.driver.flag} className="text-[13px]" />
									<View className="flex-1">
										<Text variant="label" numberOfLines={1}>
											{e.driver.name}
										</Text>
										<Text variant="caption" numberOfLines={1}>
											{e.team.name}
										</Text>
									</View>
									{at >= 0 ? (
										<View className="rounded-md bg-primary px-1.5 py-0.5">
											<Text className="text-[11px] font-bold tabular-nums text-primary-foreground">P{at + 1}</Text>
										</View>
									) : null}
								</View>
							</Pressable>
						);
					})}
				</View>
			</Section>

			<Sheet open={flOpen} onClose={() => setFlOpen(false)} title="Fastest lap" subtitle={`Bonus: ${POINTS.bonus} points if you're right. Optional.`}>
				<ScrollView contentContainerClassName="pb-8">
					{race.entries.map((e) => {
						const on = pick.fl === e.driver.id;
						return (
							<Pressable
								key={e.driver.id}
								accessibilityRole="button"
								accessibilityState={{ selected: on }}
								onPress={() => {
									haptic("selection");
									onChange({ ...pick, fl: on ? null : e.driver.id });
									setFlOpen(false);
								}}
								className={cn("min-h-12 flex-row items-center gap-3 border-b border-border px-4 active:bg-accent", on && "bg-accent")}
							>
								<Text variant="caption" className="w-8 tabular-nums">
									{gridLabel(e)}
								</Text>
								<Flag code={e.driver.flag} className="text-[13px]" />
								<View className="flex-1 py-2">
									<Text variant="label">{e.driver.name}</Text>
									<Text variant="caption">{e.team.name}</Text>
								</View>
								{on ? <Icon icon={Check} tone="primary" size={18} /> : null}
							</Pressable>
						);
					})}
				</ScrollView>
			</Sheet>
		</>
	);
}

/* --------------------------------------------------------------- reveal --- */

function Reveal({ race, result }: { race: RaceEntry; result: Score }) {
	const byId = useMemo(() => new Map(race.entries.map((e) => [e.driver.id, e])), [race]);
	const short = useMemo(() => shortNames(race.entries), [race]);
	const reduced = useReducedMotion();
	const actual = podium(race);
	const fl = result.bonus;
	const flEntry = fl.actual ? byId.get(fl.actual) : undefined;
	const flPick = fl.pick ? byId.get(fl.pick) : undefined;
	return (
		<Section title="Your prediction and the result">
			<View className="mt-1 gap-1.5 px-4">
				<View className="flex-row gap-2" importantForAccessibility="no-hide-descendants">
					<Text variant="caption" className="w-7">
						Pos
					</Text>
					<Text variant="caption" className="flex-1">
						Your pick
					</Text>
					<Text variant="caption" className="flex-1">
						Result
					</Text>
					<Text variant="caption" className="w-9 text-right">
						Pts
					</Text>
				</View>
				{result.slots.map((s, i) => {
					const mine = s.pick ? byId.get(s.pick) : undefined;
					const real = actual[i];
					return (
						<Animated.View key={s.slot} entering={reduced ? undefined : FadeInLeft.delay(i * 160).duration(400)}>
							<RevealRow
								pos={<Text variant="label" className="tabular-nums text-muted-foreground">P{s.slot}</Text>}
								verdict={s.verdict}
								mineTitle={mine ? short.get(mine.driver.id)! : "—"}
								mineSub={s.finish ? `Finished P${s.finish}` : mine ? (mine.finish == null ? "Not classified" : "") : ""}
								srVerdict={s.verdict === "match" ? "exact" : s.verdict === "close" ? "one place off" : s.points ? "in the top six" : "not in the top six"}
								real={real}
								realTitle={short.get(real.driver.id)!}
								realSub={`${real.team.name} · from ${gridLabel(real)}`}
								points={s.points}
							/>
						</Animated.View>
					);
				})}
				<Animated.View entering={reduced ? undefined : FadeInLeft.delay(SLOTS * 160).duration(400)} className="mt-1 border-t border-border pt-2">
					<RevealRow
						pos={<Icon icon={Timer} tone="muted" size={16} />}
						verdict={fl.points ? "match" : "miss"}
						mineTitle={flPick ? short.get(flPick.driver.id)! : "No pick"}
						mineSub="Fastest lap"
						srVerdict={fl.points ? "right" : "wrong"}
						real={flEntry}
						realTitle={flEntry ? short.get(flEntry.driver.id)! : "—"}
						realSub={flEntry?.team.name ?? ""}
						points={fl.points}
					/>
				</Animated.View>
				<View className="mt-1 flex-row items-center justify-between border-t border-border pt-3">
					<Text variant="muted">Total</Text>
					<Text variant="label" className="tabular-nums">
						{result.total} <Text variant="muted">/ {result.max}</Text>
					</Text>
				</View>
			</View>
		</Section>
	);
}

function RevealRow({
	pos,
	verdict,
	mineTitle,
	mineSub,
	srVerdict,
	real,
	realTitle,
	realSub,
	points,
}: {
	pos: React.ReactNode;
	verdict: "match" | "close" | "miss";
	mineTitle: string;
	mineSub: string;
	srVerdict: string;
	real: Entry | undefined;
	realTitle: string;
	realSub: string;
	points: number;
}) {
	const open = useOpen();
	const style = VERDICT_STYLE[verdict];
	return (
		<View className="flex-row items-center gap-2">
			<View className="w-7">{pos}</View>
			<View className={cn("h-12 flex-1 justify-center rounded-md px-2", style.box)} accessible accessibilityLabel={`Your pick ${mineTitle}: ${srVerdict}`}>
				<Text numberOfLines={1} className={cn("text-[13px] font-bold", style.text)}>
					{mineTitle}
				</Text>
				{mineSub ? (
					<Text numberOfLines={1} className={cn("text-[11px] opacity-85", style.text)}>
						{mineSub}
					</Text>
				) : null}
			</View>
			<View className="flex-1">
				<NameLink onPress={real ? () => open(href.driver(real.driver.id)) : undefined} className="text-[13px] leading-[18px]">
					{realTitle}
				</NameLink>
				<Text variant="caption" numberOfLines={1} className="text-[11px]">
					{realSub}
				</Text>
			</View>
			<Text variant="label" className={cn("w-9 text-right tabular-nums", !points && "text-muted-foreground")}>
				+{points}
			</Text>
		</View>
	);
}
