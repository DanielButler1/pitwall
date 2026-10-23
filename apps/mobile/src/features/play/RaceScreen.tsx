// "Guess the race" (/play/race): the podium of a mystery Grand Prix, and another clue after every
// wrong guess (pole, fastest lap, laps and finishers, P4–P6, notable facts, the circuit's
// country). Races come from core's raceGuessFile built on the device; picks, comparisons and the
// share text from core's game/race-guess.

import { Flag as FlagIcon, Lock, Medal, Repeat, Sparkles, Timer, Trophy, Zap, type LucideIcon } from "lucide-react-native";
import { useMemo } from "react";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
	compareRaces,
	dailyRace,
	MAX_GUESSES,
	RACE_POOLS,
	raceClues,
	raceShareText,
	randomRace,
	recordResult,
	type RaceClue,
	type RacePool,
	type RgEntry,
	type RgRace,
} from "@pitwall/core/game/race-guess";
import { Flag } from "@/components/f1";
import { Icon, Section, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { webUrl } from "@/lib/config";
import { href } from "@/lib/links";
import { ChoiceToggle, GameError, GameHeader, GameLoading, GameScreen, ResultCard, shareResult, StatsPanel, useDbData, useGuessGame } from "./kit";
import { loadRaceCatalog, RaceBoard, RaceLegend, RacePicker, RaceTitle } from "./race-shared";
import { GuessFooter, LinkText, resultStatus } from "./shared";

export function RaceScreen() {
	const { data, error, retry } = useDbData(loadRaceCatalog);
	const g = useGuessGame<number, RacePool>({
		game: "race",
		variant: { key: "pool", ids: ["modern", "all"], fallback: "modern" },
		maxGuesses: MAX_GUESSES,
		ready: data,
		dailyTarget: (v, day) => dailyRace(data!.races, v, day).id,
		randomTarget: (v, exclude) => randomRace(data!.races, v, Math.random, exclude).id,
		recordResult,
	});
	const target = data && g.targetId != null ? (data.byId.get(g.targetId) ?? null) : null;
	const rows = useMemo(
		() => (data && target ? g.guesses.map((id) => data.byId.get(id)).filter((r) => !!r).map((r) => compareRaces(r, target)) : []),
		[data, target, g.guesses],
	);
	const level = RACE_POOLS.find((p) => p.id === g.variant)!;

	return (
		<GameScreen title="Guess the race" today={g.today} mode={g.mode} onStats={g.openStats}>
			<GameHeader mode={g.mode} onModeChange={g.setMode} controls={<ChoiceToggle value={g.variant} options={RACE_POOLS} onChange={g.setVariant} />}>
				{`A new mystery Grand Prix every day at midnight UTC, the same for everyone. You start with the podium; every wrong guess reveals another clue, and each guess shows how close it was on year, Grand Prix, circuit, round and winner. ${MAX_GUESSES} guesses. ${level.description}.`}
			</GameHeader>

			{error ? (
				<GameError what="the races" onRetry={retry} />
			) : !data || !target ? (
				<GameLoading />
			) : (
				<View className="mt-2">
					{g.over ? (
						<ResultCard
							won={g.won}
							status={resultStatus(g.won, rows.length, MAX_GUESSES, "Out of guesses. The mystery race was", "From the podium alone! Got it in 1.")}
							mode={g.mode}
							nextLabel={g.mode === "practice" ? "Next practice race" : "Practice with a random race"}
							countdownLabel="Next race in"
							onShare={() => shareResult(raceShareText({ title: "Guess the race", rows, won: g.won, label: g.shareLabel(), url: webUrl("/play/race") }))}
							onNext={g.playAgain}
							onStats={g.openStats}
							onRollover={g.rollover}
						>
							<Reveal race={target} />
						</ResultCard>
					) : (
						<>
							<Clues race={target} revealed={rows.length} />
							<View className="mt-4 gap-1">
								<RacePicker races={data.races} exclude={g.guesses as number[]} onPick={(r) => g.guess(r.id)} />
								<GuessFooter text={`Guess ${rows.length + 1} of ${MAX_GUESSES} · try “2005 jap” or “monaco 88”`} practice={g.mode === "practice"} newLabel="New race" onNew={g.newPractice} />
							</View>
						</>
					)}
					<RaceBoard rows={rows} />
					<RaceLegend />
				</View>
			)}

			<StatsPanel
				open={g.statsOpen}
				onClose={g.closeStats}
				stats={g.stats}
				today={g.today}
				description={`Daily puzzles, ${level.label.toLowerCase()} races. Saved on this device.`}
				highlight={g.highlight}
			/>
		</GameScreen>
	);
}

/* ---------------------------------------------------------------- clues --- */

const PLACE_STYLE = ["bg-gold/25 border-gold/60", "bg-silver/30 border-border", "bg-bronze/25 border-bronze/50"];

function EntryLine({ pos, entry, link = false }: { pos: number; entry: RgEntry; link?: boolean }) {
	const d = entry.driver;
	return (
		<View className="min-h-8 flex-row items-center gap-2.5">
			<View className={cn("h-6 w-8 items-center justify-center rounded-md border", PLACE_STYLE[pos - 1] ?? "border-border bg-muted/60")}>
				<Text variant="caption" className="font-semibold text-foreground tabular-nums">{`P${pos}`}</Text>
			</View>
			<Flag code={d.flag} />
			<Text variant="small" numberOfLines={1} className="flex-1">
				{link ? <LinkText href={href.driver(d.id)}>{d.name}</LinkText> : <Text variant="small" className="font-semibold">{d.name}</Text>}
				<Text variant="caption">{"  "}</Text>
				{link ? (
					<LinkText href={href.team(entry.team.id)} className="font-normal text-muted-foreground">
						{entry.team.name}
					</LinkText>
				) : (
					<Text variant="caption">{entry.team.name}</Text>
				)}
			</Text>
		</View>
	);
}

const CLUE_LABEL: Record<RaceClue["kind"], { label: string; icon: LucideIcon }> = {
	pole: { label: "Pole position", icon: Medal },
	fastest: { label: "Fastest lap", icon: Zap },
	laps: { label: "Distance", icon: Repeat },
	top6: { label: "P4–P6", icon: Trophy },
	notes: { label: "Notable", icon: Sparkles },
	country: { label: "Circuit country", icon: FlagIcon },
};

function Person({ entry, extra }: { entry: RgEntry; extra?: string | null }) {
	return (
		<View className="flex-row flex-wrap items-center gap-x-2">
			<Flag code={entry.driver.flag} />
			<Text variant="label">{entry.driver.name}</Text>
			<Text variant="caption">{entry.team.name}</Text>
			{extra ? <Text variant="caption" className="tabular-nums">{extra}</Text> : null}
		</View>
	);
}

function ClueBody({ clue }: { clue: RaceClue }) {
	switch (clue.kind) {
		case "pole":
			return <Person entry={clue.entry} />;
		case "fastest":
			return <Person entry={clue.entry} extra={clue.time} />;
		case "laps":
			return <Text variant="small">{`${clue.laps} laps · ${clue.finishers} of ${clue.starters} classified`}</Text>;
		case "top6":
			return (
				<View>
					{clue.entries.map((e, i) => (
						<EntryLine key={e.driver.id + i} pos={i + 4} entry={e} />
					))}
				</View>
			);
		case "notes":
			return (
				<View className="gap-0.5">
					{clue.notes.map((n) => (
						<Text key={n} variant="small">{`• ${n}`}</Text>
					))}
				</View>
			);
		case "country":
			return (
				<View className="flex-row items-center gap-2">
					<Flag code={clue.flag} className="text-[18px] leading-6" />
					<Text variant="label">{clue.name}</Text>
				</View>
			);
	}
}

function Clues({ race, revealed }: { race: RgRace; revealed: number }) {
	const clues = useMemo(() => raceClues(race), [race]);
	return (
		<>
			<Section title="The podium" className="mt-3">
				<View className="px-4 pt-1">
					{race.top.slice(0, 3).map((e, i) => (
						<EntryLine key={e.driver.id + i} pos={i + 1} entry={e} />
					))}
				</View>
			</Section>
			<Section title="Clues" description={`${Math.min(revealed, clues.length)} of ${clues.length} revealed`} className="mt-5">
				<View className="px-4">
					{clues.map((c, i) => {
						const { label, icon } = CLUE_LABEL[c.kind];
						const open = i < revealed;
						const body = (
							<View className={cn("gap-1.5 py-3", i < clues.length - 1 && "border-b border-border")}>
								<View className="flex-row items-center gap-1.5">
									<Icon icon={icon} tone={open ? "foreground" : "muted"} size={14} />
									<Text variant="caption" className={cn("font-semibold", open && "text-foreground")}>
										{label}
									</Text>
								</View>
								{open ? (
									<ClueBody clue={c} />
								) : (
									<View className="flex-row items-center gap-1.5">
										<Icon icon={Lock} tone="muted" size={12} />
										<Text variant="caption">{`After guess ${i + 1}`}</Text>
									</View>
								)}
							</View>
						);
						return open && i === revealed - 1 ? (
							<Animated.View key={`${c.kind}-open`} entering={FadeInDown.duration(400)}>
								{body}
							</Animated.View>
						) : (
							<View key={`${c.kind}-${open}`}>{body}</View>
						);
					})}
				</View>
			</Section>
		</>
	);
}

/* --------------------------------------------------------------- reveal --- */

function Reveal({ race }: { race: RgRace }) {
	return (
		<>
			<RaceTitle race={race} />
			<View>
				{race.top.map((e, i) => (
					<EntryLine key={e.driver.id + i} pos={i + 1} entry={e} link />
				))}
			</View>
			<View className="flex-row flex-wrap gap-x-4 gap-y-1">
				{race.pole ? (
					<View className="flex-row items-center gap-1">
						<Icon icon={Medal} tone="muted" size={14} />
						<Text variant="caption">{`Pole: ${race.pole.driver.name}`}</Text>
					</View>
				) : null}
				{race.fastest ? (
					<View className="flex-row items-center gap-1">
						<Icon icon={Timer} tone="muted" size={14} />
						<Text variant="caption">{`Fastest lap: ${race.fastest.driver.name}`}</Text>
					</View>
				) : null}
				<Text variant="caption">{`${race.laps} laps · ${race.finishers} of ${race.starters} classified`}</Text>
			</View>
		</>
	);
}
