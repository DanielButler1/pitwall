"use client";

// Daily "Lap chart mystery" (/play/lap-chart): a race's lap-by-lap position chart with the
// drivers' names hidden. The player may open hints (round, continent, decade, winner's team,
// winner's name, every driver) at any time, in any order; each uses up one of the six guesses.
// The board's tiles are deliberately coarse (year earlier/later, Grand Prix and winner match or
// miss). The pool is public/data/lap-chart.json, the chart the race's /data/laps/<raceId>.json
// (fetched on demand), guesses the shared race catalogue (./race-picker, lib/game/race-guess).
// Drawn like the race page's lap chart (components/pages/race-laps).

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartLine, Dices, Lightbulb, Lock } from "lucide-react";
import { gameStore, type GameMode, type GameStats } from "@/lib/game/daily";
import {
	canTakeHint,
	compareLapGuess,
	dailyLapRace,
	decadeOf,
	driverLetter,
	LAP_CHART_FROM,
	LAP_HINTS,
	LAP_TILES,
	lapOver,
	lapReveal,
	lapShareText,
	randomLapRace,
	roundsPerYear,
	slotsUsed,
	unpackLapChart,
	type LapChartFile,
	type LapHintKey,
	type LapRace,
	type LapReveal,
} from "@/lib/game/lap-chart";
import { CONTINENT_NAME, continentOf, emptyStats, MAX_GUESSES, puzzleNumber, recordResult, type RaceCatalog, type RgRace } from "@/lib/game/race-guess";
import type { RaceLapFile } from "@/lib/f1/laps";
import { cn } from "@/lib/utils";
import { Flag, href, Page } from "../f1";
import { ULink } from "../universe-link";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Kbd } from "../ui/kbd";
import { Skeleton } from "../ui/skeleton";
import { GameError, GameHeader, GameLoading, ResultCard, shareResult, StatsDialog, useGameData, useToday } from "./kit";
import { CoarseLegend, loadRaceCatalog, RaceBoard, RacePicker, RaceTitle } from "./race-picker";

/* ----------------------------------------------------------------- data --- */

type Data = RaceCatalog & { pool: LapRace[]; lapById: Map<number, LapRace>; pickable: RgRace[]; rounds: Map<number, number> };

const loadData = (() => {
	let promise: Promise<Data> | undefined;
	return () =>
		(promise ??= Promise.all([
			loadRaceCatalog(),
			fetch("/data/lap-chart.json").then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json() as Promise<LapChartFile>;
			}),
		])
			.then(([catalog, file]) => {
				const { races, byId } = unpackLapChart(file);
				const pool = races.filter((r) => catalog.byId.has(r.id));
				return { ...catalog, pool, lapById: byId, pickable: catalog.races.filter((r) => r.year >= LAP_CHART_FROM), rounds: roundsPerYear(catalog.races) };
			})
			.catch((e) => {
				promise = undefined;
				throw e;
			}));
})();

const lapFiles = new Map<number, Promise<RaceLapFile>>();
function fetchLaps(raceId: number) {
	let p = lapFiles.get(raceId);
	if (!p) {
		p = fetch(`/data/laps/${raceId}.json`).then((r) => {
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			return r.json() as Promise<RaceLapFile>;
		});
		p.catch(() => lapFiles.delete(raceId));
		lapFiles.set(raceId, p);
	}
	return p;
}

/** The target race's lap file, or an error flag (with retry). */
function useLapFile(raceId: number | null) {
	const [state, setState] = useState<{ id: number; file: RaceLapFile | null; error: boolean } | null>(null);
	const [attempt, setAttempt] = useState(0);
	useEffect(() => {
		if (raceId == null) return;
		let live = true;
		fetchLaps(raceId)
			.then((file) => live && setState({ id: raceId, file, error: false }))
			.catch(() => live && setState({ id: raceId, file: null, error: true }));
		return () => {
			live = false;
		};
	}, [raceId, attempt]);
	const current = state && state.id === raceId ? state : null;
	return { file: current?.file ?? null, error: current?.error ?? false, retry: () => setAttempt((a) => a + 1) };
}

