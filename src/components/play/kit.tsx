"use client";

// Shared UI for the daily games under /play, pulled out of "Guess the driver" so every game
// looks and behaves the same: header with Daily/Practice and Stats, loading/error states, the
// search picker, verdict tiles, the end-of-game card with share and countdown, and the stats
// dialog. The pure half (calendar, picks, stats, storage) is lib/game/daily.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, BarChart3, Check, ChevronsDown, ChevronsUp, CircleDot, Dices, RotateCcw, Search, Share2, Timer, X, type LucideIcon } from "lucide-react";
import { currentStreak, dayIndex, msToNextPuzzle, puzzleNumber, searchByName, type Direction, type GameMode, type GameStats, type Verdict } from "@/lib/game/daily";
import { cn } from "@/lib/utils";
import { Hint, num, PageHeader } from "../f1";
import { ULink } from "../universe-link";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

/* ---------------------------------------------------------------- hooks --- */

/** Today's puzzle day (null until mounted, so server and client render alike) and a rollover callback for Countdown. */
export function useToday() {
	const [today, setToday] = useState<number | null>(null);
	useEffect(() => setToday(dayIndex()), []);
	const rollover = useCallback(() => setToday(dayIndex()), []);
	return { today, rollover };
}

/** A loader for a static JSON file, fetched once per page load and retried after a failure. */
export function jsonLoader<F, T>(url: string, map: (file: F) => T): () => Promise<T> {
	let promise: Promise<T> | undefined;
	return () =>
		(promise ??= fetch(url)
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json() as Promise<F>;
			})
			.then(map)
			.catch((e) => {
				promise = undefined;
				throw e;
			}));
}

/** Runs a loader (from jsonLoader, defined at module level) on mount: the data, an error flag, and retry for GameError. */
export function useGameData<T>(loader: () => Promise<T>) {
	const [data, setData] = useState<T | null>(null);
	const [error, setError] = useState(false);
	const retry = useCallback(() => {
		setError(false);
		loader()
			.then(setData)
			.catch(() => setError(true));
	}, [loader]);
	useEffect(() => retry(), [retry]);
	return { data, error, retry };
}

/* --------------------------------------------------------------- header --- */

export type Choice<T extends string> = { id: T; label: string; description?: string };

