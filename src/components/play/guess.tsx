"use client";

// Daily "Guess the driver" game (/play/guess). The driver list is a static file
// (public/data/guess.json); the day's mystery driver, the comparisons and the share text
// come from lib/game/guess. Progress and stats live in localStorage, per difficulty.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	ArrowDown,
	ArrowUp,
	BarChart3,
	Check,
	ChevronsDown,
	ChevronsUp,
	Dices,
	Globe,
	RotateCcw,
	Search,
	Share2,
	Timer,
	Users,
	X,
	type LucideIcon,
} from "lucide-react";
import {
	ATTRIBUTES,
	compare,
	currentStreak,
	dailyTarget,
	dayIndex,
	DIFFICULTIES,
	emptyStats,
	MAX_GUESSES,
	msToNextPuzzle,
	puzzleNumber,
	randomTarget,
	recordResult,
	searchDrivers,
	shareText,
	unpack,
	type Comparison,
	type Difficulty,
	type GuessDriver,
	type GuessFile,
	type GuessStats,
	type Tile,
	type Verdict,
} from "@/lib/game/guess";
import { cn } from "@/lib/utils";
import { Flag, Hint, href, num, Page, PageHeader } from "../f1";
import { ULink } from "../universe-link";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Kbd } from "../ui/kbd";
import { Skeleton } from "../ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

type Data = { drivers: GuessDriver[]; byId: Map<string, GuessDriver>; teams: Record<string, string> };
type Mode = "daily" | "practice";
type DailySave = { day: number; guesses: string[] };

let dataPromise: Promise<Data> | undefined;
const loadData = () =>
	(dataPromise ??= fetch("/data/guess.json")
		.then((r) => {
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			return r.json() as Promise<GuessFile>;
		})
		.then((f) => {
			const drivers = f.drivers.map(unpack);
			return { drivers, byId: new Map(drivers.map((d) => [d.id, d])), teams: f.teams };
		})
		.catch((e) => {
			dataPromise = undefined;
			throw e;
		}));

const KEY = "pitwall-guess";
function read<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(`${KEY}:${key}`);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}
function write(key: string, value: unknown) {
	try {
		localStorage.setItem(`${KEY}:${key}`, JSON.stringify(value));
	} catch {}
}
const readStats = (difficulty: Difficulty) => ({ ...emptyStats(), ...read<Partial<GuessStats>>(`stats:${difficulty}`, {}) });

