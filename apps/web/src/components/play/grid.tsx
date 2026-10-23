"use client";

// Daily "Grid of nine" (/play/grid). The category list and memberships are a static file
// (public/data/grid.json); the day's board, the answers and the rarity scores come from
// lib/game/grid. Progress and stats live in localStorage. The shared game chrome (header,
// picker, result card, stats) is ./kit.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	Anchor,
	Ban,
	CalendarDays,
	Car,
	Check,
	Crown,
	Dices,
	Flag as FlagIcon,
	Hash,
	House,
	Info,
	List,
	Medal,
	Plus,
	Repeat,
	Timer,
	Trophy,
	Users,
	X,
	Zap,
	type LucideIcon,
} from "lucide-react";
import { gameStore, type GameMode } from "@pitwall/core/game/daily";
import {
	CELLS,
	cellAnswers,
	cellCategories,
	categoryHint,
	dailyGrid,
	driverWeight,
	emptyStats,
	fits,
	generateGrid,
	gridFromIds,
	gridIds,
	indexGrid,
	MAX_GUESSES,
	playBoard,
	puzzleNumber,
	rarity,
	recordResult,
	shareText,
	type Attempt,
	type Board,
	type Category,
	type Grid,
	type GridData,
	type GridDriver,
	type GridFile,
	type GridStats,
} from "@pitwall/core/game/grid";
import { cn } from "@/lib/utils";
import { Flag, Hint, href, Page } from "../f1";
import { ULink } from "../universe-link";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import { EntityPicker, Figures, GameError, GameHeader, GameLoading, jsonLoader, LegendItem, ResultCard, shareResult, StatsDialog, useGameData, useToday, VERDICT_STYLE } from "./kit";

const loadData = jsonLoader("/data/grid.json", (f: GridFile) => indexGrid(f));

const store = gameStore("grid");
type DailyState = { cats: string[]; attempts: Attempt[]; gaveUp?: boolean };
type PracticeState = { grid: Grid; attempts: Attempt[]; gaveUp?: boolean };
const readStats = () => store.readStats("stats", CELLS + 1);
const span = (d: GridDriver) => (d.first === d.last ? d.first : `${d.first}–${d.last}`);

