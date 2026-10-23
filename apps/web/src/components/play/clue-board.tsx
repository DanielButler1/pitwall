"use client";

// The shared shell of the clue-board games ("Guess the constructor", "Guess the circuit"): the
// same page as "Guess the driver" (header with Daily/Practice and Modern/All time, picker,
// board of coloured clue tiles, result card, stats), driven by a game config. Each game supplies
// its data, comparison, tiles and reveal; progress and stats live in localStorage per difficulty.

import { Fragment, useEffect, useMemo, useState } from "react";
import { Dices } from "lucide-react";
import { gameStore, puzzleNumber, type Direction, type GameMode, type GameStats, type Verdict } from "@pitwall/core/game/daily";
import { emptyStats, MAX_GUESSES, recordResult, type Difficulty } from "@pitwall/core/game/clue";
import { cn } from "@/lib/utils";
import { Page } from "../f1";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { ChoiceToggle, ClueTile, EntityPicker, GameError, GameHeader, GameLoading, Legend, ResultCard, shareResult, StatsDialog, useToday, type PickerItem } from "./kit";

export type ClueTileData = { key: string; verdict: Verdict; direction: Direction };
export type ClueRow<T> = { guess: T; correct: boolean; tiles: ClueTileData[] };
export type ClueColumn = { key: string; label: string; short: string; close?: string };

export type ClueGameConfig<T extends { id: string }, R extends ClueRow<T>> = {
	/** Storage name (pitwall-<game>:) and URL slug under /play. */
	game: string;
	title: string;
	/** e.g. "constructor": "Guess a constructor", "New constructor", "Next constructor in". */
	noun: string;
	/** Completes "Couldn't load …". */
	what: string;
	/** What the clues cover, completing "each one shows how close it was on …". */
	clues: string;
	difficulties: { id: Difficulty; label: string; description: string }[];
	columns: ClueColumn[];
	/** Header of the name column on wide screens. */
	nameHeader: string;
	dailyTarget: (list: T[], difficulty: Difficulty, day: number) => T;
	randomTarget: (list: T[], difficulty: Difficulty, random: () => number, exclude?: string) => T;
	compare: (guess: T, target: T) => R;
	shareText: (o: { rows: R[]; won: boolean; label: string; url?: string }) => string;
	/** The guess's name cell (a link with a hover card). */
	rowName: (guess: T) => React.ReactNode;
	/** One clue tile; `delay` staggers the pop-in. */
	tile: (row: R, index: number, delay: number) => React.ReactNode;
	legend: { close: React.ReactNode; direction?: React.ReactNode };
	reveal: (target: T) => React.ReactNode;
};

export type ClueData<T> = { list: T[]; byId: Map<string, T> };

