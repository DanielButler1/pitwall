"use client";

// Daily "Guess the season" game (/play/season): a mystery championship season, one clue card
// at the start and another after every wrong guess. Guesses are years, picked from a numeric
// season list that never shows the champion. Seasons come from public/data/season-guess.json;
// picks, comparisons, clues and the share text from lib/game/season-guess. Progress and stats
// live in localStorage, per pool. The shared game chrome is ./kit.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
	ArrowDown,
	ArrowUp,
	CalendarDays,
	CalendarSearch,
	ChevronsDown,
	ChevronsUp,
	Crown,
	Dices,
	Factory,
	Flag as FlagIcon,
	Lock,
	Repeat,
	Sigma,
	Swords,
	Users,
	type LucideIcon,
} from "lucide-react";
import { gameStore, type GameMode, type GameStats } from "@/lib/game/daily";
import {
	compareSeasons,
	dailySeason,
	emptyStats,
	MAX_GUESSES,
	ordinal,
	poolSeasons,
	puzzleNumber,
	round2,
	randomSeason,
	recordResult,
	SEASON_POOLS,
	SEASON_TILES,
	seasonClues,
	seasonShareText,
	searchSeasons,
	unpackSeasons,
	type SeasonClue,
	type SeasonComparison,
	type SeasonFile,
	type SeasonPool,
	type SeasonTile,
	type SgNotable,
	type SgRef,
	type SgSeason,
} from "@/lib/game/season-guess";
import { cn } from "@/lib/utils";
import { Flag, href, num, Page } from "../f1";
import { ULink } from "../universe-link";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Kbd } from "../ui/kbd";
import { ScrollArea } from "../ui/scroll-area";
import { ChoiceToggle, ClueTile, Figures, GameError, GameHeader, GameLoading, jsonLoader, Legend, ResultCard, shareResult, StatsDialog, useGameData, useToday, verdictIcon } from "./kit";

const loadData = jsonLoader("/data/season-guess.json", (f: SeasonFile) => unpackSeasons(f));

const store = gameStore("season");
const readStats = (pool: SeasonPool) => store.readStats(`stats:${pool}`, MAX_GUESSES);
const pts = (n: number) => `${num(n)} ${n === 1 ? "point" : "points"}`;
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
/** "Ayrton Senna" → "Senna" for tight tiles. */
const surname = (name: string) => name.split(" ").at(-1) ?? name;

