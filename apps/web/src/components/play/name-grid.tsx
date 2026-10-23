"use client";

// Daily "Name the grid" game (/play/name-the-grid). The races are a static file
// (public/data/race-entries.json, shared with the prediction game); the day's race, the name
// matching and the share text come from lib/game/name-grid. Progress and stats live in
// localStorage; the clock starts on the first keystroke and keeps running across reloads.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Dices, Flag as FlagIcon, Keyboard, Timer, X } from "lucide-react";
import { emptyStats, gameStore, puzzleNumber, recordResult, type GameMode } from "@pitwall/core/game/daily";
import {
	clock,
	dailyGrid,
	isWin,
	matcher,
	matchHint,
	matchName,
	PERCENT_BUCKETS,
	percentBucketLabel,
	percentBucketSrLabel,
	RACE_TIME,
	raceSlots,
	randomGrid,
	resultBucket,
	shareText,
	THEME_TIME,
	themeSlots,
	type Slot,
} from "@pitwall/core/game/name-grid";
import { raceLabel, unpackRaceEntries, type RaceData, type RaceEntriesFile, type RaceEntry, type Theme } from "@pitwall/core/game/race-entries";
import { cn } from "@/lib/utils";
import { Flag, fmtDate, href, Page } from "../f1";
import { ULink } from "../universe-link";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { GameError, GameHeader, GameLoading, jsonLoader, LegendItem, ResultCard, shareResult, StatsDialog, useGameData, useToday, VERDICT_STYLE } from "./kit";

const loadData = jsonLoader("/data/race-entries.json", (f: RaceEntriesFile): RaceData => unpackRaceEntries(f));

const store = gameStore("name-the-grid");
const readStats = () => store.readStats("stats", PERCENT_BUCKETS);

/** A game in progress: who's been named (driver ids), when the clock started, and the time used once it's over. */
type Run = { named: string[]; start: number | null; used: number | null };
const EMPTY: Run = { named: [], start: null, used: null };
/** Practice: a random race, or one of the themed lists ("race" or a theme id as the source). */
type Practice = { source: string; id: string; run: Run };
type Puzzle = { key: string; slots: Slot[]; limit: number; race: RaceEntry | null; theme: Theme | null };