export function ClueGame<T extends { id: string }, R extends ClueRow<T>>({
	config: c,
	data,
	error,
	retry,
	items,
}: {
	config: ClueGameConfig<T, R>;
	data: ClueData<T> | null;
	error: boolean;
	retry: () => void;
	/** Picker entries, one per guessable item (memoised). */
	items: PickerItem[];
}) {
	const store = useMemo(() => gameStore(c.game), [c.game]);
	const readStats = (difficulty: Difficulty) => store.readStats(`stats:${difficulty}`, MAX_GUESSES);
	const { today, rollover } = useToday();
	const [difficulty, setDifficultyState] = useState<Difficulty>("modern");
	const [mode, setMode] = useState<GameMode>("daily");
	const [daily, setDaily] = useState<string[]>([]);
	const [stats, setStats] = useState<GameStats>(emptyStats);
	const [practice, setPractice] = useState<{ target: string; guesses: string[] } | null>(null);
	const [statsOpen, setStatsOpen] = useState(false);

	useEffect(() => setDifficultyState(store.read<Difficulty>("difficulty", "modern") === "all" ? "all" : "modern"), [store]);

	// the day's saved progress and stats for this difficulty
	useEffect(() => {
		if (today == null) return;
		setDaily(store.readDaily<{ guesses: string[] }>(`daily:${difficulty}`, today)?.guesses ?? []);
		setStats(store.readStats(`stats:${difficulty}`, MAX_GUESSES));
	}, [store, today, difficulty]);

	const setDifficulty = (d: Difficulty) => {
		setDifficultyState(d);
		store.write("difficulty", d);
		setPractice(null);
	};

	const target = useMemo(() => {
		if (!data || today == null) return null;
		if (mode === "daily") return c.dailyTarget(data.list, difficulty, today);
		return practice ? (data.byId.get(practice.target) ?? null) : null;
	}, [c, data, today, mode, difficulty, practice]);

	// a practice puzzle whenever practice starts without one
	useEffect(() => {
		if (data && mode === "practice" && !practice) setPractice({ target: c.randomTarget(data.list, difficulty, Math.random).id, guesses: [] });
	}, [c, data, mode, practice, difficulty]);

	const guesses = mode === "daily" ? daily : (practice?.guesses ?? []);
	const rows = useMemo(
		() => (data && target ? guesses.map((id) => data.byId.get(id)).filter((d) => !!d).map((d) => c.compare(d, target)) : []),
		[c, data, target, guesses],
	);
	const won = rows.some((r) => r.correct);
	const over = won || rows.length >= MAX_GUESSES;

	const guess = (id: string) => {
		if (over || !target || today == null) return;
		const next = [...guesses, id];
		if (mode === "practice") {
			setPractice((p) => p && { ...p, guesses: next });
			return;
		}
		setDaily(next);
		store.writeDaily(`daily:${difficulty}`, today, { guesses: next });
		if (id === target.id || next.length >= MAX_GUESSES) {
			const s = recordResult(readStats(difficulty), today, id === target.id, next.length);
			store.write(`stats:${difficulty}`, s);
			setStats(s);
		}
	};

	const share = () => {
		if (today == null) return;
		const diff = difficulty === "all" ? " (All time)" : "";
		const label = mode === "daily" ? `#${puzzleNumber(today)}${diff}` : `practice${diff}`;
		shareResult(c.shareText({ rows, won, label, url: `${location.origin}/play/${c.game}` }));
	};

	const newPractice = (exclude: string) => setPractice({ target: c.randomTarget(data!.list, difficulty, Math.random, exclude).id, guesses: [] });
	const level = c.difficulties.find((d) => d.id === difficulty)!;
	const ready = data && target && today != null;
	return (
		<Page className="max-w-5xl space-y-8">
			<GameHeader
				title={c.title}
				today={today}
				mode={mode}
				onModeChange={setMode}
				controls={<ChoiceToggle value={difficulty} options={c.difficulties} onChange={setDifficulty} />}
				onStats={() => setStatsOpen(true)}
			>
				A new mystery {c.noun} every day at midnight UTC, the same for everyone. You have {MAX_GUESSES} guesses: each one shows how close it was on {c.clues}.{" "}
				{level.description}.
			</GameHeader>

			{error ? (
				<GameError what={c.what} onRetry={retry} />
			) : !ready ? (
				<GameLoading />
			) : (
				<div className="space-y-6">
					{over ? (
						<ResultCard
							won={won}
							status={won ? (rows.length === 1 ? "First time! Got it in 1." : `Got it in ${rows.length} of ${MAX_GUESSES}.`) : `Out of guesses. The mystery ${c.noun} was`}
							mode={mode}
							nextLabel={mode === "practice" ? `Next practice ${c.noun}` : `Practice with a random ${c.noun}`}
							countdownLabel={`Next ${c.noun} in`}
							onShare={share}
							onStats={() => setStatsOpen(true)}
							onNext={() => {
								setMode("practice");
								newPractice(target.id);
							}}
							onRollover={rollover}
						>
							{c.reveal(target)}
						</ResultCard>
					) : (
						<div className="space-y-2">
							<EntityPicker items={items} exclude={guesses} onPick={(i) => guess(i.id)} label={`Guess a ${c.noun}`} placeholder={`Type a ${c.noun}'s name…`} noun={`${c.noun}s`} />
							<div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
								<span className="flex items-center gap-1.5">
									Guess {rows.length + 1} of {MAX_GUESSES}
									<span className="hidden items-center gap-1.5 sm:inline-flex">
										· <Kbd>↑</Kbd>
										<Kbd>↓</Kbd> to choose, <Kbd>Enter</Kbd> to guess
									</span>
								</span>
								{mode === "practice" && (
									<Button variant="ghost" size="xs" onClick={() => newPractice(target.id)}>
										<Dices data-icon="inline-start" />
										New {c.noun}
									</Button>
								)}
							</div>
						</div>
					)}
					<ClueBoard config={c} rows={rows} />
					<Legend close={c.legend.close} direction={c.legend.direction} />
				</div>
			)}

			<StatsDialog
				open={statsOpen}
				onOpenChange={setStatsOpen}
				stats={stats}
				today={today}
				description={`Daily puzzles, ${level.label.toLowerCase()}. Saved in this browser.`}
				highlight={mode === "daily" && won ? rows.length - 1 : null}
			/>
		</Page>
	);
}