export function GuessGame() {
	const [data, setData] = useState<Data | null>(null);
	const [error, setError] = useState(false);
	const [today, setToday] = useState<number | null>(null);
	const [difficulty, setDifficultyState] = useState<Difficulty>("modern");
	const [mode, setMode] = useState<Mode>("daily");
	const [daily, setDaily] = useState<string[]>([]);
	const [stats, setStats] = useState<GuessStats>(emptyStats);
	const [practice, setPractice] = useState<{ target: string; guesses: string[] } | null>(null);
	const [statsOpen, setStatsOpen] = useState(false);

	const load = useCallback(() => {
		setError(false);
		loadData()
			.then(setData)
			.catch(() => setError(true));
	}, []);

	useEffect(() => {
		load();
		setToday(dayIndex());
		setDifficultyState(read<Difficulty>("difficulty", "modern") === "all" ? "all" : "modern");
	}, [load]);

	// the day's saved progress and stats for this difficulty
	useEffect(() => {
		if (today == null) return;
		const save = read<DailySave | null>(`daily:${difficulty}`, null);
		setDaily(save?.day === today ? save.guesses : []);
		setStats(readStats(difficulty));
	}, [today, difficulty]);

	const setDifficulty = (d: Difficulty) => {
		setDifficultyState(d);
		write("difficulty", d);
		setPractice(null);
	};

	const target = useMemo(() => {
		if (!data || today == null) return null;
		if (mode === "daily") return dailyTarget(data.drivers, difficulty, today);
		return practice ? (data.byId.get(practice.target) ?? null) : null;
	}, [data, today, mode, difficulty, practice]);

	// a practice driver whenever practice starts without one
	useEffect(() => {
		if (data && mode === "practice" && !practice) setPractice({ target: randomTarget(data.drivers, difficulty).id, guesses: [] });
	}, [data, mode, practice, difficulty]);

	const guesses = mode === "daily" ? daily : (practice?.guesses ?? []);
	const rows = useMemo(
		() => (data && target ? guesses.map((id) => data.byId.get(id)).filter((d) => !!d).map((d) => compare(d, target)) : []),
		[data, target, guesses],
	);
	const won = rows.some((r) => r.correct);
	const over = won || rows.length >= MAX_GUESSES;

	const guess = (d: GuessDriver) => {
		if (over || !target || today == null) return;
		const next = [...guesses, d.id];
		if (mode === "practice") {
			setPractice((p) => p && { ...p, guesses: next });
			return;
		}
		setDaily(next);
		write(`daily:${difficulty}`, { day: today, guesses: next } satisfies DailySave);
		const done = d.id === target.id || next.length >= MAX_GUESSES;
		if (done) {
			const s = recordResult(readStats(difficulty), today, d.id === target.id, next.length);
			write(`stats:${difficulty}`, s);
			setStats(s);
		}
	};

	const share = async () => {
		if (today == null) return;
		const diff = difficulty === "all" ? " (All time)" : "";
		const label = mode === "daily" ? `#${puzzleNumber(today)}${diff}` : `practice${diff}`;
		const text = shareText({ rows, won, label, url: `${location.origin}/play/guess` });
		try {
			await navigator.clipboard.writeText(text);
			toast.success("Result copied", { description: "Paste it anywhere to share your grid." });
		} catch {
			toast.error("Couldn't copy to the clipboard");
		}
	};

	const ready = data && target && today != null;
	return (
		<Page className="max-w-5xl space-y-8">
			<PageHeader
				eyebrow={
					<>
						<ULink href="/play" className="underline-offset-4 hover:underline">
							Play
						</ULink>
						{today != null && mode === "daily" && <span>· Puzzle #{puzzleNumber(today)}</span>}
						{mode === "practice" && <span>· Practice</span>}
					</>
				}
				title="Guess the driver"
				actions={
					<>
						<ToggleGroup variant="outline" size="sm" spacing={0} value={mode} onValueChange={(v: string) => v && setMode(v as Mode)}>
							<ToggleGroupItem value="daily">Daily</ToggleGroupItem>
							<ToggleGroupItem value="practice">Practice</ToggleGroupItem>
						</ToggleGroup>
						<ToggleGroup variant="outline" size="sm" spacing={0} value={difficulty} onValueChange={(v: string) => v && setDifficulty(v as Difficulty)}>
							{DIFFICULTIES.map((d) => (
								<ToggleGroupItem key={d.id} value={d.id} aria-label={`${d.label}: ${d.description}`}>
									{d.label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
						<Button variant="outline" size="sm" onClick={() => setStatsOpen(true)}>
							<BarChart3 data-icon="inline-start" />
							Stats
						</Button>
					</>
				}
			>
				A new mystery driver every day at midnight UTC, the same for everyone. You have {MAX_GUESSES} guesses: each one shows how close it was on
				nationality, career span, teams and results. {DIFFICULTIES.find((d) => d.id === difficulty)!.description}.
			</PageHeader>

			{error ? (
				<Card>
					<CardContent className="flex items-center justify-between gap-4">
						<span className="text-muted-foreground text-sm">Couldn&apos;t load the drivers.</span>
						<Button variant="outline" size="sm" onClick={load}>
							<RotateCcw data-icon="inline-start" />
							Retry
						</Button>
					</CardContent>
				</Card>
			) : !ready ? (
				<div className="space-y-3">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-24 w-full" />
				</div>
			) : (
				<div className="space-y-6">
					{over ? (
						<Reveal
							target={target}
							teams={data.teams}
							won={won}
							guesses={rows.length}
							mode={mode}
							onShare={share}
							onStats={() => setStatsOpen(true)}
							onNext={() => {
								setMode("practice");
								setPractice({ target: randomTarget(data.drivers, difficulty, Math.random, target.id).id, guesses: [] });
							}}
							onRollover={() => setToday(dayIndex())}
						/>
					) : (
						<div className="space-y-2">
							<DriverPicker drivers={data.drivers} exclude={guesses} onPick={guess} />
							<div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
								<span className="flex items-center gap-1.5">
									Guess {rows.length + 1} of {MAX_GUESSES}
									<span className="hidden items-center gap-1.5 sm:inline-flex">
										· <Kbd>↑</Kbd>
										<Kbd>↓</Kbd> to choose, <Kbd>Enter</Kbd> to guess
									</span>
								</span>
								{mode === "practice" && (
									<Button variant="ghost" size="xs" onClick={() => setPractice({ target: randomTarget(data.drivers, difficulty, Math.random, target.id).id, guesses: [] })}>
										<Dices data-icon="inline-start" />
										New driver
									</Button>
								)}
							</div>
						</div>
					)}
					<Board rows={rows} teams={data.teams} />
					<Legend />
				</div>
			)}

			<StatsDialog open={statsOpen} onOpenChange={setStatsOpen} stats={stats} today={today} difficulty={difficulty} highlight={mode === "daily" && won ? rows.length : null} />
		</Page>
	);
}

/* --------------------------------------------------------------- picker --- */

function DriverPicker({ drivers, exclude, onPick }: { drivers: GuessDriver[]; exclude: string[]; onPick: (d: GuessDriver) => void }) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const input = useRef<HTMLInputElement>(null);
	const id = useId();
	const hits = useMemo(() => searchDrivers(drivers, query, new Set(exclude)), [drivers, query, exclude]);
	const show = open && query.trim().length > 0;

	useEffect(() => input.current?.focus(), []);

	const pick = (d: GuessDriver | undefined) => {
		if (!d) return;
		onPick(d);
		setQuery("");
		setActive(0);
		input.current?.focus();
	};

	return (
		<div className="relative">
			<Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
			<Input
				ref={input}
				role="combobox"
				aria-expanded={show}
				aria-controls={`${id}-list`}
				aria-autocomplete="list"
				aria-activedescendant={show && hits[active] ? `${id}-${hits[active].id}` : undefined}
				aria-label="Guess a driver"
				placeholder="Type a driver's name…"
				autoComplete="off"
				spellCheck={false}
				className="h-11 pl-9 text-base md:text-base"
				value={query}
				onChange={(e) => {
					setQuery(e.target.value);
					setActive(0);
					setOpen(true);
				}}
				onFocus={() => setOpen(true)}
				onBlur={() => setOpen(false)}
				onKeyDown={(e) => {
					if (e.key === "ArrowDown" || e.key === "ArrowUp") {
						e.preventDefault();
						setOpen(true);
						if (hits.length) setActive((a) => (a + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length);
					} else if (e.key === "Enter") {
						e.preventDefault();
						if (show) pick(hits[active]);
					} else if (e.key === "Escape") {
						if (show) e.preventDefault();
						setOpen(false);
					}
				}}
			/>
			{show && (
				<ul
					id={`${id}-list`}
					role="listbox"
					aria-label="Drivers"
					className="bg-popover text-popover-foreground ring-foreground/10 animate-in fade-in-0 zoom-in-95 absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-2xl p-1 shadow-lg ring-1"
				>
					{hits.length ? (
						hits.map((d, i) => (
							<li
								key={d.id}
								id={`${id}-${d.id}`}
								role="option"
								aria-selected={i === active}
								onMouseDown={(e) => e.preventDefault()}
								onMouseMove={() => setActive(i)}
								onClick={() => pick(d)}
								className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm", i === active && "bg-muted")}
							>
								<Flag code={d.flag} />
								<span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
								<span className="text-muted-foreground text-xs tabular-nums">{d.first === d.last ? d.first : `${d.first}–${d.last}`}</span>
							</li>
						))
					) : (
						<li className="text-muted-foreground px-3 py-2 text-sm">No driver matches &ldquo;{query.trim()}&rdquo;</li>
					)}
				</ul>
			)}
			{show && hits.length > 0 && (
				<p className="sr-only" aria-live="polite">
					{hits.length} drivers found. Use the arrow keys and Enter to guess.
				</p>
			)}
		</div>
	);
}

/* ---------------------------------------------------------------- board --- */

const GRID = "grid grid-cols-7 gap-1 sm:grid-cols-[minmax(9rem,1.6fr)_repeat(7,minmax(0,1fr))] sm:gap-1.5";

function Board({ rows, teams }: { rows: Comparison[]; teams: Record<string, string> }) {
	if (!rows.length) return null;
	return (
		<div className="space-y-2" role="table" aria-label="Your guesses">
			<div className={cn(GRID, "text-muted-foreground text-[11px] font-medium sm:text-xs")} role="row">
				<div className="hidden sm:block" role="columnheader">
					Driver
				</div>
				{ATTRIBUTES.map((a) => (
					<div key={a.key} className="truncate text-center" role="columnheader">
						<span className="sm:hidden">{a.short}</span>
						<span className="hidden sm:inline">{a.label}</span>
					</div>
				))}
			</div>
			{[...rows].reverse().map((r, i) => (
				<GuessRow key={r.guess.id} row={r} n={rows.length - i} teams={teams} />
			))}
		</div>
	);
}

const VERDICT_STYLE: Record<Verdict, string> = {
	match: "bg-emerald-600 text-white dark:bg-emerald-600",
	close: "bg-amber-400 text-amber-950 dark:bg-amber-400",
	miss: "bg-muted text-foreground ring-1 ring-inset ring-border",
};
const VERDICT_LABEL: Record<Verdict, string> = { match: "match", close: "close", miss: "miss" };

function GuessRow({ row, n, teams }: { row: Comparison; n: number; teams: Record<string, string> }) {
	const d = row.guess;
	return (
		<div className={GRID} role="row">
			<div className="col-span-7 flex min-w-0 items-center gap-2 px-0.5 text-sm sm:col-span-1" role="rowheader">
				<span className="text-muted-foreground w-4 shrink-0 text-xs tabular-nums">{n}</span>
				<ULink href={href.driver(d.id)} data-card={`driver:${d.id}`} className="truncate font-medium underline-offset-4 hover:underline">
					{d.name}
				</ULink>
			</div>
			{row.tiles.map((t, i) => (
				<TileView key={t.key} tile={t} driver={d} teams={teams} delay={i * 90} />
			))}
		</div>
	);
}

function TileView({ tile, driver: d, teams, delay }: { tile: Tile; driver: GuessDriver; teams: Record<string, string>; delay: number }) {
	const attr = ATTRIBUTES.find((a) => a.key === tile.key)!;
	const teamName = (id: string) => teams[id] ?? id;
	let value: React.ReactNode;
	let text: string;
	let icon: LucideIcon | null = null;
	if (tile.verdict === "match") icon = Check;
	else if (tile.direction) icon = tile.verdict === "close" ? (tile.direction === "higher" ? ArrowUp : ArrowDown) : tile.direction === "higher" ? ChevronsUp : ChevronsDown;
	else if (tile.verdict === "close") icon = tile.key === "nation" ? Globe : Users;
	else icon = X;

	let hint: React.ReactNode;
	if (tile.key === "nation") {
		value = (
			<>
				<Flag code={d.flag} className="text-base sm:text-lg" />
				<span className="hidden max-w-full truncate text-[11px] font-medium sm:block">{d.nation}</span>
			</>
		);
		text = d.nation;
		hint = tile.verdict === "match" ? `Same nationality: ${d.nation}` : tile.verdict === "close" ? `${d.nation}: same continent` : `Not ${d.nation}, and another continent`;
	} else if (tile.key === "teams") {
		const shared = "shared" in tile ? (tile.shared as string[]) : [];
		const lead = shared[0] ?? d.teams[d.teams.length - 1];
		const more = (shared.length ? shared.length : d.teams.length) - 1;
		value = (
			<span className="flex max-w-full min-w-0 flex-col items-center leading-tight">
				<span className="max-w-full truncate text-[11px] font-semibold sm:text-xs">{teamName(lead)}</span>
				{more > 0 && <span className="text-[10px] opacity-80">+{more}</span>}
			</span>
		);
		text = d.teams.map(teamName).join(", ");
		hint = (
			<div className="max-w-64 space-y-1">
				<div>Raced for {text}.</div>
				<div>
					{tile.verdict === "match"
						? "Exactly the same teams."
						: shared.length
							? `In common: ${shared.map(teamName).join(", ")}.`
							: "No team in common."}
				</div>
			</div>
		);
	} else {
		const v = d[tile.key];
		value = <span className="text-sm font-semibold tabular-nums sm:text-base">{tile.key === "first" || tile.key === "last" ? v : num(v)}</span>;
		text = String(v);
		const more = tile.key === "first" || tile.key === "last" ? (tile.direction === "higher" ? "later" : "earlier") : tile.direction === "higher" ? "more" : "fewer";
		hint =
			tile.verdict === "match"
				? `${attr.label}: ${text}, a match`
				: `${attr.label}: the mystery driver's is ${more}${tile.verdict === "close" && attr.close ? ` (${attr.close})` : ""}`;
	}
	const Icon = icon;
	return (
		<Hint label={hint} className="flex w-full min-w-0">
			<div
				role="cell"
				className={cn(
					"animate-in fade-in-0 zoom-in-75 fill-mode-both relative flex h-16 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 duration-500 sm:h-[4.5rem]",
					VERDICT_STYLE[tile.verdict],
				)}
				style={{ animationDelay: `${delay}ms` }}
			>
				{value}
				{Icon && <Icon aria-hidden className="size-3.5 opacity-90 sm:size-4" strokeWidth={2.5} />}
				<span className="sr-only">
					{attr.label} {text}: {VERDICT_LABEL[tile.verdict]}
					{tile.direction ? `, mystery driver's is ${tile.direction}` : ""}
				</span>
			</div>
		</Hint>
	);
}

function Legend() {
	const item = (verdict: Verdict, Icon: LucideIcon, label: string) => (
		<span className="inline-flex items-center gap-1.5">
			<span className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded", VERDICT_STYLE[verdict])}>
				<Icon className="size-3" strokeWidth={2.5} />
			</span>
			{label}
		</span>
	);
	return (
		<div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2 text-xs">
			{item("match", Check, "Match")}
			{item("close", ArrowUp, "Close: same continent, a team in common, or within 5 seasons, 25 starts or 5 wins")}
			{item("miss", X, "Miss")}
			<span className="inline-flex items-center gap-1.5">
				<ArrowUp className="size-3.5" />
				<ChevronsUp className="size-3.5" />
				The mystery driver&apos;s number is higher (double arrow: by a lot)
			</span>
		</div>
	);
}

/* --------------------------------------------------------------- reveal --- */

function Reveal({
	target: d,
	teams,
	won,
	guesses,
	mode,
	onShare,
	onStats,
	onNext,
	onRollover,
}: {
	target: GuessDriver;
	teams: Record<string, string>;
	won: boolean;
	guesses: number;
	mode: Mode;
	onShare: () => void;
	onStats: () => void;
	onNext: () => void;
	onRollover: () => void;
}) {
	const stats: [string, number][] = [
		["Starts", d.starts],
		["Wins", d.wins],
		["Podiums", d.podiums],
		["Poles", d.poles],
		["Titles", d.titles],
	];
	return (
		<Card className="animate-in fade-in-0 slide-in-from-top-2 overflow-hidden duration-500">
			<CardContent className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
				<div className="min-w-0 space-y-3">
					<div className={cn("text-sm font-medium", won ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
						{won ? (guesses === 1 ? "First time! Got it in 1." : `Got it in ${guesses} of ${MAX_GUESSES}.`) : "Out of guesses. The mystery driver was"}
					</div>
					<div className="flex items-center gap-3">
						<Flag code={d.flag} className="text-3xl" />
						<div className="min-w-0">
							<ULink href={href.driver(d.id)} data-card={`driver:${d.id}`} className="block truncate text-2xl font-semibold tracking-tight underline-offset-4 hover:underline">
								{d.name}
							</ULink>
							<div className="text-muted-foreground text-sm">
								{d.nation} · {d.first === d.last ? d.first : `${d.first}–${d.last}`}
							</div>
						</div>
					</div>
					<div className="text-muted-foreground text-sm">{d.teams.map((t) => teams[t] ?? t).join(", ")}</div>
					<dl className="flex flex-wrap gap-x-6 gap-y-2">
						{stats.map(([label, v]) => (
							<div key={label}>
								<dt className="text-muted-foreground text-xs">{label}</dt>
								<dd className="text-lg font-semibold tabular-nums">{num(v)}</dd>
							</div>
						))}
					</dl>
				</div>
				<div className="flex shrink-0 flex-col gap-2 md:w-56">
					<Button onClick={onShare}>
						<Share2 data-icon="inline-start" />
						Share result
					</Button>
					<Button variant="outline" onClick={onNext}>
						<Dices data-icon="inline-start" />
						{mode === "practice" ? "Next practice driver" : "Practice with a random driver"}
					</Button>
					{mode === "daily" && (
						<>
							<Button variant="ghost" onClick={onStats}>
								<BarChart3 data-icon="inline-start" />
								Your stats
							</Button>
							<Countdown onRollover={onRollover} />
						</>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

const pad = (n: number) => String(n).padStart(2, "0");
function Countdown({ onRollover }: { onRollover: () => void }) {
	const [ms, setMs] = useState(() => msToNextPuzzle());
	const day = useRef(dayIndex());
	useEffect(() => {
		const t = setInterval(() => {
			setMs(msToNextPuzzle());
			if (dayIndex() !== day.current) {
				day.current = dayIndex();
				onRollover();
			}
		}, 1000);
		return () => clearInterval(t);
	}, [onRollover]);
	const s = Math.floor(ms / 1000);
	return (
		<div className="text-muted-foreground flex items-center justify-center gap-1.5 pt-1 text-xs">
			<Timer className="size-3.5" />
			Next driver in{" "}
			<span className="text-foreground font-medium tabular-nums" suppressHydrationWarning>
				{pad(Math.floor(s / 3600))}:{pad(Math.floor(s / 60) % 60)}:{pad(s % 60)}
			</span>
		</div>
	);
}

/* ---------------------------------------------------------------- stats --- */

function StatsDialog({
	open,
	onOpenChange,
	stats,
	today,
	difficulty,
	highlight,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	stats: GuessStats;
	today: number | null;
	difficulty: Difficulty;
	highlight: number | null;
}) {
	const max = Math.max(1, ...stats.distribution);
	const figures: [string, React.ReactNode][] = [
		["Played", num(stats.played)],
		["Win %", stats.played ? Math.round((stats.won / stats.played) * 100) : 0],
		["Streak", today == null ? stats.streak : currentStreak(stats, today)],
		["Best streak", stats.maxStreak],
	];
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Your stats</DialogTitle>
					<DialogDescription>Daily puzzles, {DIFFICULTIES.find((d) => d.id === difficulty)!.label.toLowerCase()}. Saved in this browser.</DialogDescription>
				</DialogHeader>
				<dl className="grid grid-cols-4 gap-2 text-center">
					{figures.map(([label, v]) => (
						<div key={label} className="flex flex-col-reverse">
							<dt className="text-muted-foreground text-xs">{label}</dt>
							<dd className="text-2xl font-semibold tabular-nums">{v}</dd>
						</div>
					))}
				</dl>
				<div className="space-y-1.5">
					<div className="text-sm font-medium">Guess distribution</div>
					<ol className="space-y-1" aria-label="Wins by number of guesses">
						{stats.distribution.map((count, i) => (
							<li key={i} className="flex items-center gap-2 text-xs">
								<span className="text-muted-foreground w-3 text-right tabular-nums">{i + 1}</span>
								<div className="flex-1">
									<div
										className={cn(
											"flex h-5 min-w-6 items-center justify-end rounded-r-[4px] px-1.5 font-medium tabular-nums",
											highlight === i + 1 ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
										)}
										style={{ width: `${(count / max) * 100}%` }}
									>
										{count}
										<span className="sr-only"> wins in {i + 1}</span>
									</div>
								</div>
							</li>
						))}
					</ol>
				</div>
			</DialogContent>
		</Dialog>
	);
}
