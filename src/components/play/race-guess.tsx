"use client";

// Daily "Guess the race" game (/play/race): the podium of a mystery Grand Prix, and another
// clue after every wrong guess (pole, fastest lap, laps and finishers, P4–P6, notable facts,
// the circuit's country). Races come from public/data/race-guess.json; picks, comparisons
// and the share text from lib/game/race-guess. Progress and stats live in localStorage, per
// pool. The shared game chrome is ./kit, the race picker and board ./race-picker.

import { useEffect, useMemo, useState } from "react";
import { Dices, Flag as FlagIcon, Lock, Medal, Repeat, Sparkles, Timer, Trophy, Zap } from "lucide-react";
import { gameStore, type GameMode } from "@/lib/game/daily";
import {
	compareRaces,
	dailyRace,
	emptyStats,
	MAX_GUESSES,
	puzzleNumber,
	RACE_POOLS,
	raceClues,
	raceShareText,
	randomRace,
	recordResult,
	type RaceClue,
	type RacePool,
	type RgEntry,
	type RgRace,
} from "@/lib/game/race-guess";
import type { GameStats } from "@/lib/game/daily";
import { cn } from "@/lib/utils";
import { Flag, href, Page } from "../f1";
import { ULink } from "../universe-link";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Kbd } from "../ui/kbd";
import { ChoiceToggle, GameError, GameHeader, GameLoading, ResultCard, shareResult, StatsDialog, useGameData, useToday } from "./kit";
import { loadRaceCatalog, RaceBoard, RaceLegend, RacePicker, RaceTitle } from "./race-picker";

const store = gameStore("race");
const readStats = (pool: RacePool) => store.readStats(`stats:${pool}`, MAX_GUESSES);