export function GridGame() {
	const { data, error, retry } = useGameData(loadData);
	const { today, rollover } = useToday();
	const [mode, setMode] = useState<GameMode>("daily");
	const [daily, setDaily] = useState<DailyState | null>(null);
	const [practice, setPractice] = useState<PracticeState | null>(null);
	const [stats, setStats] = useState<GridStats>(emptyStats);
	const [best, setBest] = useState<number | null>(null);
	const [statsOpen, setStatsOpen] = useState(false);
	const [picking, setPicking] = useState<number | null>(null);
	const [flash, setFlash] = useState<{ cell: number; n: number } | null>(null);

	// today's saved progress (keeping the board it was played on, even if the data file changed since)
	useEffect(() => {
		if (today == null || !data) return;
		const save = store.readDaily<DailyState>("daily", today);
		const grid = gridFromIds(data, save?.cats) ?? dailyGrid(data, today);
		setDaily({ cats: gridIds(data, grid), attempts: save && gridFromIds(data, save.cats) ? save.attempts : [], gaveUp: save?.gaveUp });
		setStats(readStats());
		setBest(store.read<number | null>("best", null));
	}, [today, data]);

	useEffect(() => {
		if (data && mode === "practice" && !practice) setPractice({ grid: generateGrid(data, Math.random), attempts: [] });
	}, [data, mode, practice]);

	const state = mode === "daily" ? daily : practice;
	const grid = useMemo(() => (data && state ? ("grid" in state ? state.grid : gridFromIds(data, state.cats)) : null), [data, state]);
	const answers = useMemo(() => (data && grid ? Array.from({ length: CELLS }, (_, i) => cellAnswers(data, grid, i)) : null), [data, grid]);
	const board = useMemo(() => (data && grid && answers && state ? playBoard(data, grid, state.attempts, answers) : null), [data, grid, answers, state]);
	const over = !!board && (board.over || !!state?.gaveUp);

	const items = useMemo(() => data?.drivers.map((d) => ({ id: d.id, label: d.name, sublabel: span(d), weight: driverWeight(d), driver: d })) ?? [], [data]);

	const finishDaily = (b: Board) => {
		if (today == null) return;
		const s = recordResult(readStats(), today, b.filled);
		store.write("stats", s);
		setStats(s);
		const prev = store.read<number | null>("best", null);
		if (prev == null || b.rarity > prev) {
			store.write("best", b.rarity);
			setBest(b.rarity);
		}
	};

	const guess = (cell: number, d: GridDriver) => {
		if (!data || !grid || !answers || !state || over || today == null) return;
		const attempts: Attempt[] = [...state.attempts, [cell, d.id]];
		const next = playBoard(data, grid, attempts, answers);
		if (!fits(data, grid, cell, d)) {
			const [r, c] = cellCategories(grid, cell).map((i) => data.categories[i].label);
			toast(`${d.name} doesn't fit`, { description: `Not a match for ${r} × ${c}. ${next.left === 1 ? "1 guess" : `${next.left} guesses`} left.` });
			setFlash({ cell, n: (flash?.n ?? 0) + 1 });
		}
		if (mode === "practice") return setPractice({ ...(state as PracticeState), attempts });
		const save = { cats: gridIds(data, grid), attempts };
		setDaily(save);
		store.writeDaily("daily", today, save);
		if (next.over) finishDaily(next);
	};

	const giveUp = () => {
		if (!data || !grid || !board || !state || today == null) return;
		if (mode === "practice") return setPractice({ ...(state as PracticeState), gaveUp: true });
		const save = { cats: gridIds(data, grid), attempts: state.attempts, gaveUp: true };
		setDaily(save);
		store.writeDaily("daily", today, save);
		finishDaily(board);
	};

	const share = () => {
		if (today == null || !board) return;
		shareResult(shareText({ board, label: mode === "daily" ? `#${puzzleNumber(today)}` : "practice", url: `${location.origin}/play/grid` }));
	};

	const newPractice = () => {
		setMode("practice");
		setPractice({ grid: generateGrid(data!, Math.random), attempts: [] });
	};

	const ready = data && grid && answers && board && today != null;
	const pickCell = picking != null && ready ? cellCategories(grid, picking).map((i) => data.categories[i]) : null;
	return (
		<Page className="max-w-5xl space-y-8">
			<GameHeader title="Grid of nine" today={today} mode={mode} onModeChange={setMode} onStats={() => setStatsOpen(true)}>
				A new board every day at midnight UTC, the same for everyone. Each cell needs a driver who fits both its row and its column: a team, a
				nationality, a decade or a feat. You have {MAX_GUESSES} guesses, and each driver can only be used once.
			</GameHeader>

			{error ? (
				<GameError what="the grid" onRetry={retry} />
			) : !ready ? (
				<GameLoading />
			) : (
				<div className="space-y-6">
					{over && (
						<ResultCard
							won={board.filled === CELLS}
							status={board.filled === CELLS ? "Perfect grid! All nine filled." : `${board.filled} of ${CELLS} cells filled.`}
							mode={mode}
							nextLabel={mode === "practice" ? "Next practice grid" : "Practice with a random grid"}
							countdownLabel="Next grid in"
							onShare={share}
							onStats={() => setStatsOpen(true)}
							onNext={newPractice}
							onRollover={rollover}
						>
							<Figures
								items={[
									["Cells filled", board.filled],
									["Rarity score", board.rarity],
									...(mode === "daily" && best != null ? ([["Best rarity", best]] as [string, number][]) : []),
								]}
							/>
							<p className="text-muted-foreground text-sm">Every cell&apos;s answers are below: the best-known and the least-known driver who fit, and the full list behind &ldquo;See all&rdquo;.</p>
						</ResultCard>
					)}

					<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
						<BoardView
							data={data}
							grid={grid}
							board={board}
							answers={answers}
							over={over}
							flash={flash}
							onPick={setPicking}
						/>
						<SidePanel board={board} over={over} mode={mode} data={data} grid={grid} onGiveUp={giveUp} onNewGrid={newPractice} />
					</div>

					{over && <Reveal data={data} grid={grid} board={board} answers={answers} />}
				</div>
			)}

			{ready && (
				<Dialog open={picking != null && !over} onOpenChange={(o) => !o && setPicking(null)}>
					<DialogContent className="gap-4 max-sm:top-4 max-sm:translate-y-0 sm:max-w-lg">
						{pickCell && picking != null && (
							<PickerBody
								cats={pickCell}
								left={board.left}
								items={items}
								exclude={[...board.cells.flatMap((c) => (c ? [c.driver.id] : [])), ...board.misses.filter((m) => m.cell === picking).map((m) => m.driver.id)]}
								misses={board.misses.filter((m) => m.cell === picking).map((m) => m.driver)}
								onPick={(d) => {
									const cell = picking;
									setPicking(null);
									guess(cell, d);
								}}
							/>
						)}
					</DialogContent>
				</Dialog>
			)}

			<StatsDialog
				open={statsOpen}
				onOpenChange={setStatsOpen}
				stats={stats}
				today={today}
				description={
					<>
						Daily grids, saved in this browser. A win is a full grid.
						{best != null && (
							<>
								{" "}
								Best rarity score: <span className="text-foreground font-medium tabular-nums">{best}</span>.
							</>
						)}
					</>
				}
				distributionTitle="Cells filled"
				distributionLabel="Daily grids by cells filled"
				bucketLabel={(i) => String(i)}
				bucketSrLabel={(i) => `grids with ${i} filled`}
				highlight={mode === "daily" && over ? board?.filled ?? null : null}
			/>
		</Page>
	);
}