/** A small segmented control (e.g. difficulty) styled like the Daily/Practice toggle. */
export function ChoiceToggle<T extends string>({ value, options, onChange }: { value: T; options: Choice<T>[]; onChange: (value: T) => void }) {
	return (
		<ToggleGroup variant="outline" size="sm" spacing={0} value={value} onValueChange={(v: string) => v && onChange(v as T)}>
			{options.map((o) => (
				<ToggleGroupItem key={o.id} value={o.id} aria-label={o.description ? `${o.label}: ${o.description}` : undefined}>
					{o.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}

const MODES: Choice<GameMode>[] = [
	{ id: "daily", label: "Daily" },
	{ id: "practice", label: "Practice" },
];

/** The page header: Play breadcrumb with the puzzle number, title, description (children), then Daily/Practice, extra `controls` and Stats. */
export function GameHeader({
	title,
	today,
	mode,
	onModeChange,
	controls,
	onStats,
	practiceLabel = "Practice",
	children,
}: {
	title: React.ReactNode;
	today: number | null;
	mode: GameMode;
	/** Omit for daily-only games: hides the Daily/Practice toggle. */
	onModeChange?: (mode: GameMode) => void;
	controls?: React.ReactNode;
	onStats: () => void;
	/** What the practice mode is called (e.g. "Endless"). */
	practiceLabel?: string;
	children?: React.ReactNode;
}) {
	return (
		<PageHeader
			eyebrow={
				<>
					<ULink href="/play" className="underline-offset-4 hover:underline">
						Play
					</ULink>
					{today != null && mode === "daily" && <span>· Puzzle #{puzzleNumber(today)}</span>}
					{mode === "practice" && <span>· {practiceLabel}</span>}
				</>
			}
			title={title}
			actions={
				<>
					{onModeChange && <ChoiceToggle value={mode} options={MODES.map((m) => (m.id === "practice" ? { ...m, label: practiceLabel } : m))} onChange={onModeChange} />}
					{controls}
					<Button variant="outline" size="sm" onClick={onStats}>
						<BarChart3 data-icon="inline-start" />
						Stats
					</Button>
				</>
			}
		>
			{children}
		</PageHeader>
	);
}

/* --------------------------------------------------------------- states --- */

/** Placeholder while the game's data loads. */
export function GameLoading() {
	return (
		<div className="space-y-3">
			<Skeleton className="h-10 w-full" />
			<Skeleton className="h-24 w-full" />
		</div>
	);
}

/** Load failure with a Retry button; `what` completes "Couldn't load …". */
export function GameError({ what, onRetry }: { what: string; onRetry: () => void }) {
	return (
		<Card>
			<CardContent className="flex items-center justify-between gap-4">
				<span className="text-muted-foreground text-sm">Couldn&apos;t load {what}.</span>
				<Button variant="outline" size="sm" onClick={onRetry}>
					<RotateCcw data-icon="inline-start" />
					Retry
				</Button>
			</CardContent>
		</Card>
	);
}

/* --------------------------------------------------------------- picker --- */

/**
 * Something to pick: label is searched; higher `weight` ranks first among equal matches.
 * `sublabel` only tells apart items sharing a label, so it is shown for those alone.
 */
export type PickerItem = { id: string; label: string; sublabel?: React.ReactNode; weight?: number };

/**
 * Search box with a keyboard-navigable suggestion list (↑/↓, Enter, Escape). Items in
 * `exclude` (e.g. already guessed) are never offered. Keep `items` memoised. Options show
 * the name alone: a flag or years would answer the games' clues.
 */
export function EntityPicker<T extends PickerItem>({
	items,
	exclude,
	onPick,
	label,
	placeholder,
	noun,
	autoFocus = true,
}: {
	items: T[];
	exclude: string[];
	onPick: (item: T) => void;
	/** Accessible name of the input, e.g. "Guess a driver". */
	label: string;
	placeholder: string;
	/** Plural for the list and live region, e.g. "drivers". */
	noun: string;
	autoFocus?: boolean;
}) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const input = useRef<HTMLInputElement>(null);
	const id = useId();
	const hits = useMemo(() => searchByName(items, query, (d) => d.label, (d) => d.weight ?? 0, new Set(exclude)), [items, query, exclude]);
	const shared = useMemo(() => {
		const seen = new Set<string>();
		const twice = new Set<string>();
		for (const d of items) (seen.has(d.label) ? twice : seen).add(d.label);
		return twice;
	}, [items]);
	const show = open && query.trim().length > 0;
	const singular = noun.replace(/s$/, "");

	useEffect(() => {
		if (autoFocus) input.current?.focus();
	}, [autoFocus]);

	const pick = (d: T | undefined) => {
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
				aria-label={label}
				placeholder={placeholder}
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
					aria-label={noun[0].toUpperCase() + noun.slice(1)}
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
								<span className="min-w-0 flex-1 truncate font-medium">{d.label}</span>
								{d.sublabel != null && shared.has(d.label) && <span className="text-muted-foreground text-xs tabular-nums">{d.sublabel}</span>}
							</li>
						))
					) : (
						<li className="text-muted-foreground px-3 py-2 text-sm">
							No {singular} matches &ldquo;{query.trim()}&rdquo;
						</li>
					)}
				</ul>
			)}
			{show && hits.length > 0 && (
				<p className="sr-only" aria-live="polite">
					{hits.length} {noun} found. Use the arrow keys and Enter to guess.
				</p>
			)}
		</div>
	);
}

/* ---------------------------------------------------------------- tiles --- */

/** Colours for verdict tiles and swatches. */
export const VERDICT_STYLE: Record<Verdict, string> = {
	match: "bg-emerald-600 text-white dark:bg-emerald-600",
	close: "bg-amber-400 text-amber-950 dark:bg-amber-400",
	miss: "bg-muted text-foreground ring-1 ring-inset ring-border",
};