export function SeasonGuessGame() {
	const { data, error, retry } = useGameData(loadData);
	const { today, rollover } = useToday();
	const [pool, setPoolState] = useState<SeasonPool>("modern");
	const [mode, setMode] = useState<GameMode>("daily");
	const [daily, setDaily] = useState<string[]>([]);
	const [stats, setStats] = useState<GameStats>(emptyStats);
	const [practice, setPractice] = useState<{ target: string; guesses: string[] } | null>(null);
	const [statsOpen, setStatsOpen] = useState(false);

	useEffect(() => setPoolState(store.read<SeasonPool>("pool", "modern") === "all" ? "all" : "modern"), []);

	// the day's saved progress and stats for this pool
	useEffect(() => {
		if (today == null) return;
		setDaily(store.readDaily<{ guesses: string[] }>(`daily:${pool}`, today)?.guesses ?? []);
		setStats(readStats(pool));
	}, [today, pool]);

	const setPool = (p: SeasonPool) => {
		setPoolState(p);
		store.write("pool", p);
		setPractice(null);
	};

	const target = useMemo(() => {
		if (!data || today == null) return null;
		if (mode === "daily") return dailySeason(data.seasons, pool, today);
		return practice ? (data.byId.get(practice.target) ?? null) : null;
	}, [data, today, mode, pool, practice]);

	// a practice season whenever practice starts without one
	useEffect(() => {
		if (data && mode === "practice" && !practice) setPractice({ target: randomSeason(data.seasons, pool).id, guesses: [] });
	}, [data, mode, practice, pool]);

	const choices = useMemo(() => (data ? poolSeasons(data.seasons, pool) : []), [data, pool]);
	const guesses = mode === "daily" ? daily : (practice?.guesses ?? []);
	const rows = useMemo(
		() => (data && target ? guesses.map((id) => data.byId.get(id)).filter((s) => !!s).map((s) => compareSeasons(s, target)) : []),
		[data, target, guesses],
	);
	const won = rows.some((r) => r.correct);
	const over = won || rows.length >= MAX_GUESSES;

	const guess = (s: SgSeason) => {
		if (over || !target || today == null || guesses.includes(s.id)) return;
		const next = [...guesses, s.id];
		if (mode === "practice") {
			setPractice((p) => p && { ...p, guesses: next });
			return;
		}
		setDaily(next);
		store.writeDaily(`daily:${pool}`, today, { guesses: next });
		if (s.id === target.id || next.length >= MAX_GUESSES) {
			const st = recordResult(readStats(pool), today, s.id === target.id, next.length);
			store.write(`stats:${pool}`, st);
			setStats(st);
		}
	};

	const share = () => {
		if (today == null) return;
		const suffix = pool === "all" ? " (All time)" : "";
		const label = mode === "daily" ? `#${puzzleNumber(today)}${suffix}` : `practice${suffix}`;
		shareResult(seasonShareText({ rows, won, label, url: `${location.origin}/play/season` }));
	};

	const newPractice = (exclude: string) => setPractice({ target: randomSeason(data!.seasons, pool, Math.random, exclude).id, guesses: [] });
	const level = SEASON_POOLS.find((p) => p.id === pool)!;
	const ready = data && target && today != null;
	return (
		<Page className="max-w-5xl space-y-8">
			<GameHeader
				title="Guess the season"
				today={today}
				mode={mode}
				onModeChange={setMode}
				controls={<ChoiceToggle value={pool} options={SEASON_POOLS} onChange={setPool} />}
				onStats={() => setStatsOpen(true)}
			>
				A new mystery championship season every day at midnight UTC, the same for everyone. You start with one clue; every wrong guess reveals another, and
				each guess shows how close it was on year, champion, rounds and constructors&apos; champion. {MAX_GUESSES} guesses. {level.description}.
			</GameHeader>

			{error ? (
				<GameError what="the seasons" onRetry={retry} />
			) : !ready ? (
				<GameLoading />
			) : (
				<div className="space-y-6">
					{over ? (
						<ResultCard
							won={won}
							status={won ? (rows.length === 1 ? "From the calendar alone! Got it in 1." : `Got it in ${rows.length} of ${MAX_GUESSES}.`) : "Out of guesses. The mystery season was"}
							mode={mode}
							nextLabel={mode === "practice" ? "Next practice season" : "Practice with a random season"}
							countdownLabel="Next season in"
							onShare={share}
							onStats={() => setStatsOpen(true)}
							onNext={() => {
								setMode("practice");
								newPractice(target.id);
							}}
							onRollover={rollover}
						>
							<Reveal season={target} />
						</ResultCard>
					) : (
						<>
							<Clues season={target} revealed={rows.length + 1} />
							<div className="space-y-2">
								<SeasonPicker seasons={choices} exclude={guesses} onPick={guess} />
								<div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
									<span className="flex items-center gap-1.5">
										Guess {rows.length + 1} of {MAX_GUESSES}
										<span className="hidden items-center gap-1.5 sm:inline-flex">
											· try &ldquo;1988&rdquo;, &ldquo;88&rdquo; or &ldquo;199&rdquo; · <Kbd>Enter</Kbd> to guess
										</span>
									</span>
									{mode === "practice" && (
										<Button variant="ghost" size="xs" onClick={() => newPractice(target.id)}>
											<Dices data-icon="inline-start" />
											New season
										</Button>
									)}
								</div>
							</div>
						</>
					)}
					<Board rows={rows} />
					<Legend
						close="Close: within 2 years or 2 rounds, or a champion from the same team"
						direction="The mystery season is later or has more rounds (double arrow: 10 or more years)"
					/>
				</div>
			)}

			<StatsDialog
				open={statsOpen}
				onOpenChange={setStatsOpen}
				stats={stats}
				today={today}
				description={`Daily puzzles, ${level.label.toLowerCase()} seasons. Saved in this browser.`}
				highlight={mode === "daily" && won ? rows.length - 1 : null}
			/>
		</Page>
	);
}

/* --------------------------------------------------------------- picker --- */

/**
 * A year box over the seasons with a keyboard-navigable list (↑/↓, Enter, Escape). Focusing it
 * lists every season, newest first; typing narrows it ("1988", "88", "199"). Options show the
 * year only: anything more (rounds, champion) would answer the clues.
 */