/* ------------------------------------------------------------ categories --- */

const FEAT_ICON: Record<string, LucideIcon> = {
	winner: Trophy,
	pole: Timer,
	"fastest-lap": Zap,
	podium: Medal,
	champion: Crown,
	"starts-100": Hash,
	"starts-200": Hash,
	pointless: Ban,
	monaco: Anchor,
	"home-win": House,
	"teams-5": Repeat,
};

function CategoryIcon({ cat, className }: { cat: Category; className?: string }) {
	if (cat.kind === "nation") return <Flag code={cat.flag} className={cn("text-lg sm:text-xl", className)} />;
	const Icon = cat.kind === "team" ? Car : cat.kind === "decade" ? CalendarDays : cat.kind === "mate" ? Users : (FEAT_ICON[cat.key] ?? FlagIcon);
	return (
		<span
			className={cn(
				"inline-flex size-6 shrink-0 items-center justify-center rounded-full sm:size-7",
				cat.kind === "team" ? "bg-primary/10 text-primary" : cat.kind === "decade" ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
				className,
			)}
		>
			<Icon aria-hidden className="size-3.5 sm:size-4" />
		</span>
	);
}

const kindLabel: Record<Category["kind"], string> = { team: "Team", nation: "Nationality", decade: "Decade", feat: "Feat", mate: "Team-mate" };

function CategoryHeader({ cat, axis }: { cat: Category; axis: "row" | "col" }) {
	return (
		<Hint label={categoryHint(cat)} className="flex h-full w-full min-w-0">
			<div
				role={axis === "col" ? "columnheader" : "rowheader"}
				className={cn(
					"flex h-full w-full min-w-0 flex-col items-center justify-center gap-1 text-center",
					axis === "col" ? "px-0.5 pb-1 sm:pb-2" : "pr-1 sm:flex-row sm:justify-start sm:gap-2 sm:pr-2 sm:text-left",
				)}
			>
				<CategoryIcon cat={cat} />
				<span className="line-clamp-3 min-w-0 text-[11px] leading-tight font-semibold break-words sm:text-sm">{cat.label}</span>
				<span className="sr-only">
					{" "}
					({kindLabel[cat.kind]}: {categoryHint(cat)})
				</span>
			</div>
		</Hint>
	);
}

/* ---------------------------------------------------------------- board --- */