/** The icon for a verdict: a tick, ↑/↓ when close, ⇈/⇊ when far, else `closeIcon` (close, no direction) or ✕. */
export function verdictIcon(verdict: Verdict, direction: Direction, closeIcon: LucideIcon = CircleDot): LucideIcon {
	if (verdict === "match") return Check;
	if (direction) return verdict === "close" ? (direction === "higher" ? ArrowUp : ArrowDown) : direction === "higher" ? ChevronsUp : ChevronsDown;
	return verdict === "close" ? closeIcon : X;
}

/**
 * One coloured clue cell (role="cell") that pops in after `delay` ms, with a hover hint and a
 * screen-reader description. `icon` defaults to verdictIcon(verdict, direction).
 */
export function ClueTile({
	verdict,
	direction = null,
	icon,
	hint,
	srText,
	delay = 0,
	className,
	children,
}: {
	verdict: Verdict;
	direction?: Direction;
	icon?: LucideIcon | null;
	hint: React.ReactNode;
	srText: string;
	delay?: number;
	className?: string;
	children: React.ReactNode;
}) {
	const Icon = icon === undefined ? verdictIcon(verdict, direction) : icon;
	return (
		<Hint label={hint} className="flex w-full min-w-0">
			<div
				role="cell"
				className={cn(
					"animate-in fade-in-0 zoom-in-75 fill-mode-both relative flex h-16 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 duration-500 sm:h-[4.5rem]",
					VERDICT_STYLE[verdict],
					className,
				)}
				style={{ animationDelay: `${delay}ms` }}
			>
				{children}
				{Icon && <Icon aria-hidden className="size-3.5 opacity-90 sm:size-4" strokeWidth={2.5} />}
				<span className="sr-only">{srText}</span>
			</div>
		</Hint>
	);
}

/** A small verdict swatch with a label, for legends. */
export function LegendItem({ verdict, icon: Icon, children }: { verdict: Verdict; icon: LucideIcon; children: React.ReactNode }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<span className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded", VERDICT_STYLE[verdict])}>
				<Icon className="size-3" strokeWidth={2.5} />
			</span>
			{children}
		</span>
	);
}

/** The key under a board: match, close (what counts as close), miss, and optionally what the arrows mean. */
export function Legend({ close, direction }: { close: React.ReactNode; direction?: React.ReactNode }) {
	return (
		<div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2 text-xs">
			<LegendItem verdict="match" icon={Check}>
				Match
			</LegendItem>
			<LegendItem verdict="close" icon={ArrowUp}>
				{close}
			</LegendItem>
			<LegendItem verdict="miss" icon={X}>
				Miss
			</LegendItem>
			{direction && (
				<span className="inline-flex items-center gap-1.5">
					<ArrowUp className="size-3.5" />
					<ChevronsUp className="size-3.5" />
					{direction}
				</span>
			)}
		</div>
	);
}

/* --------------------------------------------------------------- result --- */

/**
 * Copies a share text to the clipboard with a toast. With `native`, phones and tablets get
 * the system share sheet instead (falling back to the clipboard).
 */
export async function shareResult(text: string, { native = false, description = "Paste it anywhere to share your grid." } = {}) {
	if (native && typeof navigator.share === "function" && matchMedia("(pointer: coarse)").matches) {
		try {
			await navigator.share({ text });
			return;
		} catch (e) {
			if ((e as Error)?.name === "AbortError") return;
		}
	}
	try {
		await navigator.clipboard.writeText(text);
		toast.success("Result copied", { description });
	} catch {
		toast.error("Couldn't copy to the clipboard");
	}
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Time to the next puzzle (UTC midnight), ticking every second; calls onRollover once the day changes. */
export function Countdown({ onRollover, label = "Next puzzle in" }: { onRollover: () => void; label?: string }) {
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
			{label}{" "}
			<span className="text-foreground font-medium tabular-nums" suppressHydrationWarning>
				{pad(Math.floor(s / 3600))}:{pad(Math.floor(s / 60) % 60)}:{pad(s % 60)}
			</span>
		</div>
	);
}