function SeasonPicker({ seasons, exclude, onPick }: { seasons: SgSeason[]; exclude: string[]; onPick: (s: SgSeason) => void }) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const input = useRef<HTMLInputElement>(null);
	const list = useRef<HTMLUListElement>(null);
	const id = useId();
	const hits = useMemo(() => searchSeasons(seasons, query, new Set(exclude)), [seasons, query, exclude]);
	const show = open && hits.length + query.length > 0;

	useEffect(() => input.current?.focus(), []);
	// keep the active option in view
	useEffect(() => {
		if (show) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
	}, [active, show]);

	const pick = (s: SgSeason | undefined) => {
		if (!s) return;
		onPick(s);
		setQuery("");
		setActive(0);
		setOpen(false);
		input.current?.focus();
	};
	const first = seasons[0]?.year;
	const last = seasons.at(-1)?.year;

	return (
		<div className="relative">
			<CalendarSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
			<Input
				ref={input}
				role="combobox"
				inputMode="numeric"
				aria-expanded={show}
				aria-controls={`${id}-list`}
				aria-autocomplete="list"
				aria-activedescendant={show && hits[active] ? `${id}-${hits[active].id}` : undefined}
				aria-label="Guess a season"
				placeholder={`Type a year, ${first}–${last}…`}
				autoComplete="off"
				spellCheck={false}
				maxLength={5}
				className="h-11 pl-9 text-base tabular-nums md:text-base"
				value={query}
				onChange={(e) => {
					setQuery(e.target.value.replace(/[^\d']/g, ""));
					setActive(0);
					setOpen(true);
				}}
				onClick={() => setOpen(true)}
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
				<div className="bg-popover text-popover-foreground ring-foreground/10 animate-in fade-in-0 zoom-in-95 absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-2xl shadow-lg ring-1">
					<ScrollArea className="max-h-72" viewportClassName="max-h-72">
						<ul ref={list} id={`${id}-list`} role="listbox" aria-label="Seasons" className="p-1">
							{hits.length ? (
								hits.map((s, i) => (
									<li
										key={s.id}
										id={`${id}-${s.id}`}
										data-index={i}
										role="option"
										aria-selected={i === active}
										onMouseDown={(e) => e.preventDefault()}
										onMouseMove={() => setActive(i)}
										onClick={() => pick(s)}
										className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm pointer-coarse:min-h-11", i === active && "bg-muted")}
									>
										<CalendarDays className="text-muted-foreground size-4 shrink-0" />
										<span className="flex-1 font-medium tabular-nums">{s.year}</span>
									</li>
								))
							) : (
								<li className="text-muted-foreground px-3 py-2 text-sm">No season matches &ldquo;{query.trim()}&rdquo;</li>
							)}
						</ul>
					</ScrollArea>
				</div>
			)}
			{show && hits.length > 0 && query && (
				<p className="sr-only" aria-live="polite">
					{hits.length} seasons found. Use the arrow keys and Enter to guess.
				</p>
			)}
		</div>
	);
}

/* ---------------------------------------------------------------- clues --- */

const CLUE_LABEL: Record<SeasonClue["kind"], { label: string; icon: LucideIcon }> = {
	calendar: { label: "The calendar", icon: CalendarDays },
	flags: { label: "Champion's flags", icon: FlagIcon },
	numbers: { label: "Champion's season", icon: Sigma },
	changes: { label: "Comings and goings", icon: Repeat },
	rivals: { label: "The rivals", icon: Swords },
	champion: { label: "The champion", icon: Crown },
};

/** "a 7-time champion", "won 41 races", "a podium finisher": what a debutant or retiree went on to (or did) achieve. */
const record = (n: SgNotable) =>
	n.titles ? `${n.titles === 1 ? "a" : `a ${n.titles}-time`} world champion` : n.wins ? `${plural(n.wins, "Grand Prix win")} in all` : "a podium regular";

function Line({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
			<span className="text-muted-foreground shrink-0 text-xs">{label}</span>
			<span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">{children}</span>
		</div>
	);
}

function Named({ who, extra }: { who: SgRef; extra?: React.ReactNode }) {
	return (
		<>
			<span className="inline-flex min-w-0 items-center gap-1.5">
				<Flag code={who.flag} />
				<span className="font-medium">{who.name}</span>
			</span>
			{extra && <span className="text-muted-foreground text-xs sm:text-sm">{extra}</span>}
		</>
	);
}

