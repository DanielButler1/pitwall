// "Name the grid" (/play/name-the-grid): the website's components/play/name-grid.tsx for the
// phone. While the clock runs, the text field and the clock stay pinned above the grid (the grid
// scrolls under them), so typing never scrolls the field away. Matching is core's name-grid.ts:
// surnames, accents, small typos and well-known short forms.

import { BarChart3, Check, Dices, Flag as FlagIcon, Keyboard, Timer, X } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import Animated, { useReducedMotion, ZoomIn } from "react-native-reanimated";
import { puzzleNumber } from "@pitwall/core/game/daily";
import { clock, isWin, percentBucketLabel, percentBucketSrLabel, resultBucket, shareText, type Slot } from "@pitwall/core/game/name-grid";
import { raceLabel, type RaceData } from "@pitwall/core/game/race-entries";
import { DetailScreen, Flag } from "@/components/f1";
import { Button, Chip, ChipRow, Icon, IconButton, ReadableWidth, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { webUrl } from "@/lib/config";
import { fmtDate } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { href, useOpen } from "@/lib/links";
import { GameError, GameHeader, GameLoading, GameScreen, LegendItem, ResultCard, shareResult, StatsPanel, useDbData, useToday, VERDICT_STYLE } from "@/features/play/kit";
import { raceLoader } from "../data";
import { NameLink } from "../parts";
import { useNameGrid, type Puzzle } from "./useNameGrid";

export function NameGridScreen() {
	const { data, error, retry } = useDbData(raceLoader);
	const { today, rollover } = useToday();
	if (data) return <NameGridGame key={today} data={data} today={today} rollover={rollover} />;
	return (
		<GameScreen title="Name the grid" today={today} mode="daily">
			{error ? <GameError what="the races" onRetry={retry} /> : <GameLoading />}
		</GameScreen>
	);
}

function NameGridGame({ data, today, rollover }: { data: RaceData; today: number; rollover: () => void }) {
	const n = useNameGrid(data, today);
	const [statsOpen, setStatsOpen] = useState(false);
	const { mode, puzzle, run, over, total, named } = n;
	const minutes = (puzzle?.limit ?? 180_000) / 60_000;

	const type = (v: string) => {
		if (n.type(v)) haptic("success");
	};
	const enter = () => {
		if (n.enter()) haptic("success");
	};

	const share = () => {
		if (!puzzle) return;
		const label = mode === "daily" ? `#${puzzleNumber(today)}` : "practice";
		const title = puzzle.race ? raceLabel(puzzle.race) : (puzzle.theme?.title ?? "");
		void shareResult(shareText({ label, title, named, total, ms: run.used ?? 0, url: webUrl("/play/name-the-grid") }));
	};

	const subtitle = mode === "practice" ? "Practice" : `Puzzle #${puzzleNumber(today)}`;
	const playing = !!puzzle && !over;

	return (
		<DetailScreen title="Name the grid" subtitle={subtitle} right={<IconButton icon={BarChart3} label="Your stats" onPress={() => setStatsOpen(true)} />}>
			{playing ? (
				<ReadableWidth>
					<InputBar
						query={n.query}
						onType={type}
						onEnter={enter}
						remaining={n.remaining}
						running={run.start != null}
						named={named}
						total={total}
						feedback={n.feedback?.replace("press Enter", "tap Done") ?? null}
						onGiveUp={n.giveUp}
						onNew={mode === "practice" && run.start == null ? () => n.newPractice(n.practice?.source ?? "race", n.practice?.id) : undefined}
						newLabel={n.practice?.source === "race" ? "New race" : "Restart"}
					/>
				</ReadableWidth>
			) : null}
			<ScrollView contentContainerClassName="pb-16" keyboardShouldPersistTaps="handled">
				<ReadableWidth>
					<GameHeader mode={mode} onModeChange={n.setMode} controls={mode === "practice" ? <Sources data={data} value={n.source} onChange={n.changeSource} /> : null}>
						<Text variant="muted">
							A new race every day at midnight UTC, the same for everyone. Each slot on the starting grid shows the team: name as many starters as you can in {minutes}{" "}
							minutes. Surnames are enough unless two drivers still to name share one; accents and small typos are forgiven (press the keyboard&apos;s done key on a
							close match). The clock starts when you start typing.
						</Text>
					</GameHeader>

					{!puzzle ? (
						<GameLoading />
					) : (
						<>
							<PuzzleTitle puzzle={puzzle} linked={over} />
							{over ? (
								<ResultCard
									won={isWin(named, total)}
									status={named === total ? `Full grid! All ${total} named in ${clock(run.used!)}.` : run.used! >= puzzle.limit ? "Time's up." : `You stopped the clock at ${clock(run.used!)}.`}
									mode={mode}
									nextLabel={mode === "practice" ? (n.practice?.source === "race" ? "Next practice race" : "Another list") : "Practice with a random race"}
									countdownLabel="Next race in"
									onShare={share}
									onStats={() => setStatsOpen(true)}
									onNext={n.next}
									onRollover={rollover}
								>
									<View className="flex-row items-baseline gap-3">
										<Text className="text-[36px] leading-[42px] font-bold tracking-tight text-foreground tabular-nums">
											{named}
											<Text className="text-[22px] text-muted-foreground">/{total}</Text>
										</Text>
										<Text variant="muted">
											named · {Math.round((named / total) * 100)}% in {clock(run.used!)}
										</Text>
									</View>
									<Text variant="muted">{named === total ? "Every driver on the board." : "The ones you missed are greyed out below."}</Text>
								</ResultCard>
							) : null}
							<Board puzzle={puzzle} named={n.namedIdx} over={over} />
							<View className="mt-6 gap-2 px-4">
								<LegendItem verdict="match" icon={Check}>
									Named
								</LegendItem>
								<LegendItem verdict="miss" icon={X}>
									Missed (shown at the end)
								</LegendItem>
							</View>
						</>
					)}
				</ReadableWidth>
			</ScrollView>

			<StatsPanel
				open={statsOpen}
				onClose={() => setStatsOpen(false)}
				stats={n.stats}
				today={today}
				description="Daily races, saved on this phone. A win is naming at least half the grid."
				distributionTitle="Score distribution"
				distributionLabel="Daily results by share of the grid named"
				bucketLabel={percentBucketLabel}
				bucketSrLabel={percentBucketSrLabel}
				labelWidth={34}
				highlight={mode === "daily" && over ? resultBucket(named, total) : null}
			/>
		</DetailScreen>
	);
}

/** Practice: a random race or one of the themed lists. */
function Sources({ data, value, onChange }: { data: RaceData; value: string; onChange: (v: string) => void }) {
	const options = [{ id: "race", title: "Random race" }, ...data.themes.map((t) => ({ id: t.id, title: t.title }))];
	return (
		<ChipRow className="-mx-4">
			{options.map((o) => (
				<Chip
					key={o.id}
					label={o.title}
					selected={value === o.id}
					onPress={() => {
						haptic("selection");
						onChange(o.id);
					}}
				/>
			))}
		</ChipRow>
	);
}

function InputBar({
	query,
	onType,
	onEnter,
	remaining,
	running,
	named,
	total,
	feedback,
	onGiveUp,
	onNew,
	newLabel,
}: {
	query: string;
	onType: (v: string) => void;
	onEnter: () => void;
	remaining: number;
	running: boolean;
	named: number;
	total: number;
	feedback: string | null;
	onGiveUp: () => void;
	onNew?: () => void;
	newLabel: string;
}) {
	return (
		<View className="gap-1 border-b border-border px-4 pb-2 pt-1">
			<View className="flex-row items-center gap-2">
				<View className="h-11 flex-1 flex-row items-center gap-2 rounded-lg bg-muted px-3">
					<Icon icon={Keyboard} tone="muted" size={17} />
					<TextInput
						value={query}
						onChangeText={onType}
						onSubmitEditing={onEnter}
						submitBehavior="submit"
						placeholder="Type a driver's name…"
						accessibilityLabel="Name a driver"
						autoCapitalize="none"
						autoCorrect={false}
						autoComplete="off"
						spellCheck={false}
						returnKeyType="done"
						className="h-11 flex-1 font-sans text-[16px] text-foreground"
						placeholderTextColorClassName="accent-muted-foreground"
						cursorColorClassName="accent-primary"
					/>
				</View>
				<Clock ms={remaining} running={running} />
			</View>
			<View className="min-h-9 flex-row items-center gap-2">
				<Text variant="caption" className="flex-1" accessibilityLiveRegion="polite">
					<Text variant="caption" className="font-semibold text-foreground tabular-nums">
						{named}/{total}
					</Text>{" "}
					named{feedback ? <Text variant="caption" className="text-warning"> · {feedback}</Text> : null}
				</Text>
				{onNew ? <Button label={newLabel} icon={Dices} variant="ghost" size="sm" onPress={onNew} /> : null}
				<Button label="Give up" icon={FlagIcon} variant="ghost" size="sm" onPress={onGiveUp} />
			</View>
		</View>
	);
}

function Clock({ ms, running }: { ms: number; running: boolean }) {
	const low = running && ms <= 30_000;
	return (
		<View
			accessible
			accessibilityRole="timer"
			accessibilityLabel={`Time left ${clock(ms)}`}
			className={cn("h-11 flex-row items-center gap-1.5 rounded-lg px-3", low ? "bg-destructive" : running ? "border border-border bg-muted" : "border border-border")}
		>
			<Icon icon={Timer} tone={low ? "primary-foreground" : running ? "foreground" : "muted"} size={16} />
			<Text variant="label" className={cn("text-[16px] tabular-nums", low ? "text-primary-foreground" : running ? "text-foreground" : "text-muted-foreground")}>
				{clock(ms)}
			</Text>
		</View>
	);
}

function PuzzleTitle({ puzzle, linked }: { puzzle: Puzzle; linked: boolean }) {
	const open = useOpen();
	const r = puzzle.race;
	if (!r) {
		return (
			<View className="gap-0.5 px-4 pt-4">
				<Text variant="heading">{puzzle.theme?.title}</Text>
				<Text variant="muted">{puzzle.theme?.description}. Each slot shows the years and how many.</Text>
			</View>
		);
	}
	return (
		<View className="flex-row items-center gap-3 px-4 pt-4">
			<Flag code={r.gp.flag} className="text-[26px]" />
			<View className="flex-1">
				<NameLink onPress={linked ? () => open(href.race(r)) : undefined} className="text-[17px] leading-6" numberOfLines={2}>
					{`${r.year} ${r.gp.name}`}
				</NameLink>
				<Text variant="caption">
					{r.circuit.name} · Round {r.round} of {r.rounds} · {fmtDate(r.date)} · {r.entries.length} starters
				</Text>
			</View>
		</View>
	);
}

/** Two columns, like a starting grid: left column odd positions, right column even. */
function Board({ puzzle, named, over }: { puzzle: Puzzle; named: ReadonlySet<number>; over: boolean }) {
	const rows: number[][] = [];
	for (let i = 0; i < puzzle.slots.length; i += 2) rows.push([i, i + 1].filter((k) => k < puzzle.slots.length));
	return (
		<View className="mt-4 gap-1.5 px-4" accessibilityLabel={puzzle.race ? "Starting grid" : "Drivers to name"}>
			{rows.map((row) => (
				<View key={row[0]} className="flex-row gap-2">
					{row.map((i) => (
						<SlotView key={`${puzzle.key}:${i}`} slot={puzzle.slots[i]} named={named.has(i)} over={over} />
					))}
					{row.length === 1 ? <View className="flex-1" /> : null}
				</View>
			))}
		</View>
	);
}

function SlotView({ slot, named, over }: { slot: Slot; named: boolean; over: boolean }) {
	const open = useOpen();
	const reduced = useReducedMotion();
	const d = slot.driver;
	const shown = named || over;
	const short = d.first ? `${d.first[0]}. ${d.last}` : d.name;
	return (
		<View
			accessible
			accessibilityLabel={`${slot.label}, ${slot.clue}: ${shown ? `${d.name}, ${named ? "named" : "missed"}` : "not named yet"}`}
			className={cn("h-14 min-w-0 flex-1 flex-row items-center gap-2 rounded-md border-t-2 px-2", named ? cn(VERDICT_STYLE.match.box, "border-white/40") : cn("border-x border-b border-border bg-card", over ? "border-t-muted-foreground/30" : "border-t-foreground/25"))}
		>
			<Text numberOfLines={1} className={cn("w-9 text-[12px] font-bold tabular-nums", named ? "text-white/85" : "text-muted-foreground")}>{slot.label}</Text>
			<View className="min-w-0 flex-1">
				<Text numberOfLines={1} className={cn("text-[11px] leading-[14px]", named ? "text-white/85" : "text-muted-foreground")}>
					{slot.clue}
				</Text>
				{shown ? (
					<Animated.View entering={named && !reduced ? ZoomIn.duration(300) : undefined} className={cn(!named && "opacity-60")}>
						<NameLink onPress={over ? () => open(href.driver(d.id)) : undefined} className={cn("text-[13px] leading-[18px]", named ? "text-white" : "text-muted-foreground")}>
							{short}
						</NameLink>
					</Animated.View>
				) : (
					<View className="mt-1.5 h-2.5 w-3/5 rounded-full bg-muted-foreground/20" />
				)}
			</View>
		</View>
	);
}