const BOARD_GRID = "grid grid-cols-[4.25rem_repeat(3,minmax(0,1fr))] gap-1.5 sm:grid-cols-[8.5rem_repeat(3,minmax(0,1fr))] sm:gap-2";

function BoardView({
	data,
	grid,
	board,
	answers,
	over,
	flash,
	onPick,
}: {
	data: GridData;
	grid: Grid;
	board: Board;
	answers: GridDriver[][];
	over: boolean;
	flash: { cell: number; n: number } | null;
	onPick: (cell: number) => void;
}) {
	const cat = (i: number) => data.categories[i];
	return (
		<div role="grid" aria-label="Grid of nine" className="mx-auto w-full max-w-xl lg:mx-0">
			<div role="row" className={BOARD_GRID}>
				<div role="presentation" className="flex flex-col items-center justify-end pb-1 text-center sm:pb-2">
					<span className="text-xl leading-none font-semibold tabular-nums sm:text-3xl">{board.left}</span>
					<span className="text-muted-foreground text-[10px] leading-tight sm:text-xs">{board.left === 1 ? "guess left" : "guesses left"}</span>
				</div>
				{grid.cols.map((c) => (
					<CategoryHeader key={c} cat={cat(c)} axis="col" />
				))}
			</div>
			{grid.rows.map((r, ri) => (
				<div key={r} role="row" className={cn(BOARD_GRID, "mt-1.5 sm:mt-2")}>
					<CategoryHeader cat={cat(r)} axis="row" />
					{grid.cols.map((c, ci) => {
						const i = ri * 3 + ci;
						return (
							<CellView
								key={`${r}-${c}`}
								label={`${cat(r).label} × ${cat(c).label}`}
								state={board.cells[i]}
								count={answers[i].length}
								over={over}
								misses={board.misses.filter((m) => m.cell === i).length}
								flashKey={flash?.cell === i ? flash.n : 0}
								onPick={() => onPick(i)}
							/>
						);
					})}
				</div>
			))}
		</div>
	);
}

function CellView({
	label,
	state,
	count,
	over,
	misses,
	flashKey,
	onPick,
}: {
	label: string;
	state: Board["cells"][number];
	count: number;
	over: boolean;
	misses: number;
	flashKey: number;
	onPick: () => void;
}) {
	const base = "relative flex aspect-square w-full min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl p-1 text-center sm:gap-1 sm:p-2";
	if (state) {
		const d = state.driver;
		return (
			<div role="gridcell" className={cn(base, VERDICT_STYLE.match, "animate-in fade-in-0 zoom-in-75 duration-500")}>
				<Flag code={d.flag} className="text-sm sm:text-lg" />
				<span className="line-clamp-2 max-w-full text-[11px] leading-tight font-semibold break-words sm:hidden">{d.lastName}</span>
				<span className="line-clamp-2 hidden max-w-full text-sm leading-tight font-semibold sm:block">{d.name}</span>
				<span className="mt-0.5 rounded-full bg-black/20 px-1.5 text-[10px] font-medium tabular-nums sm:text-xs">
					<span className="hidden sm:inline">Rarity </span>
					{state.rarity}
				</span>
				<span className="sr-only">
					{label}: {d.name}, rarity {state.rarity} of 100
				</span>
			</div>
		);
	}
	if (over) {
		return (
			<div role="gridcell" className={cn(base, VERDICT_STYLE.miss)}>
				<X aria-hidden className="text-muted-foreground size-4 sm:size-5" />
				<span className="text-muted-foreground text-[10px] leading-tight sm:text-xs">
					{count} answers
				</span>
				<span className="sr-only">{label}: not filled</span>
			</div>
		);
	}
	return (
		<button
			type="button"
			role="gridcell"
			onClick={onPick}
			aria-label={`${label}: pick a driver${misses ? ` (${misses} wrong so far)` : ""}`}
			className={cn(
				base,
				"bg-card ring-border hover:bg-muted focus-visible:ring-ring group cursor-pointer ring-1 transition-colors ring-inset focus-visible:ring-2 focus-visible:outline-none",
			)}
		>
			<span key={flashKey} className={cn("absolute inset-0 rounded-xl", flashKey > 0 && "animate-out fade-out-0 bg-red-500/30 fill-mode-forwards duration-700")} />
			<Plus aria-hidden className="text-muted-foreground group-hover:text-foreground size-5 transition-colors sm:size-6" />
			{misses > 0 && (
				<span className="text-muted-foreground absolute right-1.5 bottom-1 text-[10px] tabular-nums sm:text-xs" aria-hidden>
					{"✕".repeat(Math.min(misses, 3))}
				</span>
			)}
		</button>
	);
}