/* ---------------------------------------------------------------- board --- */

// seven clue columns, as in Guess the driver: the name gets its own line on phones
const GRID = "grid grid-cols-7 gap-1 sm:grid-cols-[minmax(9rem,1.6fr)_repeat(7,minmax(0,1fr))] sm:gap-1.5";

function ClueBoard<T extends { id: string }, R extends ClueRow<T>>({ config: c, rows }: { config: ClueGameConfig<T, R>; rows: R[] }) {
	if (!rows.length) return null;
	return (
		<div className="space-y-2" role="table" aria-label="Your guesses">
			<div className={cn(GRID, "text-muted-foreground text-[11px] font-medium sm:text-xs")} role="row">
				<div className="hidden sm:block" role="columnheader">
					{c.nameHeader}
				</div>
				{c.columns.map((a) => (
					<div key={a.key} className="truncate text-center" role="columnheader">
						<span className="sm:hidden">{a.short}</span>
						<span className="hidden sm:inline">{a.label}</span>
					</div>
				))}
			</div>
			{[...rows].reverse().map((r, i) => (
				<div key={r.guess.id} className={GRID} role="row">
					<div className="col-span-7 flex min-w-0 items-center gap-2 px-0.5 text-sm sm:col-span-1" role="rowheader">
						<span className="text-muted-foreground w-4 shrink-0 text-xs tabular-nums">{rows.length - i}</span>
						{c.rowName(r.guess)}
					</div>
					{r.tiles.map((tl, t) => (
						<Fragment key={tl.key}>{c.tile(r, t, t * 90)}</Fragment>
					))}
				</div>
			))}
		</div>
	);
}

/* ---------------------------------------------------------------- tiles --- */

/**
 * A numeric clue tile: the guess's value with an arrow towards the answer, and a hint such as
 * "First season: the mystery team's is later (within 5 years)". `words` are the
 * [higher, lower] comparatives, e.g. ["later", "earlier"].
 */
export function NumberTile({
	tile,
	column,
	noun,
	value,
	text,
	words = ["more", "fewer"],
	delay,
}: {
	tile: ClueTileData;
	column: ClueColumn;
	noun: string;
	value: React.ReactNode;
	text: string;
	words?: [string, string];
	delay: number;
}) {
	const hint =
		tile.verdict === "match"
			? `${column.label}: ${text}, a match`
			: `${column.label}: ${text}. The mystery ${noun}'s is ${tile.direction === "higher" ? words[0] : words[1]}${tile.verdict === "close" && column.close ? ` (${column.close})` : ""}`;
	return (
		<ClueTile
			verdict={tile.verdict}
			direction={tile.direction}
			hint={hint}
			srText={`${column.label} ${text}: ${tile.verdict}${tile.direction ? `, mystery ${noun}'s is ${tile.direction}` : ""}`}
			delay={delay}
		>
			<span className="text-sm font-semibold tabular-nums sm:text-base">{value}</span>
		</ClueTile>
	);
}

/** Years as "1950–2026" (or one year). */
export const yearSpan = (first: number, last: number) => (first === last ? String(first) : `${first}–${last}`);