export function NameGridGame() {
	const { data, error, retry } = useGameData(loadData);
	const { today, rollover } = useToday();
	const [mode, setMode] = useState<GameMode>("daily");
	const [daily, setDaily] = useState<Run>(EMPTY);
	const [stats, setStats] = useState(() => emptyStats(PERCENT_BUCKETS));
	const [practice, setPractice] = useState<Practice | null>(null);
	const [source, setSource] = useState("race");
	const [statsOpen, setStatsOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [now, setNow] = useState(0);
	const input = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (today == null) return;
		setDaily({ ...EMPTY, ...store.readDaily<Run>("daily", today) });
		setStats(readStats());
	}, [today]);

	const newPractice = (from: string, exclude?: string) => {
		if (!data) return;
		const id = from === "race" ? randomGrid(data.races, Math.random, exclude).id : from;
		setPractice({ source: from, id, run: EMPTY });
		setQuery("");
	};

	// a practice puzzle whenever practice starts without one
	useEffect(() => {
		if (data && mode === "practice" && !practice) setPractice({ source: "race", id: randomGrid(data.races).id, run: EMPTY });
	}, [data, mode, practice]);

	const puzzle = useMemo((): Puzzle | null => {
		if (!data || today == null) return null;
		if (mode === "daily") {
			const race = dailyGrid(data.races, today);
			return { key: `daily:${race.id}`, slots: raceSlots(race), limit: RACE_TIME, race, theme: null };
		}
		if (!practice) return null;
		if (practice.source === "race") {
			const race = data.byId.get(practice.id);
			return race ? { key: `race:${race.id}`, slots: raceSlots(race), limit: RACE_TIME, race, theme: null } : null;
		}
		const theme = data.themes.find((t) => t.id === practice.id);
		return theme ? { key: `theme:${theme.id}`, slots: themeSlots(theme), limit: THEME_TIME, race: null, theme } : null;
	}, [data, today, mode, practice]);

	const match = useMemo(() => (puzzle ? matcher(puzzle.slots) : null), [puzzle]);
	const run = mode === "daily" ? daily : (practice?.run ?? EMPTY);
	const namedIdx = useMemo(() => {
		const ids = new Set(run.named);
		return new Set(puzzle?.slots.flatMap((s, i) => (ids.has(s.driver.id) ? [i] : [])) ?? []);
	}, [run.named, puzzle]);
	const total = puzzle?.slots.length ?? 0;
	const over = run.used != null;

	const setRun = (next: Run) => {
		if (mode === "practice") {
			setPractice((p) => p && { ...p, run: next });
			return;
		}
		if (today == null) return;
		setDaily(next);
		store.writeDaily("daily", today, next);
		if (next.used != null) {
			const named = next.named.length;
			const s = recordResultFresh(today, isWin(named, total), resultBucket(named, total));
			setStats(s);
		}
	};

	const finish = (used: number, from: Run = run) => {
		if (from.used != null) return;
		setRun({ ...from, start: from.start ?? Date.now(), used: Math.max(0, Math.min(used, puzzle?.limit ?? used)) });
		setQuery("");
	};

	// the clock: ticks while running and ends the game when time's up (also after a reload)
	useEffect(() => {
		if (!puzzle || run.start == null || run.used != null) return;
		const start = run.start;
		const tick = () => {
			const t = Date.now();
			setNow(t);
			if (t - start >= puzzle.limit) finish(puzzle.limit);
		};
		tick();
		const id = setInterval(tick, 250);
		return () => clearInterval(id);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [puzzle, run]);

	const name = (index: number, from: Run) => {
		const next = { ...from, named: [...from.named, puzzle!.slots[index].driver.id] };
		if (next.named.length >= total) next.used = Date.now() - (next.start ?? Date.now());
		setRun(next);
		setQuery("");
	};

	const type = (value: string) => {
		if (over || !match) return;
		let from = run;
		if (from.start == null && value.trim()) {
			from = { ...from, start: Date.now() };
			setNow(from.start!);
			setRun(from);
		}
		const res = matchName(match, value, namedIdx);
		if (res.kind === "hit" && !res.wait) name(res.index, from);
		else setQuery(value);
	};

	const enter = () => {
		if (over || !match) return;
		const res = matchName(match, query, namedIdx);
		if (res.kind === "hit") name(res.index, run);
	};

	const feedback = useMemo(() => {
		if (!match || !query.trim()) return null;
		return matchHint(matchName(match, query, namedIdx), query, puzzle!.slots);
	}, [match, query, namedIdx, puzzle]);

	const share = () => {
		if (today == null || !puzzle) return;
		const label = mode === "daily" ? `#${puzzleNumber(today)}` : "practice";
		const title = puzzle.race ? raceLabel(puzzle.race) : (puzzle.theme?.title ?? "");
		shareResult(shareText({ label, title, named: run.named.length, total, ms: run.used ?? 0, url: `${location.origin}/play/name-the-grid` }), {
			description: "Paste it anywhere to share your score.",
		});
	};

	const changeSource = (s: string) => {
		setSource(s);
		newPractice(s, practice?.id);
	};

	const remaining = run.start == null ? (puzzle?.limit ?? RACE_TIME) : over ? (puzzle?.limit ?? 0) - run.used! : Math.max(0, (puzzle?.limit ?? 0) - (now - run.start));
	const ready = data && puzzle && today != null;
	const named = run.named.length;
	const won = isWin(named, total);
	const minutes = (puzzle?.limit ?? RACE_TIME) / 60_000;

	return (
		<Page className="max-w-5xl space-y-8">
			<GameHeader
				title="Name the grid"
				today={today}
				mode={mode}
				onModeChange={(m) => {
					setMode(m);
					setQuery("");
				}}
				controls={
					mode === "practice" && data ? (
						<Select
							items={[{ value: "race", label: "Random race" }, ...data.themes.map((t) => ({ value: t.id, label: t.title }))]}
							value={source}
							onValueChange={(v) => changeSource(String(v))}
						>
							<SelectTrigger size="sm" className="pointer-coarse:min-h-10 max-w-full" aria-label="Practice list">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="race">Random race</SelectItem>
								{data.themes.map((t) => (
									<SelectItem key={t.id} value={t.id}>
										{t.title}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : null
				}
				onStats={() => setStatsOpen(true)}
			>
				A new race every day at midnight UTC, the same for everyone. Each slot on the starting grid shows the team: name as many starters as you can in{" "}
				{minutes} minutes. Surnames are enough unless two drivers still to name share one; accents and small typos are forgiven (press Enter on a close match). The clock starts when you start typing.
			</GameHeader>

			{error ? (
				<GameError what="the races" onRetry={retry} />
			) : !ready ? (
				<GameLoading />
			) : (
				<div className="space-y-6">
					<PuzzleTitle puzzle={puzzle} linked={over} />
					{over ? (
						<ResultCard
							won={won}
							status={
								named === total
									? `Full grid! All ${total} named in ${clock(run.used!)}.`
									: run.used! >= puzzle.limit
										? "Time's up."
										: `You stopped the clock at ${clock(run.used!)}.`
							}
							mode={mode}
							nextLabel={mode === "practice" ? (practice?.source === "race" ? "Next practice race" : "Another list") : "Practice with a random race"}
							countdownLabel="Next race in"
							onShare={share}
							onStats={() => setStatsOpen(true)}
							onNext={() => {
								setMode("practice");
								if (mode === "practice") newPractice(practice?.source ?? "race", practice?.id);
								else {
									setSource("race");
									newPractice("race", puzzle.race?.id);
								}
							}}
							onRollover={rollover}
						>
							<div className="flex items-baseline gap-3">
								<span className="text-4xl font-semibold tracking-tight tabular-nums">
									{named}
									<span className="text-muted-foreground text-2xl">/{total}</span>
								</span>
								<span className="text-muted-foreground text-sm">
									named · {Math.round((named / total) * 100)}% in {clock(run.used!)}
								</span>
							</div>
							<p className="text-muted-foreground text-sm">{named === total ? "Every driver on the board." : "The ones you missed are greyed out below."}</p>
						</ResultCard>
					) : (
						<div className="bg-background/90 sticky top-14 z-20 -mx-4 space-y-1.5 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
							<div className="flex items-center gap-2">
								<div className="relative min-w-0 flex-1">
									<Keyboard className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
									<Input
										ref={input}
										autoFocus
										aria-label="Name a driver"
										placeholder="Type a driver's name…"
										autoComplete="off"
										autoCorrect="off"
										autoCapitalize="off"
										spellCheck={false}
										enterKeyHint="done"
										className="h-11 pl-9 text-base md:text-base"
										value={query}
										onChange={(e) => type(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												enter();
											}
										}}
									/>
								</div>
								<Clock ms={remaining} running={run.start != null} />
							</div>
							<div className="text-muted-foreground flex min-h-8 items-center justify-between gap-3 text-xs">
								<span aria-live="polite" className="min-w-0">
									<span className="text-foreground font-medium tabular-nums">
										{named}/{total}
									</span>{" "}
									named{feedback && <span className="text-amber-700 dark:text-amber-400"> · {feedback}</span>}
								</span>
								<span className="flex shrink-0 items-center gap-1">
									{mode === "practice" && run.start == null && (
										<Button variant="ghost" size="xs" className="pointer-coarse:min-h-10" onClick={() => newPractice(practice?.source ?? "race", practice?.id)}>
											<Dices data-icon="inline-start" />
											{practice?.source === "race" ? "New race" : "Restart"}
										</Button>
									)}
									<Button variant="ghost" size="xs" className="pointer-coarse:min-h-10" onClick={() => finish(run.start == null ? 0 : Date.now() - run.start)}>
										<FlagIcon data-icon="inline-start" />
										Give up
									</Button>
								</span>
							</div>
						</div>
					)}
					<Board puzzle={puzzle} named={namedIdx} over={over} />
					<div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2 text-xs">
						<LegendItem verdict="match" icon={Check}>
							Named
						</LegendItem>
						<LegendItem verdict="miss" icon={X}>
							Missed (shown at the end)
						</LegendItem>
					</div>
				</div>
			)}

			<StatsDialog
				open={statsOpen}
				onOpenChange={setStatsOpen}
				stats={stats}
				today={today}
				description="Daily races, saved in this browser. A win is naming at least half the grid."
				distributionTitle="Score distribution"
				distributionLabel="Daily results by share of the grid named"
				bucketLabel={percentBucketLabel}
				bucketSrLabel={percentBucketSrLabel}
				labelClassName="w-9"
				highlight={mode === "daily" && over ? resultBucket(named, total) : null}
			/>
		</Page>
	);
}

/** Records today's result against freshly read stats (another tab may have written them). */
function recordResultFresh(today: number, won: boolean, bucket: number) {
	const s = recordResult(readStats(), today, won, bucket);
	store.write("stats", s);
	return s;
}

/* ---------------------------------------------------------------- parts --- */

function Clock({ ms, running }: { ms: number; running: boolean }) {
	const low = running && ms <= 30_000;
	return (
		<div
			role="timer"
			aria-label={`Time left ${clock(ms)}`}
			className={cn(
				"flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-base font-semibold tabular-nums ring-1 ring-inset",
				low ? "bg-red-600 text-white ring-red-600" : running ? "bg-muted ring-border" : "text-muted-foreground ring-border",
			)}
		>
			<Timer className="size-4" aria-hidden />
			{clock(ms)}
		</div>
	);
}

function PuzzleTitle({ puzzle, linked }: { puzzle: Puzzle; linked: boolean }) {
	const r = puzzle.race;
	if (!r) {
		return (
			<div className="space-y-0.5">
				<h2 className="text-lg font-semibold tracking-tight sm:text-xl">{puzzle.theme?.title}</h2>
				<p className="text-muted-foreground text-sm">{puzzle.theme?.description}. Each slot shows the years and how many.</p>
			</div>
		);
	}
	const title = `${r.year} ${r.gp.name}`;
	return (
		<div className="flex items-center gap-3">
			<Flag code={r.gp.flag} className="text-2xl" />
			<div className="min-w-0">
				<h2 className="text-lg font-semibold tracking-tight sm:text-xl">
					{linked ? (
						<ULink href={href.race(r)} data-card={`race:${r.year}-${r.round}`} className="underline-offset-4 hover:underline">
							{title}
						</ULink>
					) : (
						title
					)}
				</h2>
				<p className="text-muted-foreground text-xs sm:text-sm">
					{r.circuit.name} · Round {r.round} of {r.rounds} · {fmtDate(r.date)} · {r.entries.length} starters
				</p>
			</div>
		</div>
	);
}

/** The grid: two columns staggered like a real starting grid on wider screens, a compact two-column list on phones. */
function Board({ puzzle, named, over }: { puzzle: Puzzle; named: ReadonlySet<number>; over: boolean }) {
	const staggered = !!puzzle.race;
	return (
		<ol
			aria-label={staggered ? "Starting grid" : "Drivers to name"}
			className={cn("mx-auto grid max-w-3xl grid-cols-2 gap-x-2 gap-y-1.5 sm:gap-x-8 sm:gap-y-2.5", staggered && "sm:pb-9")}
		>
			{puzzle.slots.map((s, i) => (
				<SlotView key={`${puzzle.key}:${i}`} slot={s} named={named.has(i)} over={over} offset={staggered && i % 2 === 1} />
			))}
		</ol>
	);
}

function SlotView({ slot, named, over, offset }: { slot: Slot; named: boolean; over: boolean; offset: boolean }) {
	const d = slot.driver;
	const shown = named || over;
	return (
		<li
			className={cn(
				"relative flex h-14 min-w-0 items-center gap-2 rounded-lg border-t-2 px-2 transition-colors duration-300 sm:h-16 sm:gap-3 sm:px-3",
				named ? cn(VERDICT_STYLE.match, "border-emerald-300/70") : cn("bg-card ring-border ring-1 ring-inset", over ? "border-muted-foreground/30" : "border-foreground/25"),
				offset && "sm:translate-y-1/2",
			)}
		>
			<span className={cn("w-7 shrink-0 text-xs font-semibold tabular-nums sm:w-9 sm:text-sm", named ? "text-white/85" : "text-muted-foreground")}>{slot.label}</span>
			<div className="min-w-0 flex-1 leading-tight">
				<div className={cn("truncate text-[11px] sm:text-xs", named ? "text-white/85" : "text-muted-foreground")}>{slot.clue}</div>
				{shown ? (
					<div className={cn("flex min-w-0 items-center gap-1.5", named ? "animate-in zoom-in-50 fade-in-0 duration-300" : "opacity-60")}>
						<span className="hidden shrink-0 sm:inline-flex">
							<Flag code={d.flag} className="text-xs" />
						</span>
						<ULink
							href={href.driver(d.id)}
							data-card={`driver:${d.id}`}
							className={cn("truncate text-[13px] font-semibold underline-offset-4 hover:underline sm:text-sm", !named && "text-muted-foreground font-medium")}
						>
							<span className="sm:hidden">{d.first ? `${d.first[0]}. ${d.last}` : d.name}</span>
							<span className="hidden sm:inline">{d.name}</span>
						</ULink>
					</div>
				) : (
					<div aria-hidden className="bg-muted-foreground/20 mt-1 h-2.5 w-3/5 rounded-full" />
				)}
				<span className="sr-only">{shown ? (named ? ": named" : ": missed") : ": not named yet"}</span>
			</div>
			{named && <Check aria-hidden className="hidden size-4 shrink-0 opacity-90 sm:block" strokeWidth={2.5} />}
		</li>
	);
}