export function RaceGuessGame() {
	const { data, error, retry } = useGameData(loadRaceCatalog);
	const { today, rollover } = useToday();
	const [pool, setPoolState] = useState<RacePool>("modern");
	const [mode, setMode] = useState<GameMode>("daily");
	const [daily, setDaily] = useState<number[]>([]);
	const [stats, setStats] = useState<GameStats>(emptyStats);
	const [practice, setPractice] = useState<{ target: number; guesses: number[] } | null>(null);
	const [statsOpen, setStatsOpen] = useState(false);

	useEffect(() => setPoolState(store.read<RacePool>("pool", "modern") === "all" ? "all" : "modern"), []);

	useEffect(() => {
		if (today == null) return;
		setDaily(store.readDaily<{ guesses: number[] }>(`daily:${pool}`, today)?.guesses ?? []);
		setStats(readStats(pool));
	}, [today, pool]);

	const setPool = (p: RacePool) => {
		setPoolState(p);
		store.write("pool", p);
		setPractice(null);
	};

	const target = useMemo(() => {
		if (!data || today == null) return null;
		if (mode === "daily") return dailyRace(data.races, pool, today);
		return practice ? (data.byId.get(practice.target) ?? null) : null;
	}, [data, today, mode, pool, practice]);

	useEffect(() => {
		if (data && mode === "practice" && !practice) setPractice({ target: randomRace(data.races, pool).id, guesses: [] });
	}, [data, mode, practice, pool]);

	const guesses = mode === "daily" ? daily : (practice?.guesses ?? []);
	const rows = useMemo(
		() => (data && target ? guesses.map((id) => data.byId.get(id)).filter((r) => !!r).map((r) => compareRaces(r, target)) : []),
		[data, target, guesses],
	);
	const won = rows.some((r) => r.correct);
	const over = won || rows.length >= MAX_GUESSES;

	const guess = (r: RgRace) => {
		if (over || !target || today == null) return;
		const next = [...guesses, r.id];
		if (mode === "practice") {
			setPractice((p) => p && { ...p, guesses: next });
			return;
		}
		setDaily(next);
		store.writeDaily(`daily:${pool}`, today, { guesses: next });
		if (r.id === target.id || next.length >= MAX_GUESSES) {
			const s = recordResult(readStats(pool), today, r.id === target.id, next.length);
			store.write(`stats:${pool}`, s);
			setStats(s);
		}
	};

	const share = () => {
		if (today == null) return;
		const suffix = pool === "all" ? " (All time)" : "";
		const label = mode === "daily" ? `#${puzzleNumber(today)}${suffix}` : `practice${suffix}`;
		shareResult(raceShareText({ title: "Guess the race", rows, won, label, url: `${location.origin}/play/race` }));
	};

	const newPractice = (exclude: number) => setPractice({ target: randomRace(data!.races, pool, Math.random, exclude).id, guesses: [] });
	const level = RACE_POOLS.find((p) => p.id === pool)!;
	const ready = data && target && today != null;
	return (
		<Page className="max-w-5xl space-y-8">
			<GameHeader
				title="Guess the race"
				today={today}
				mode={mode}
				onModeChange={setMode}
				controls={<ChoiceToggle value={pool} options={RACE_POOLS} onChange={setPool} />}
				onStats={() => setStatsOpen(true)}
			>
				A new mystery Grand Prix every day at midnight UTC, the same for everyone. You start with the podium; every wrong guess reveals another clue, and
				each guess shows how close it was on year, Grand Prix, circuit, round and winner. {MAX_GUESSES} guesses. {level.description}.
			</GameHeader>

			{error ? (
				<GameError what="the races" onRetry={retry} />
			) : !ready ? (
				<GameLoading />
			) : (
				<div className="space-y-6">
					{over ? (
						<ResultCard
							won={won}
							status={won ? (rows.length === 1 ? "From the podium alone! Got it in 1." : `Got it in ${rows.length} of ${MAX_GUESSES}.`) : "Out of guesses. The mystery race was"}
							mode={mode}
							nextLabel={mode === "practice" ? "Next practice race" : "Practice with a random race"}
							countdownLabel="Next race in"
							onShare={share}
							onStats={() => setStatsOpen(true)}
							onNext={() => {
								setMode("practice");
								newPractice(target.id);
							}}
							onRollover={rollover}
						>
							<Reveal race={target} />
						</ResultCard>
					) : (
						<Clues race={target} revealed={rows.length} />
					)}
					{!over && (
						<div className="space-y-2">
							<RacePicker races={data.races} exclude={guesses} onPick={guess} />
							<div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
								<span className="flex items-center gap-1.5">
									Guess {rows.length + 1} of {MAX_GUESSES}
									<span className="hidden items-center gap-1.5 sm:inline-flex">
										· try &ldquo;2005 jap&rdquo; or &ldquo;monaco 88&rdquo; · <Kbd>Enter</Kbd> to guess
									</span>
								</span>
								{mode === "practice" && (
									<Button variant="ghost" size="xs" onClick={() => newPractice(target.id)}>
										<Dices data-icon="inline-start" />
										New race
									</Button>
								)}
							</div>
						</div>
					)}
					<RaceBoard rows={rows} />
					<RaceLegend />
				</div>
			)}

			<StatsDialog
				open={statsOpen}
				onOpenChange={setStatsOpen}
				stats={stats}
				today={today}
				description={`Daily puzzles, ${level.label.toLowerCase()} races. Saved in this browser.`}
				highlight={mode === "daily" && won ? rows.length - 1 : null}
			/>
		</Page>
	);
}

/* ---------------------------------------------------------------- clues --- */

const PLACE_STYLE = ["bg-gold/25 text-foreground ring-gold/60", "bg-muted text-foreground ring-border", "bg-orange-500/15 text-foreground ring-orange-500/40"];

function EntryLine({ pos, entry, link = false }: { pos: number; entry: RgEntry; link?: boolean }) {
	const d = entry.driver;
	return (
		<li className="flex min-w-0 items-center gap-2.5">
			<span
				className={cn(
					"inline-flex h-6 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums ring-1 ring-inset",
					PLACE_STYLE[pos - 1] ?? "bg-muted/60 text-muted-foreground ring-border",
				)}
			>
				P{pos}
			</span>
			<Flag code={d.flag} />
			<span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
				{link ? (
					<ULink href={href.driver(d.id)} data-card={`driver:${d.id}`} className="truncate font-medium underline-offset-4 hover:underline">
						{d.name}
					</ULink>
				) : (
					<span className="truncate font-medium">{d.name}</span>
				)}
				{link ? (
					<ULink href={href.team(entry.team.id)} data-card={`team:${entry.team.id}`} className="text-muted-foreground truncate text-xs underline-offset-4 hover:underline sm:text-sm">
						{entry.team.name}
					</ULink>
				) : (
					<span className="text-muted-foreground truncate text-xs sm:text-sm">{entry.team.name}</span>
				)}
			</span>
		</li>
	);
}