/* ----------------------------------------------------------- side panel --- */

function SidePanel({
	board,
	over,
	mode,
	data,
	grid,
	onGiveUp,
	onNewGrid,
}: {
	board: Board;
	over: boolean;
	mode: GameMode;
	data: GridData;
	grid: Grid;
	onGiveUp: () => void;
	onNewGrid: () => void;
}) {
	const [confirm, setConfirm] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	return (
		<div className="mx-auto w-full max-w-xl space-y-5 lg:mx-0">
			<dl className={cn("grid grid-cols-2 gap-2", over && "hidden")}>
				{(
					[
						["Filled", `${board.filled}/${CELLS}`],
						["Rarity", board.rarity],
					] as const
				).map(([label, v]) => (
					<Card key={label} size="sm" className="py-3">
						<CardContent className="px-3 text-center">
							<dt className="text-muted-foreground text-xs">{label}</dt>
							<dd className="text-lg font-semibold tabular-nums sm:text-xl">{v}</dd>
						</CardContent>
					</Card>
				))}
			</dl>

			{!over && (
				<div className="flex flex-wrap items-center gap-2">
					{mode === "practice" && (
						<Button variant="outline" size="sm" onClick={onNewGrid}>
							<Dices data-icon="inline-start" />
							New grid
						</Button>
					)}
					<Button
						variant={confirm ? "destructive" : "ghost"}
						size="sm"
						onClick={() => {
							if (confirm) return onGiveUp();
							setConfirm(true);
							clearTimeout(timer.current);
							timer.current = setTimeout(() => setConfirm(false), 4000);
						}}
					>
						<FlagIcon data-icon="inline-start" />
						{confirm ? "Tap again to give up" : "Give up"}
					</Button>
				</div>
			)}

			<div className="text-muted-foreground space-y-1.5 text-xs sm:text-sm">
				<div className="text-foreground flex items-center gap-1.5 font-medium">
					<Info className="size-3.5" />
					How scoring works
				</div>
				<p>
					Every right answer scores a rarity from 0 to 100 based on how well known the driver is among everyone who fits that cell (by race starts,
					plus five per win). The best-known answer scores 0 and the least-known scores 100. Your rarity score adds up all nine cells (900 at most),
					so higher means more obscure picks.
				</p>
			</div>

			{board.misses.length > 0 && (
				<div className="space-y-1.5">
					<div className="text-sm font-medium">Wrong guesses</div>
					<ul className="space-y-1 text-xs sm:text-sm">
						{board.misses.map((m, i) => {
							const [r, c] = cellCategories(grid, m.cell).map((x) => data.categories[x].label);
							return (
								<li key={i} className="flex min-w-0 items-center gap-2">
									<X className="text-muted-foreground size-3.5 shrink-0" />
									<Flag code={m.driver.flag} />
									<span className="truncate font-medium">{m.driver.name}</span>
									<span className="text-muted-foreground min-w-0 truncate">
										{r} × {c}
									</span>
								</li>
							);
						})}
					</ul>
				</div>
			)}

			<div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2 text-xs">
				<LegendItem verdict="match" icon={Check}>
					Filled (the number is its rarity)
				</LegendItem>
				<LegendItem verdict="miss" icon={X}>
					Not filled
				</LegendItem>
			</div>
		</div>
	);
}

/* --------------------------------------------------------------- picker --- */

type Item = { id: string; label: string; sublabel: React.ReactNode; weight: number; driver: GridDriver };