/**
 * The end-of-game card: a status line (green when won), the game's reveal (children), and an
 * actions column sized to its content (Share, Practice/next, and in daily mode Your stats and
 * the countdown).
 */
export function ResultCard({
	won,
	status,
	mode,
	nextLabel,
	countdownLabel,
	onShare,
	onNext,
	onStats,
	onRollover,
	children,
}: {
	won: boolean;
	status: React.ReactNode;
	mode: GameMode;
	/** Label for the practice button, e.g. "Practice with a random driver". */
	nextLabel: React.ReactNode;
	countdownLabel?: string;
	onShare: () => void;
	onNext: () => void;
	onStats: () => void;
	onRollover: () => void;
	children: React.ReactNode;
}) {
	return (
		<Card className="animate-in fade-in-0 slide-in-from-top-2 overflow-hidden duration-500">
			<CardContent className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
				<div className="min-w-0 space-y-3">
					<div className={cn("text-sm font-medium", won ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>{status}</div>
					{children}
				</div>
				<div className="flex shrink-0 flex-col gap-2 md:min-w-56">
					<Button onClick={onShare}>
						<Share2 data-icon="inline-start" />
						Share result
					</Button>
					<Button variant="outline" onClick={onNext}>
						<Dices data-icon="inline-start" />
						{nextLabel}
					</Button>
					{mode === "daily" && (
						<>
							<Button variant="ghost" onClick={onStats}>
								<BarChart3 data-icon="inline-start" />
								Your stats
							</Button>
							<Countdown onRollover={onRollover} label={countdownLabel} />
						</>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

/** A row of labelled figures (label above a big number), as in the reveal's career stats. */
export function Figures({ items }: { items: [string, number][] }) {
	return (
		<dl className="flex flex-wrap gap-x-6 gap-y-2">
			{items.map(([label, v]) => (
				<div key={label}>
					<dt className="text-muted-foreground text-xs">{label}</dt>
					<dd className="text-lg font-semibold tabular-nums">{num(v)}</dd>
				</div>
			))}
		</dl>
	);
}

/* ---------------------------------------------------------------- stats --- */

/**
 * Played / Win % / Streak / Best streak and a bar per distribution bucket. `highlight` is the
 * bucket of today's result; `bucketLabel` names a bucket (default: its 1-based number).
 */
export function StatsDialog({
	open,
	onOpenChange,
	stats,
	today,
	description,
	distributionTitle = "Guess distribution",
	distributionLabel = "Wins by number of guesses",
	bucketLabel = (i) => String(i + 1),
	bucketSrLabel = (i) => `wins in ${i + 1}`,
	labelClassName = "w-3",
	highlight,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	stats: GameStats;
	today: number | null;
	description: React.ReactNode;
	distributionTitle?: string;
	/** Accessible name of the distribution list. */
	distributionLabel?: string;
	bucketLabel?: (i: number) => React.ReactNode;
	/** Screen-reader text after a bucket's count, e.g. "wins in 3". */
	bucketSrLabel?: (i: number) => string;
	/** Width of the bucket label column; widen it for labels longer than one digit. */
	labelClassName?: string;
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
					<DialogDescription>{description}</DialogDescription>
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
					<div className="text-sm font-medium">{distributionTitle}</div>
					<ol className="space-y-1" aria-label={distributionLabel}>
						{stats.distribution.map((count, i) => (
							<li key={i} className="flex items-center gap-2 text-xs">
								<span className={cn("text-muted-foreground shrink-0 text-right tabular-nums", labelClassName)}>{bucketLabel(i)}</span>
								<div className="flex-1">
									<div
										className={cn(
											"flex h-5 min-w-6 items-center justify-end rounded-r-[4px] px-1.5 font-medium tabular-nums",
											highlight === i ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
										)}
										style={{ width: `${(count / max) * 100}%` }}
									>
										{count}
										<span className="sr-only"> {bucketSrLabel(i)}</span>
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