const store = gameStore("lap-chart");
const readStats = () => store.readStats("stats", MAX_GUESSES);

type Progress = { guesses: number[]; hints: LapHintKey[] };
const FRESH: Progress = { guesses: [], hints: [] };
const isHint = (k: unknown): k is LapHintKey => LAP_HINTS.some((h) => h.key === k);

/* ----------------------------------------------------------------- game --- */

export function LapChartGame() {
	const { data, error, retry } = useGameData(loadData);
	const { today, rollover } = useToday();
	const [mode, setMode] = useState<GameMode>("daily");
	const [daily, setDaily] = useState<Progress>(FRESH);
	const [stats, setStats] = useState<GameStats>(emptyStats);
	const [practice, setPractice] = useState<(Progress & { target: number }) | null>(null);
	const [statsOpen, setStatsOpen] = useState(false);

	useEffect(() => {
		if (today == null) return;
		const saved = store.readDaily<Partial<Progress>>("daily", today);
		setDaily({ guesses: saved?.guesses ?? [], hints: (saved?.hints ?? []).filter(isHint) });
		setStats(readStats());
	}, [today]);

	const lapTarget = useMemo(() => {
		if (!data || today == null) return null;
		if (mode === "daily") return dailyLapRace(data.pool, today);
		return practice ? (data.lapById.get(practice.target) ?? null) : null;
	}, [data, today, mode, practice]);
	const target = lapTarget && data ? (data.byId.get(lapTarget.id) ?? null) : null;

	useEffect(() => {
		if (data && mode === "practice" && !practice) setPractice({ target: randomLapRace(data.pool).id, ...FRESH });
	}, [data, mode, practice]);

	const laps = useLapFile(lapTarget?.id ?? null);
	const progress = mode === "daily" ? daily : (practice ?? FRESH);
	const { guesses, hints } = progress;
	const rows = useMemo(
		() => (data && target ? guesses.map((id) => data.byId.get(id)).filter((r) => !!r).map((r) => compareLapGuess(r, target)) : []),
		[data, target, guesses],
	);
	const won = rows.some((r) => r.correct);
	const over = lapOver(rows.length, hints.length, won);
	const used = slotsUsed(rows.length, hints.length);
	const reveal = lapReveal(hints, over);

	const update = (next: Progress) => {
		if (mode === "practice") setPractice((p) => p && { ...p, ...next });
		else if (today != null) {
			setDaily(next);
			store.writeDaily("daily", today, next);
		}
	};

	const guess = (r: RgRace) => {
		if (over || !target || today == null) return;
		const next = { guesses: [...guesses, r.id], hints };
		update(next);
		const nowWon = r.id === target.id;
		if (mode === "daily" && lapOver(next.guesses.length, hints.length, nowWon)) {
			const s = recordResult(readStats(), today, nowWon, slotsUsed(next.guesses.length, hints.length));
			store.write("stats", s);
			setStats(s);
		}
	};

	const takeHint = (key: LapHintKey) => {
		if (over || hints.includes(key) || !canTakeHint(rows.length, hints.length)) return;
		update({ guesses, hints: [...hints, key] });
	};

	const share = () => {
		if (today == null) return;
		const label = mode === "daily" ? `#${puzzleNumber(today)}` : "practice";
		shareResult(lapShareText({ rows, hints, won, label, url: `${location.origin}/play/lap-chart` }));
	};

	const newPractice = (exclude: number) => setPractice({ target: randomLapRace(data!.pool, Math.random, exclude).id, ...FRESH });
	const ready = data && target && lapTarget && today != null;
	const hintNote = hints.length ? ` (${hints.length} ${hints.length === 1 ? "hint" : "hints"})` : " without a hint";
	return (
		<Page className="max-w-5xl space-y-8">
			<GameHeader title="Lap chart mystery" today={today} mode={mode} onModeChange={setMode} onStats={() => setStatsOpen(true)}>
				Every day at midnight UTC, a new race&apos;s lap-by-lap position chart with the drivers&apos; names hidden. Name the race in {MAX_GUESSES} tries. Stuck? Open
				a hint whenever you like (the round, continent, decade, winner&apos;s team, winner or every driver), but each one uses up a try. Races from {LAP_CHART_FROM}{" "}
				on.
			</GameHeader>

			{error ? (
				<GameError what="the races" onRetry={retry} />
			) : !ready ? (
				<GameLoading />
			) : (
				<div className="space-y-6">
					{over && (
						<ResultCard
							won={won}
							status={
								won
									? used === 1
										? "Straight from the chart! Got it in 1."
										: `Got it in ${used} of ${MAX_GUESSES}${hintNote}.`
									: "Out of tries. The mystery race was"
							}
							mode={mode}
							nextLabel={mode === "practice" ? "Next practice chart" : "Practice with a random chart"}
							countdownLabel="Next chart in"
							onShare={share}
							onStats={() => setStatsOpen(true)}
							onNext={() => {
								setMode("practice");
								newPractice(target.id);
							}}
							onRollover={rollover}
						>
							<RaceTitle race={target} />
							<ULink href={href.race(target)} className="text-primary inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
								<ChartLine className="size-4" />
								See the lap chart on the race page
							</ULink>
						</ResultCard>
					)}
					<Card>
						<CardContent className="space-y-5 px-3 sm:px-6">
							{!over && (
								<HintPanel
									key={`${mode}:${lapTarget.id}`}
									race={target}
									lapRace={lapTarget}
									rounds={data.rounds.get(target.year) ?? target.round}
									taken={hints}
									left={MAX_GUESSES - used}
									canTake={canTakeHint(rows.length, hints.length)}
									onTake={takeHint}
								/>
							)}
							{laps.error ? (
								<GameError what="the lap chart" onRetry={laps.retry} />
							) : !laps.file?.positions || !laps.file.drivers ? (
								<Skeleton className="h-72 w-full rounded-xl sm:h-[26rem]" />
							) : (
								<MysteryChart key={lapTarget.id} file={laps.file} race={lapTarget} reveal={reveal} over={over} />
							)}
						</CardContent>
					</Card>
					{!over && (
						<div className="space-y-2">
							<RacePicker races={data.pickable} exclude={guesses} onPick={guess} placeholder={`Type a year (${LAP_CHART_FROM}+), Grand Prix or circuit…`} />
							<div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
								<span className="flex flex-wrap items-center gap-1.5">
									{MAX_GUESSES - used} {MAX_GUESSES - used === 1 ? "try" : "tries"} left
									{hints.length > 0 && ` · ${hints.length} used on ${hints.length === 1 ? "a hint" : "hints"}`}
									<span className="hidden items-center gap-1.5 sm:inline-flex">
										· <Kbd>↑</Kbd>
										<Kbd>↓</Kbd> to choose, <Kbd>Enter</Kbd> to guess
									</span>
								</span>
								{mode === "practice" && (
									<Button variant="ghost" size="xs" onClick={() => newPractice(target.id)}>
										<Dices data-icon="inline-start" />
										New chart
									</Button>
								)}
							</div>
						</div>
					)}
					<RaceBoard rows={rows} columns={LAP_TILES} />
					<CoarseLegend />
				</div>
			)}

			<StatsDialog
				open={statsOpen}
				onOpenChange={setStatsOpen}
				stats={stats}
				today={today}
				description="Daily puzzles. Tries count guesses and hints. Saved in this browser."
				distributionTitle="Try distribution"
				distributionLabel="Wins by tries used (guesses plus hints)"
				highlight={mode === "daily" && won ? used - 1 : null}
			/>
		</Page>
	);
}