const CLUE_LABEL: Record<RaceClue["kind"], { label: string; icon: typeof Trophy }> = {
	pole: { label: "Pole position", icon: Medal },
	fastest: { label: "Fastest lap", icon: Zap },
	laps: { label: "Distance", icon: Repeat },
	top6: { label: "P4–P6", icon: Trophy },
	notes: { label: "Notable", icon: Sparkles },
	country: { label: "Circuit country", icon: FlagIcon },
};

function ClueBody({ clue }: { clue: RaceClue }) {
	switch (clue.kind) {
		case "pole":
			return <Person entry={clue.entry} />;
		case "fastest":
			return <Person entry={clue.entry} extra={clue.time} />;
		case "laps":
			return (
				<span>
					{clue.laps} laps · {clue.finishers} of {clue.starters} classified
				</span>
			);
		case "top6":
			return (
				<ol className="space-y-1.5">
					{clue.entries.map((e, i) => (
						<EntryLine key={e.driver.id + i} pos={i + 4} entry={e} />
					))}
				</ol>
			);
		case "notes":
			return (
				<ul className="list-disc space-y-0.5 pl-4">
					{clue.notes.map((n) => (
						<li key={n}>{n}</li>
					))}
				</ul>
			);
		case "country":
			return (
				<span className="inline-flex items-center gap-2">
					<Flag code={clue.flag} className="text-lg" />
					<span className="font-medium">{clue.name}</span>
				</span>
			);
	}
}

function Person({ entry, extra }: { entry: RgEntry; extra?: string | null }) {
	return (
		<span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
			<Flag code={entry.driver.flag} />
			<span className="font-medium">{entry.driver.name}</span>
			<span className="text-muted-foreground text-xs sm:text-sm">{entry.team.name}</span>
			{extra && <span className="text-muted-foreground text-xs tabular-nums sm:text-sm">{extra}</span>}
		</span>
	);
}

function Clues({ race, revealed }: { race: RgRace; revealed: number }) {
	const clues = raceClues(race);
	return (
		<Card>
			<CardContent className="space-y-5">
				<div className="space-y-2.5">
					<div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
						<Trophy className="size-3.5" /> The podium
					</div>
					<ol className="space-y-2 text-sm sm:text-base">
						{race.top.slice(0, 3).map((e, i) => (
							<EntryLine key={e.driver.id + i} pos={i + 1} entry={e} />
						))}
					</ol>
				</div>
				<ol className="divide-border/70 border-border/70 divide-y border-t" aria-label="Clues">
					{clues.map((c, i) => {
						const { label, icon: Icon } = CLUE_LABEL[c.kind];
						const open = i < revealed;
						return (
							<li
								key={c.kind}
								className={cn(
									"grid grid-cols-1 gap-1 py-2.5 text-sm sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-3",
									open && i === revealed - 1 && "animate-in fade-in-0 slide-in-from-top-1 duration-500",
								)}
							>
								<span className={cn("flex items-center gap-1.5 text-xs font-medium sm:pt-0.5", open ? "text-foreground" : "text-muted-foreground")}>
									<Icon className="size-3.5 shrink-0" /> {label}
								</span>
								{open ? (
									<div className="min-w-0">
										<ClueBody clue={c} />
									</div>
								) : (
									<span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
										<Lock className="size-3" /> After guess {i + 1}
									</span>
								)}
							</li>
						);
					})}
				</ol>
			</CardContent>
		</Card>
	);
}

/* --------------------------------------------------------------- reveal --- */

function Reveal({ race }: { race: RgRace }) {
	return (
		<>
			<RaceTitle race={race} />
			<ol className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
				{race.top.map((e, i) => (
					<EntryLine key={e.driver.id + i} pos={i + 1} entry={e} link />
				))}
			</ol>
			<div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
				{race.pole && (
					<span className="inline-flex items-center gap-1">
						<Medal className="size-3.5" /> Pole: {race.pole.driver.name}
					</span>
				)}
				{race.fastest && (
					<span className="inline-flex items-center gap-1">
						<Timer className="size-3.5" /> Fastest lap: {race.fastest.driver.name}
					</span>
				)}
				<span>
					{race.laps} laps · {race.finishers} of {race.starters} classified
				</span>
			</div>
		</>
	);
}