function PickerBody({
	cats,
	left,
	items,
	exclude,
	misses,
	onPick,
}: {
	cats: Category[];
	left: number;
	items: Item[];
	exclude: string[];
	misses: GridDriver[];
	onPick: (d: GridDriver) => void;
}) {
	const [a, b] = cats;
	return (
		<>
			<DialogHeader className="pr-8">
				<DialogTitle className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-base leading-snug">
					<span className="inline-flex min-w-0 items-center gap-1.5">
						<CategoryIcon cat={a} />
						{a.label}
					</span>
					<span className="text-muted-foreground">×</span>
					<span className="inline-flex min-w-0 items-center gap-1.5">
						<CategoryIcon cat={b} />
						{b.label}
					</span>
				</DialogTitle>
				<DialogDescription render={<ul />} className="list-disc space-y-0.5 pl-4 text-xs sm:text-sm">
					<li>{categoryHint(a)}</li>
					<li>{categoryHint(b)}</li>
				</DialogDescription>
			</DialogHeader>
			<div className="space-y-2 pb-2">
				<EntityPicker items={items} exclude={exclude} onPick={(i) => onPick(i.driver)} label="Pick a driver for this cell" placeholder="Type a driver's name…" noun="drivers" />
				<div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
					<span>
						{left === 1 ? "Last guess" : `${left} guesses left`} · a wrong pick uses one up
					</span>
					{misses.length > 0 && <span className="truncate">Tried: {misses.map((d) => d.lastName).join(", ")}</span>}
				</div>
			</div>
			{/* room for the suggestions, which drop below the box */}
			<div aria-hidden className="text-muted-foreground flex h-56 flex-col items-center justify-center gap-2 text-center text-xs sm:h-64">
				<Users className="size-5 opacity-60" />
				Start typing a name: every driver who started a Grand Prix is in the list.
			</div>
		</>
	);
}

/* --------------------------------------------------------------- reveal --- */

function DriverName({ d }: { d: GridDriver }) {
	return (
		<ULink href={href.driver(d.id)} data-card={`driver:${d.id}`} className="inline-flex min-w-0 items-center gap-1.5 font-medium underline-offset-4 hover:underline">
			<Flag code={d.flag} />
			<span className="truncate">{d.name}</span>
		</ULink>
	);
}

function CategoryName({ cat }: { cat: Category }) {
	const link = cat.kind === "team" ? href.team(cat.key) : cat.kind === "nation" ? href.nation(cat.key) : cat.kind === "mate" ? href.driver(cat.key) : null;
	const card = cat.kind === "team" ? `team:${cat.key}` : cat.kind === "mate" ? `driver:${cat.key}` : undefined;
	return link ? (
		<ULink href={link} data-card={card} className="underline-offset-4 hover:underline">
			{cat.label}
		</ULink>
	) : (
		<span>{cat.label}</span>
	);
}