/* ---------------------------------------------------------------- hints --- */

function HintPanel({
	race,
	lapRace,
	rounds,
	taken,
	left,
	canTake,
	onTake,
}: {
	race: RgRace;
	lapRace: LapRace;
	rounds: number;
	taken: LapHintKey[];
	left: number;
	canTake: boolean;
	onTake: (key: LapHintKey) => void;
}) {
	// a hint costs a try, so the first tap only arms it; a second tap (within a few seconds) opens it
	const [armed, setArmed] = useState<LapHintKey | null>(null);
	useEffect(() => {
		if (!armed) return;
		const t = setTimeout(() => setArmed(null), 4000);
		return () => clearTimeout(t);
	}, [armed]);

	const value = (key: LapHintKey): React.ReactNode => {
		const winner = lapRace.entries[0];
		switch (key) {
			case "round":
				return `${race.round} of ${rounds}`;
			case "continent":
				return CONTINENT_NAME[continentOf(race.circuit.country) ?? ""] ?? "Unknown";
			case "decade":
				return `The ${decadeOf(race.year)}`;
			case "team":
				return winner?.team.name ?? "Unknown";
			case "winner":
				return winner ? (
					<span className="inline-flex min-w-0 items-center gap-1.5">
						<Flag code={winner.driver.flag} />
						<span className="truncate">{winner.driver.name}</span>
					</span>
				) : (
					"Unknown"
				);
			case "drivers":
				return "Named on the chart";
		}
	};

	return (
		<section className="space-y-2.5" aria-label="Hints">
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
				<h2 className="flex items-center gap-1.5 text-sm font-medium">
					<Lightbulb className="text-gold size-4" /> Hints
				</h2>
				<p className="text-muted-foreground text-xs">
					Each hint uses 1 of your {MAX_GUESSES} tries · {left} left
				</p>
			</div>
			<ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
				{LAP_HINTS.map((h) => {
					const open = taken.includes(h.key);
					if (open)
						return (
							<li
								key={h.key}
								className="bg-secondary text-secondary-foreground border-border animate-in fade-in-0 zoom-in-95 flex min-h-16 min-w-0 flex-col justify-center gap-0.5 rounded-xl border px-3 py-2 duration-300"
							>
								<span className="text-muted-foreground text-[11px] sm:text-xs">{h.label}</span>
								<span className="min-w-0 truncate text-sm font-semibold sm:text-base">{value(h.key)}</span>
							</li>
						);
					const isArmed = armed === h.key;
					return (
						<li key={h.key} className="min-w-0">
							<button
								type="button"
								disabled={!canTake}
								onClick={() => {
									if (isArmed) {
										setArmed(null);
										onTake(h.key);
									} else setArmed(h.key);
								}}
								onBlur={() => isArmed && setArmed(null)}
								aria-label={isArmed ? `Reveal ${h.label}: uses 1 try. Press again to confirm.` : `${h.label} hint, locked. Uses 1 try.`}
								className={cn(
									"flex h-full min-h-16 w-full min-w-0 flex-col justify-center gap-0.5 rounded-xl border border-dashed px-3 py-2 text-left transition-colors",
									"hover:bg-muted focus-visible:ring-ring/50 outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
									isArmed && "border-primary bg-primary/5 border-solid",
								)}
							>
								<span className="flex min-w-0 items-start gap-1.5">
									<Lock className="text-muted-foreground mt-0.5 size-3 shrink-0 sm:mt-1" />
									<span className="min-w-0 text-xs leading-tight font-medium sm:text-sm">{h.label}</span>
									<span className="bg-muted text-muted-foreground ml-auto shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium tabular-nums sm:text-[11px]">
										−1 try
									</span>
								</span>
								<span className={cn("line-clamp-2 min-w-0 text-[11px] leading-snug text-pretty sm:text-xs", isArmed ? "text-primary font-medium" : "text-muted-foreground")}>
									{isArmed ? "Tap again to reveal" : canTake ? h.about : "Keep your last try"}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

/* ---------------------------------------------------------------- chart --- */

/** Winner first, then up to two picked drivers (fixed order, never cycled); everyone else is muted ink. */
const WINNER = "var(--f1)";
const PICKED = ["var(--chart-3)", "var(--gold)"];

type Row = { lap: number } & Record<string, number | null>;

function MysteryChart({ file, race, reveal, over }: { file: RaceLapFile; race: LapRace; reveal: LapReveal; over: boolean }) {
	const drivers = file.drivers!;
	const positions = file.positions!;
	const [picked, setPicked] = useState<number[]>([]);
	const [hovered, setHovered] = useState<number | null>(null);
	const laps = Math.max(0, ...positions.map((p) => p.length));
	const field = Math.max(drivers.length, ...positions.flat().map((p) => p ?? 0));
	const entries = race.entries;
	const hasGrid = entries.some((e) => e.grid != null);

	const data = useMemo(() => {
		const rows: Row[] = [];
		for (let lap = hasGrid ? 0 : 1; lap <= laps; lap++) {
			const row = { lap } as Row;
			drivers.forEach((_, i) => {
				row[`d${i}`] = lap === 0 ? (entries[i]?.grid ?? null) : (positions[i][lap - 1] ?? null);
			});
			rows.push(row);
		}
		return rows;
	}, [drivers, positions, entries, laps, hasGrid]);

	const name = (i: number) => {
		const e = entries[i];
		if (!e) return driverLetter(i);
		if (reveal.drivers || (i === 0 && reveal.winner)) return e.driver.name;
		return `Driver ${driverLetter(i)}`;
	};
	const team = (i: number) => (reveal.drivers || (i === 0 && reveal.team) ? entries[i]?.team.name : null);
	const colorOf = (i: number) => {
		if (i === 0) return WINNER;
		const p = picked.indexOf(i);
		if (p >= 0) return PICKED[p];
		return i === hovered ? "var(--foreground)" : null;
	};
	const toggle = (i: number) => setPicked((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i].slice(-PICKED.length)));
	const order = drivers.map((_, i) => i).sort((a, b) => Number(colorOf(a) != null) - Number(colorOf(b) != null));
	const ticks = [1, ...Array.from({ length: Math.floor(field / 5) }, (_, i) => (i + 1) * 5).filter((t) => t <= field)];
	const winnerLabel = reveal.winner || reveal.drivers;

	return (
		<div className="space-y-4">
			<div className="h-72 w-full sm:h-[26rem]" role="img" aria-label={`Lap chart: position of ${drivers.length} drivers over ${laps} laps; the winner's line is red.`}>
				<ResponsiveContainer width="100%" height="100%">
					<LineChart data={data} margin={{ top: 22, right: 12, bottom: 4, left: -6 }} onMouseLeave={() => setHovered(null)}>
						<CartesianGrid vertical={false} stroke="var(--border)" />
						<XAxis
							dataKey="lap"
							tickLine={false}
							axisLine={false}
							tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
							minTickGap={24}
							tickFormatter={(v: number) => (v === 0 ? "Grid" : String(v))}
						/>
						<YAxis reversed domain={[1, field]} ticks={ticks} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={44} tickFormatter={(v: number) => `P${v}`} />
						<Tooltip
							content={(props) => <ChartTooltip {...(props as object)} name={name} colorOf={colorOf} />}
							cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
							wrapperStyle={{ zIndex: 20 }}
						/>
						{order.map((i) => {
							const color = colorOf(i);
							return (
								<Line
									key={i}
									type="linear"
									dataKey={`d${i}`}
									name={name(i)}
									stroke={color ?? "var(--muted-foreground)"}
									strokeOpacity={color ? 1 : 0.3}
									strokeWidth={color ? 2.5 : 1.5}
									dot={false}
									activeDot={color ? { r: 4, strokeWidth: 2, stroke: "var(--background)", fill: color } : false}
									connectNulls={false}
									isAnimationActive={false}
									onMouseEnter={() => setHovered(i)}
									label={
										i === 0 && winnerLabel
											? (p: { x?: number | string; y?: number | string; index?: number }) =>
													p.index === data.length - 1 ? (
														<text key="winner" x={Number(p.x)} y={Number(p.y) - 9} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--foreground)">
															{entries[0]?.driver.name}
														</text>
													) : (
														<g key={p.index} />
													)
											: undefined
									}
								/>
							);
						})}
					</LineChart>
				</ResponsiveContainer>
			</div>
			<div className="space-y-2">
				<p className="text-muted-foreground text-xs">
					Position at the end of each lap, in finishing order. The winner is red; tap up to {PICKED.length} more to follow them.
				</p>
				<ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
					{drivers.map((_, i) => {
						const color = colorOf(i);
						const t = team(i);
						const e = entries[i];
						const showFlag = reveal.drivers || (i === 0 && reveal.winner);
						return (
							<li key={i} className="min-w-0" onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
								<button
									type="button"
									disabled={i === 0}
									aria-pressed={i === 0 ? undefined : picked.includes(i)}
									onClick={() => toggle(i)}
									className={cn(
										"hover:bg-muted flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition-colors disabled:cursor-default disabled:hover:bg-transparent sm:text-sm pointer-coarse:min-h-10",
										picked.includes(i) && "bg-muted",
									)}
								>
									<span className="inline-block h-1 w-4 shrink-0 rounded-full" style={{ background: color ?? "var(--muted-foreground)", opacity: color ? 1 : 0.4 }} />
									<span className="min-w-0 flex-1 leading-tight">
										<span className={cn("flex min-w-0 items-center gap-1.5 truncate", color ? "font-medium" : "text-muted-foreground")}>
											{showFlag && e && <Flag code={e.driver.flag} className="max-sm:hidden" />}
											<span className="truncate">{name(i)}</span>
										</span>
										{t && <span className="text-muted-foreground block truncate text-[11px] sm:text-xs">{t}</span>}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
				{over && (
					<p className="text-muted-foreground text-xs">
						{entries.slice(0, 3).map((e, i) => (
							<span key={e.driver.id}>
								{i > 0 && " · "}P{i + 1}{" "}
								<ULink href={href.driver(e.driver.id)} data-card={`driver:${e.driver.id}`} className="text-foreground font-medium underline-offset-4 hover:underline">
									{e.driver.name}
								</ULink>
							</span>
						))}
					</p>
				)}
			</div>
		</div>
	);
}

function ChartTooltip({
	active,
	payload,
	label,
	name,
	colorOf,
}: {
	active?: boolean;
	payload?: { dataKey?: unknown; value?: unknown }[];
	label?: unknown;
	name: (i: number) => string;
	colorOf: (i: number) => string | null;
}) {
	if (!active || !payload?.length) return null;
	const lap = Number(label);
	const order = payload
		.filter((p) => typeof p.value === "number")
		.map((p) => ({ i: Number(String(p.dataKey).slice(1)), pos: p.value as number }))
		.sort((a, b) => a.pos - b.pos)
		.filter((x) => x.pos <= 10 || colorOf(x.i));
	return (
		<div className="bg-popover text-popover-foreground ring-foreground/10 max-w-xs rounded-lg px-3 py-2 text-xs shadow-md ring-1">
			<div className="mb-1 font-medium tabular-nums">{lap === 0 ? "Grid" : `Lap ${lap}`}</div>
			<div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
				{order.map(({ i, pos }) => {
					const color = colorOf(i);
					return (
						<div key={i} className={cn("contents", !color && "text-muted-foreground")}>
							<span className="text-right tabular-nums">P{pos}</span>
							<span className={cn("flex min-w-0 items-center gap-1.5", color && "text-foreground font-medium")}>
								<span className="inline-block h-0.5 w-3 shrink-0 rounded-full" style={{ background: color ?? "var(--muted-foreground)" }} />
								<span className="truncate">{name(i)}</span>
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