function ClueBody({ clue: c }: { clue: SeasonClue }) {
	switch (c.kind) {
		case "calendar":
			return (
				<div className="space-y-1">
					<div className="font-medium">
						{plural(c.rounds, "round")}
						{c.sprints > 0 && ` · ${plural(c.sprints, "sprint")}`} · {plural(c.winners, "different winner")}
					</div>
					<div className="text-muted-foreground text-xs sm:text-sm">
						{c.ledRounds === c.rounds
							? "The champion led the standings from the first round to the last."
							: c.leadFrom >= c.rounds
								? `The champion only took the lead for good after the final round, having led after ${plural(c.ledRounds, "round")}.`
								: `The champion led the standings after ${c.ledRounds} of ${c.rounds} rounds, and for good from round ${c.leadFrom}.`}
					</div>
				</div>
			);
		case "flags":
			return (
				<div className="flex flex-wrap gap-x-6 gap-y-2">
					<span className="inline-flex items-center gap-2">
						<Flag code={c.driver.flag} className="text-lg" />
						<span>
							<span className="text-muted-foreground block text-xs">Champion from</span>
							<span className="font-medium">{c.driver.countryName}</span>
						</span>
					</span>
					<span className="inline-flex items-center gap-2">
						<Flag code={c.team.flag} className="text-lg" />
						<span>
							<span className="text-muted-foreground block text-xs">Driving for a team from</span>
							<span className="font-medium">{c.team.countryName}</span>
						</span>
					</span>
				</div>
			);
		case "numbers":
			return (
				<dl className="flex flex-wrap gap-x-6 gap-y-2">
					{(
						[
							["Points", num(c.points)],
							["Wins", `${c.wins} of ${c.rounds}`],
							["Podiums", c.podiums],
							["Poles", c.poles],
							["Title margin", pts(c.margin)],
						] as const
					).map(([label, v]) => (
						<div key={label}>
							<dt className="text-muted-foreground text-xs">{label}</dt>
							<dd className="text-base font-semibold tabular-nums sm:text-lg">{v}</dd>
						</div>
					))}
				</dl>
			);
		case "changes": {
			const shown = c.circuits.slice(0, 4);
			// a calendar of nothing but new circuits can only be the first season: leave it out
			const giveaway = c.circuits.length >= 6;
			return (
				<div className="space-y-1.5">
					{!giveaway && <Line label={c.circuits.length === 1 ? "New circuit" : "New circuits"}>
						{shown.length ? (
							<>
								{shown.map((ci) => (
									<span key={ci.id} className="inline-flex items-center gap-1.5">
										<Flag code={ci.flag} />
										<span className="font-medium">{ci.name}</span>
									</span>
								))}
								{c.circuits.length > shown.length && <span className="text-muted-foreground text-xs">and {c.circuits.length - shown.length} more</span>}
							</>
						) : (
							<span className="text-muted-foreground">None: every circuit had raced before</span>
						)}
					</Line>}
					<Line label="Debut">
						{c.debut ? <Named who={c.debut.driver} extra={`later ${record(c.debut)}`} /> : <span className="text-muted-foreground">No future race winner made a debut</span>}
					</Line>
					<Line label="Final season">
						{c.farewell ? <Named who={c.farewell.driver} extra={record(c.farewell)} /> : <span className="text-muted-foreground">No race winner bowed out</span>}
					</Line>
				</div>
			);
		}
		case "rivals":
			return (
				<div className="space-y-1.5">
					<Line label="Constructors' champion">
						{c.constructors ? (
							<Named who={c.constructors} />
						) : (
							<>
								<span className="text-muted-foreground">None yet (from 1958). The champion drove for</span>
								<Named who={c.championTeam} />
							</>
						)}
					</Line>
					<Line label="Runner-up">
						<Named who={c.runnerUp.driver} extra={`${c.runnerUp.team.name}, ${pts(c.runnerUp.points)}`} />
					</Line>
				</div>
			);
		case "champion":
			return (
				<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
					<Named who={c.driver} extra={`${c.team.name} · ${c.title === 1 ? "his first title" : `his ${ordinal(c.title)} title`}`} />
				</div>
			);
	}
}