function Reveal({ data, grid, board, answers }: { data: GridData; grid: Grid; board: Board; answers: GridDriver[][] }) {
	const [open, setOpen] = useState<number | null>(null);
	// keeps the last cell while the dialog animates closed
	const [shown, setShown] = useState(0);
	return (
		<section className="space-y-3" aria-label="Answers">
			<h2 className="text-lg font-semibold tracking-tight">Answers</h2>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{answers.map((list, i) => {
					const [r, c] = cellCategories(grid, i).map((x) => data.categories[x]);
					const mine = board.cells[i];
					const rarest = list[list.length - 1];
					return (
						<Card key={i} size="sm" className="py-3">
							<CardContent className="flex h-full flex-col gap-2 px-4 text-sm">
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0 font-medium">
										<CategoryName cat={r} /> <span className="text-muted-foreground">×</span> <CategoryName cat={c} />
									</div>
									<span className="text-muted-foreground shrink-0 text-xs tabular-nums">{list.length} answers</span>
								</div>
								<dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
									<dt className="text-muted-foreground">Best known</dt>
									<dd className="min-w-0">
										<DriverName d={list[0]} />
									</dd>
									<dt className="text-muted-foreground">Least known</dt>
									<dd className="min-w-0">
										<DriverName d={rarest} />
									</dd>
									<dt className="text-muted-foreground">You</dt>
									<dd className="flex min-w-0 items-center gap-2">
										{mine ? (
											<>
												<DriverName d={mine.driver} />
												<span className={cn("shrink-0 rounded-full px-1.5 text-[11px] font-medium tabular-nums", VERDICT_STYLE.match)}>{mine.rarity}</span>
											</>
										) : (
											<span className="text-muted-foreground">Not filled</span>
										)}
									</dd>
								</dl>
								<div className="mt-auto pt-1">
									<Button
										variant="outline"
										size="sm"
										className="pointer-coarse:min-h-10"
										onClick={() => {
											setShown(i);
											setOpen(i);
										}}
										aria-label={`See all ${list.length} answers for ${r.label} × ${c.label}`}
									>
										<List data-icon="inline-start" />
										See all {list.length}
									</Button>
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>
			<Dialog open={open != null} onOpenChange={(o) => !o && setOpen(null)}>
				<DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 p-0 sm:max-w-lg">
					<AllAnswers data={data} grid={grid} cell={shown} list={answers[shown]} mine={board.cells[shown]?.driver.id ?? null} />
				</DialogContent>
			</Dialog>
		</section>
	);
}

/** Every valid answer for a cell, best known first, with the rarity each would have scored. */
function AllAnswers({ data, grid, cell, list, mine }: { data: GridData; grid: Grid; cell: number; list: GridDriver[]; mine: string | null }) {
	const [a, b] = cellCategories(grid, cell).map((x) => data.categories[x]);
	return (
		<>
			<DialogHeader className="px-4 pt-5 pr-12 sm:px-6 sm:pt-6">
				<DialogTitle className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-base leading-snug">
					<span className="inline-flex min-w-0 items-center gap-1.5">
						<CategoryIcon cat={a} />
						{a.label}
					</span>
					<span className="text-muted-foreground">×</span>
					<span className="inline-flex min-w-0 items-center gap-1.5">
						<CategoryIcon cat={b} />
						{b.label}
					</span>
				</DialogTitle>
				<DialogDescription className="text-xs sm:text-sm">
					All {list.length} {list.length === 1 ? "driver" : "drivers"} who fit, best known first. The number is the rarity that pick would have scored.
				</DialogDescription>
			</DialogHeader>
			<ScrollArea className="flex min-h-0 flex-1 flex-col" viewportClassName="max-h-[min(34rem,calc(100dvh-12rem))]">
				<ol className="space-y-0.5 px-2 pb-4 sm:px-4 sm:pb-5">
					{list.map((d, rank) => {
						const you = d.id === mine;
						const score = rarity(list, d);
						return (
							<li
								key={d.id}
								className={cn(
									"grid min-h-10 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg px-2 py-1.5 text-sm",
									you ? cn(VERDICT_STYLE.match, "[&_a]:text-white") : "odd:bg-muted/40",
								)}
							>
								<span className={cn("text-right text-xs tabular-nums", you ? "text-white/80" : "text-muted-foreground")}>{rank + 1}</span>
								<span className="flex min-w-0 flex-col leading-tight sm:flex-row sm:items-baseline sm:gap-2">
									<DriverName d={d} />
									<span className={cn("text-xs tabular-nums", you ? "text-white/80" : "text-muted-foreground")}>
										{span(d)} · {d.starts} {d.starts === 1 ? "start" : "starts"}
										{d.wins > 0 && ` · ${d.wins} ${d.wins === 1 ? "win" : "wins"}`}
										{you && <span className="font-semibold text-white"> · your pick</span>}
									</span>
								</span>
								<span
									className={cn(
										"min-w-9 rounded-full px-1.5 text-center text-xs font-medium tabular-nums",
										you ? "bg-black/20 text-white" : "bg-muted text-foreground",
									)}
									title={`Rarity ${score} of 100`}
								>
									{score}
								</span>
							</li>
						);
					})}
				</ol>
			</ScrollArea>
		</>
	);
}