function Clues({ season, revealed }: { season: SgSeason; revealed: number }) {
	const clues = useMemo(() => seasonClues(season), [season]);
	return (
		<Card>
			<CardContent>
				<ol className="divide-border/70 divide-y" aria-label="Clues">
					{clues.map((c, i) => {
						const { label, icon: Icon } = CLUE_LABEL[c.kind];
						const open = i < revealed;
						return (
							<li
								key={c.kind}
								className={cn(
									"grid grid-cols-1 gap-1.5 py-3 text-sm first:pt-0 last:pb-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3 sm:text-base",
									open && i === revealed - 1 && i > 0 && "animate-in fade-in-0 slide-in-from-top-1 duration-500",
								)}
							>
								<span className={cn("flex items-center gap-1.5 text-xs font-medium sm:pt-1", open ? "text-foreground" : "text-muted-foreground")}>
									<Icon className="size-3.5 shrink-0" /> {label}
								</span>
								{open ? (
									<div className="min-w-0">
										<ClueBody clue={c} />
									</div>
								) : (
									<span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs sm:pt-1">
										<Lock className="size-3" /> After guess {i}
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

/* ---------------------------------------------------------------- board --- */

const GRID = "grid grid-cols-4 gap-1 sm:grid-cols-[minmax(7rem,1.2fr)_repeat(4,minmax(0,1fr))] sm:gap-1.5";

/** Every guess so far (newest first), each compared tile by tile with the answer. */
function Board({ rows }: { rows: SeasonComparison[] }) {
	if (!rows.length) return null;
	return (
		<div className="space-y-2" role="table" aria-label="Your guesses">
			<div className={cn(GRID, "text-muted-foreground text-[11px] font-medium sm:text-xs")} role="row">
				<div className="hidden sm:block" role="columnheader">
					Season
				</div>
				{SEASON_TILES.map((a) => (
					<div key={a.key} className="truncate text-center" role="columnheader">
						<span className="sm:hidden">{a.short}</span>
						<span className="hidden sm:inline">{a.label}</span>
					</div>
				))}
			</div>
			{[...rows].reverse().map((r, i) => (
				<div key={r.guess.id} className={GRID} role="row">
					<div className="col-span-4 flex min-w-0 items-center gap-2 px-0.5 text-sm sm:col-span-1" role="rowheader">
						<span className="text-muted-foreground w-4 shrink-0 text-xs tabular-nums">{rows.length - i}</span>
						<ULink href={href.season(r.guess.year)} data-card={`season:${r.guess.year}`} className="truncate font-medium tabular-nums underline-offset-4 hover:underline">
							{r.guess.year} season
						</ULink>
					</div>
					{r.tiles.map((t, j) => (
						<TileView key={t.key} tile={t} season={r.guess} delay={j * 90} />
					))}
				</div>
			))}
		</div>
	);
}

function tileIcon(t: SeasonTile): LucideIcon {
	if (t.direction && t.verdict !== "match") return t.far ? (t.direction === "higher" ? ChevronsUp : ChevronsDown) : t.direction === "higher" ? ArrowUp : ArrowDown;
	return verdictIcon(t.verdict, null, t.key === "champion" ? Users : Factory);
}

function TileView({ tile, season: s, delay }: { tile: SeasonTile; season: SgSeason; delay: number }) {
	const attr = SEASON_TILES.find((a) => a.key === tile.key)!;
	const small = "max-w-full truncate px-0.5 text-[11px] font-semibold leading-tight sm:text-xs";
	let value: React.ReactNode;
	let text: string;
	let hint: string;
	if (tile.key === "year") {
		value = <span className="text-sm font-semibold tabular-nums sm:text-base">{s.year}</span>;
		text = String(s.year);
		hint =
			tile.verdict === "match"
				? `${s.year}: a match`
				: `${s.year}: the mystery season is ${tile.direction === "higher" ? "later" : "earlier"}${tile.far ? ", by 10 years or more" : tile.verdict === "close" ? " (within 2 years)" : ""}`;
	} else if (tile.key === "rounds") {
		value = <span className="text-sm font-semibold tabular-nums sm:text-base">{s.rounds}</span>;
		text = String(s.rounds);
		hint =
			tile.verdict === "match"
				? `${plural(s.rounds, "round")}: a match`
				: `${plural(s.rounds, "round")}: the mystery season had ${tile.direction === "higher" ? "more" : "fewer"}${tile.verdict === "close" ? " (within 2)" : ""}`;
	} else if (tile.key === "champion") {
		const c = s.champion;
		value = (
			<>
				<Flag code={c.driver.flag} className="text-sm sm:text-base" />
				<span className={small}>{surname(c.driver.name)}</span>
			</>
		);
		text = `${c.driver.name} (${c.team.name})`;
		hint =
			tile.verdict === "match"
				? `Same champion: ${c.driver.name}`
				: tile.verdict === "close"
					? `${text}: the mystery season's champion drove for ${c.team.name} too`
					: `${text}: another champion and team`;
	} else {
		const t = s.constructors;
		value = t ? <span className={small}>{t.name}</span> : <span className="text-xs font-semibold opacity-80">None</span>;
		text = t ? t.name : "no constructors' championship";
		hint = tile.verdict === "match" ? (t ? `Same constructors' champion: ${t.name}` : "Neither season had a constructors' championship") : `${t ? t.name : "No constructors' championship"}: not a match`;
	}
	return (
		<ClueTile
			verdict={tile.verdict}
			icon={tileIcon(tile)}
			hint={hint}
			srText={`${attr.label} ${text}: ${tile.verdict}${tile.direction ? `, mystery season's is ${tile.direction}` : ""}`}
			delay={delay}
		>
			{value}
		</ClueTile>
	);
}

/* --------------------------------------------------------------- reveal --- */

function Person({ who, kind }: { who: SgRef; kind: "driver" | "team" }) {
	return (
		<span className="inline-flex min-w-0 items-center gap-1.5">
			<Flag code={who.flag} />
			<ULink
				href={kind === "driver" ? href.driver(who.id) : href.team(who.id)}
				data-card={`${kind}:${who.id}`}
				className="truncate font-medium underline-offset-4 hover:underline"
			>
				{who.name}
			</ULink>
		</span>
	);
}

function Reveal({ season: s }: { season: SgSeason }) {
	const c = s.champion;
	return (
		<>
			<div className="flex items-center gap-3">
				<CalendarDays className="text-muted-foreground size-8 shrink-0" />
				<div className="min-w-0">
					<ULink
						href={href.season(s.year)}
						data-card={`season:${s.year}`}
						className="block text-xl font-semibold tracking-tight underline-offset-4 hover:underline sm:text-2xl"
					>
						{s.year} season
					</ULink>
					<div className="text-muted-foreground text-sm">
						{plural(s.rounds, "round")}
						{s.sprints > 0 && ` · ${plural(s.sprints, "sprint")}`} · {plural(s.winners, "different winner")}
					</div>
				</div>
			</div>
			<dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
				<dt className="text-muted-foreground text-xs sm:pt-0.5">Champion</dt>
				<dd className="flex min-w-0 flex-wrap items-center gap-x-2">
					<Person who={c.driver} kind="driver" />
					<span className="text-muted-foreground text-xs">{c.team.name} · {c.title === 1 ? "first title" : `${ordinal(c.title)} title`}</span>
				</dd>
				<dt className="text-muted-foreground text-xs sm:pt-0.5">Runner-up</dt>
				<dd className="flex min-w-0 flex-wrap items-center gap-x-2">
					<Person who={s.runnerUp.driver} kind="driver" />
					<span className="text-muted-foreground text-xs">{pts(round2(c.points - s.runnerUp.points))} behind</span>
				</dd>
				<dt className="text-muted-foreground text-xs sm:pt-0.5">Constructors&apos; champion</dt>
				<dd className="min-w-0">{s.constructors ? <Person who={s.constructors} kind="team" /> : <span className="text-muted-foreground">None until 1958</span>}</dd>
			</dl>
			<ol className="space-y-1 text-sm" aria-label="Top of the drivers' standings">
				{s.top.map((t, i) => (
					<li key={t.driver.id} className="flex min-w-0 items-center gap-2.5">
						<span className="text-muted-foreground w-5 shrink-0 text-xs tabular-nums">P{i + 1}</span>
						<Flag code={t.driver.flag} />
						<span className="min-w-0 flex-1 truncate">
							<span className="font-medium">{t.driver.name}</span> <span className="text-muted-foreground text-xs">{t.team.name}</span>
						</span>
						<span className="shrink-0 text-xs tabular-nums">
							{num(t.points)} <span className="text-muted-foreground">pts</span>
						</span>
					</li>
				))}
			</ol>
			<Figures
				items={[
					["Champion's wins", c.wins],
					["Poles", c.poles],
					["Podiums", c.podiums],
					["Points", c.points],
				]}
			/>
		</>
	);
}

