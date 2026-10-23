"use client";

// Daily "Race prediction" game (/play/predict). The races are a static file
// (public/data/race-entries.json, shared with "Name the grid"); the day's race, the scoring and
// the share text come from lib/game/predict. One attempt a day: the prediction (and the draft
// before it) and the stats live in localStorage.

import { useEffect, useMemo, useState } from "react";
import { Check, ArrowUpDown, Dices, GripVertical, Timer, Trophy, X } from "lucide-react";
import { emptyStats, gameStore, puzzleNumber, recordResult, VERDICT_SQUARE, type GameMode } from "@pitwall/core/game/daily";
import {
	complete,
	dailyRace,
	isWin,
	MAX_POINTS,
	PERCENT_BUCKETS,
	percentBucketLabel,
	percentBucketSrLabel,
	place,
	podium,
	POINTS,
	randomRace,
	resultBucket,
	score,
	shareText,
	SLOTS,
	swap,
	toggle,
	WIN_POINTS,
	type Score,
} from "@pitwall/core/game/predict";
import { shortNames, unpackRaceEntries, type Entry, type RaceData, type RaceEntriesFile, type RaceEntry } from "@pitwall/core/game/race-entries";
import { cn } from "@/lib/utils";
import { Flag, fmtDate, href, num, Page } from "../f1";
import { ULink } from "../universe-link";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { GameError, GameHeader, GameLoading, jsonLoader, LegendItem, ResultCard, shareResult, StatsDialog, useGameData, useToday, VERDICT_STYLE } from "./kit";

const loadData = jsonLoader("/data/race-entries.json", (f: RaceEntriesFile): RaceData => unpackRaceEntries(f));

const store = gameStore("predict");
const readStats = () => store.readStats("stats", PERCENT_BUCKETS);

/** A prediction: six driver ids (null = empty slot), the fastest lap pick, and whether it's been locked in. */
type Pick = { picks: (string | null)[]; fl: string | null; done: boolean };
const EMPTY: Pick = { picks: Array(SLOTS).fill(null), fl: null, done: false };

const gridLabel = (e: Entry) => (e.grid ? `P${e.grid}` : "PL");

export function PredictGame() {
	const { data, error, retry } = useGameData(loadData);
	const { today, rollover } = useToday();
	const [mode, setMode] = useState<GameMode>("daily");
	const [daily, setDaily] = useState<Pick>(EMPTY);
	const [stats, setStats] = useState(() => emptyStats(PERCENT_BUCKETS));
	const [practice, setPractice] = useState<{ race: string; pick: Pick } | null>(null);
	const [statsOpen, setStatsOpen] = useState(false);

	useEffect(() => {
		if (today == null) return;
		setDaily({ ...EMPTY, ...store.readDaily<Pick>("daily", today) });
		setStats(readStats());
	}, [today]);

	useEffect(() => {
		if (data && mode === "practice" && !practice) setPractice({ race: randomRace(data.races).id, pick: EMPTY });
	}, [data, mode, practice]);

	const race = useMemo(() => {
		if (!data || today == null) return null;
		if (mode === "daily") return dailyRace(data.races, today);
		return practice ? (data.byId.get(practice.race) ?? null) : null;
	}, [data, today, mode, practice]);

	const pick = mode === "daily" ? daily : (practice?.pick ?? EMPTY);
	const result = useMemo(() => (race && pick.done ? score(race, pick.picks, pick.fl) : null), [race, pick]);

	const update = (next: Pick) => {
		if (mode === "practice") {
			setPractice((p) => p && { ...p, pick: next });
			return;
		}
		if (today == null || !race) return;
		setDaily(next);
		store.writeDaily("daily", today, next);
		if (next.done) {
			const total = score(race, next.picks, next.fl).total;
			const s = recordResult(readStats(), today, isWin(total), resultBucket(total));
			store.write("stats", s);
			setStats(s);
		}
	};

	const newPractice = (exclude?: string) => data && setPractice({ race: randomRace(data.races, Math.random, exclude).id, pick: EMPTY });

	const share = () => {
		if (today == null || !race || !result) return;
		const label = mode === "daily" ? `#${puzzleNumber(today)}` : "practice";
		shareResult(shareText({ label, race, result, url: `${location.origin}/play/predict` }), { description: "Paste it anywhere to share your prediction." });
	};

	const ready = data && race && today != null;
	return (
		<Page className="max-w-5xl space-y-8">
			<GameHeader title="Race prediction" today={today} mode={mode} onModeChange={setMode} onStats={() => setStatsOpen(true)}>
				A race from the archive every day at midnight UTC, the same for everyone. From the starting grid, predict the top six and who set the fastest
				lap, then see how it really went. One go a day, and don&apos;t look it up!
			</GameHeader>

			{error ? (
				<GameError what="the races" onRetry={retry} />
			) : !ready ? (
				<GameLoading />
			) : (
				<div className="space-y-6">
					<RaceCard race={race} linked={pick.done} />
					{result ? (
						<>
							<ResultCard
								won={isWin(result.total)}
								status={
									result.total === MAX_POINTS
										? "A perfect prediction!"
										: isWin(result.total)
											? "Good call. Here's how it finished:"
											: "Not quite. Here's how it finished:"
								}
								mode={mode}
								nextLabel={mode === "practice" ? "Next practice race" : "Practice with a random race"}
								countdownLabel="Next race in"
								onShare={share}
								onStats={() => setStatsOpen(true)}
								onNext={() => {
									setMode("practice");
									newPractice(race.id);
								}}
								onRollover={rollover}
							>
								<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
									<span className="text-4xl font-semibold tracking-tight tabular-nums">
										{result.total}
										<span className="text-muted-foreground text-2xl">/{result.max}</span>
									</span>
									<span className="text-xl tracking-widest" aria-hidden>
										{result.slots.map((s) => VERDICT_SQUARE[s.verdict]).join("")}
									</span>
								</div>
								<p className="text-muted-foreground text-sm">
									{result.slots.filter((s) => s.verdict === "match").length} exact, {result.slots.filter((s) => s.points === POINTS.close).length} off by one
									{result.bonus.points ? ", and the fastest lap" : ""}.
								</p>
							</ResultCard>
							<Reveal race={race} result={result} />
						</>
					) : (
						<Picker race={race} pick={pick} onChange={update} onNewRace={mode === "practice" ? () => newPractice(race.id) : undefined} />
					)}
					<div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2 text-xs">
						<LegendItem verdict="match" icon={Check}>
							Exact: {POINTS.exact} pts
						</LegendItem>
						<LegendItem verdict="close" icon={ArrowUpDown}>
							One place off: {POINTS.close} pts
						</LegendItem>
						<LegendItem verdict="miss" icon={X}>
							Elsewhere in the top six: {POINTS.top} pts, otherwise 0
						</LegendItem>
						<span className="inline-flex items-center gap-1.5">
							<Timer className="size-3.5" />
							Fastest lap: {POINTS.bonus} pts
						</span>
					</div>
				</div>
			)}

			<StatsDialog
				open={statsOpen}
				onOpenChange={setStatsOpen}
				stats={stats}
				today={today}
				description={`Daily races, saved in this browser. A win is ${WIN_POINTS} points or more out of ${MAX_POINTS}.`}
				distributionTitle="Score distribution"
				distributionLabel="Daily results by share of the maximum points"
				bucketLabel={percentBucketLabel}
				bucketSrLabel={percentBucketSrLabel}
				labelClassName="w-9"
				highlight={mode === "daily" && result ? resultBucket(result.total) : null}
			/>
		</Page>
	);
}

/* ------------------------------------------------------------- the race --- */

function RaceCard({ race: r, linked }: { race: RaceEntry; linked: boolean }) {
	const title = `${r.year} ${r.gp.name}`;
	return (
		<Card>
			<CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex min-w-0 items-center gap-3">
					<Flag code={r.gp.flag} className="text-3xl" />
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
							{r.circuit.name}, {r.circuit.place} · Round {r.round} of {r.rounds} · {fmtDate(r.date)}
						</p>
					</div>
				</div>
				<div className="min-w-0 shrink-0 sm:text-right">
					<div className="text-muted-foreground mb-1 text-xs font-medium">Championship before the race</div>
					{r.leaders.length ? (
						<ol className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm sm:justify-end">
							{r.leaders.map((l, i) => (
								<li key={l.driver.id} className="flex items-center gap-1.5 whitespace-nowrap">
									<span className="text-muted-foreground text-xs tabular-nums">{i + 1}.</span>
									<Flag code={l.driver.flag} className="text-xs" />
									<span className="font-medium">{l.driver.last}</span>
									<span className="text-muted-foreground tabular-nums">{num(l.points)}</span>
								</li>
							))}
						</ol>
					) : (
						<div className="text-sm">Season opener: no points yet</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

/* ------------------------------------------------------------ predicting --- */

const DRAG = "application/x-pitwall-predict";

function Picker({ race, pick, onChange, onNewRace }: { race: RaceEntry; pick: Pick; onChange: (p: Pick) => void; onNewRace?: () => void }) {
	const byId = useMemo(() => new Map(race.entries.map((e) => [e.driver.id, e])), [race]);
	const short = useMemo(() => shortNames(race.entries), [race]);
	const next = pick.picks.indexOf(null);
	const [over, setOver] = useState<number | null>(null);
	const set = (picks: (string | null)[]) => onChange({ ...pick, picks });

	const drop = (slot: number, e: React.DragEvent) => {
		e.preventDefault();
		setOver(null);
		const raw = e.dataTransfer.getData(DRAG);
		if (raw.startsWith("slot:")) set(swap(pick.picks, Number(raw.slice(5)), slot));
		else if (raw.startsWith("driver:")) set(place(pick.picks, raw.slice(7), slot));
	};

	return (
		<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
			<section aria-labelledby="predict-slots" className="space-y-3 lg:sticky lg:top-20 lg:order-2">
				<div className="flex items-baseline justify-between gap-3">
					<h3 id="predict-slots" className="font-semibold">
						Your top six
					</h3>
					<span className="text-muted-foreground text-xs">Tap a slot to clear it</span>
				</div>
				<ol className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
					{pick.picks.map((id, i) => {
						const e = id ? byId.get(id) : null;
						return (
							<li key={i}>
								<button
									type="button"
									draggable={!!e}
									onDragStart={(ev) => ev.dataTransfer.setData(DRAG, `slot:${i}`)}
									onDragOver={(ev) => {
										ev.preventDefault();
										setOver(i);
									}}
									onDragLeave={() => setOver(null)}
									onDrop={(ev) => drop(i, ev)}
									onClick={() => e && set(pick.picks.map((p, j) => (j === i ? null : p)))}
									aria-label={e ? `P${i + 1}: ${e.driver.name}. Clear` : `P${i + 1}: empty`}
									className={cn(
										"flex h-12 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm ring-1 ring-inset transition-colors",
										e ? "bg-card ring-border hover:bg-muted cursor-pointer" : "ring-border/80 text-muted-foreground cursor-default border-dashed",
										i === next && "ring-foreground/50 bg-muted/50 text-foreground ring-2",
										over === i && "ring-primary ring-2",
									)}
								>
									<span
										className={cn(
											"flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
											e ? "bg-primary text-primary-foreground" : "bg-muted",
										)}
									>
										{i + 1}
									</span>
									{e ? (
										<span className="animate-in fade-in-0 slide-in-from-left-1 flex min-w-0 flex-1 flex-col leading-tight duration-200">
											<span className="flex min-w-0 items-center gap-1.5 font-medium">
												<span className="hidden shrink-0 sm:inline-flex">
													<Flag code={e.driver.flag} className="text-xs" />
												</span>
												<span className="truncate sm:hidden">{short.get(e.driver.id)}</span>
												<span className="hidden truncate sm:inline">{e.driver.name}</span>
											</span>
											<span className="text-muted-foreground truncate text-xs">{e.team.name}</span>
										</span>
									) : (
										<span className="flex-1 truncate text-xs">{i === next ? "Tap a driver" : "Empty"}</span>
									)}
									{e && <GripVertical aria-hidden className="text-muted-foreground hidden size-4 shrink-0 sm:pointer-fine:block" />}
								</button>
							</li>
						);
					})}
				</ol>
				<div className="space-y-1.5">
					<label className="flex items-center gap-1.5 text-sm font-medium" id="predict-fl">
						<Timer className="size-4" />
						Bonus: who sets the fastest lap?
					</label>
					<Select
						items={race.entries.map((e) => ({ value: e.driver.id, label: e.driver.name }))}
						value={pick.fl}
						onValueChange={(v) => onChange({ ...pick, fl: String(v) })}
					>
						<SelectTrigger className="pointer-coarse:min-h-10 h-10 w-full" aria-labelledby="predict-fl">
							<SelectValue placeholder="Pick a driver (optional)" />
						</SelectTrigger>
						<SelectContent>
							{race.entries.map((e) => (
								<SelectItem key={e.driver.id} value={e.driver.id}>
									{e.driver.name}
									<span className="text-muted-foreground text-xs">{e.team.name}</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button size="lg" className="pointer-coarse:min-h-10 flex-1" disabled={!complete(pick.picks)} onClick={() => onChange({ ...pick, done: true })}>
						<Trophy data-icon="inline-start" />
						Lock in prediction
					</Button>
					{onNewRace && (
						<Button size="lg" variant="outline" className="pointer-coarse:min-h-10" onClick={onNewRace}>
							<Dices data-icon="inline-start" />
							New race
						</Button>
					)}
				</div>
				<p className="text-muted-foreground text-xs">
					{complete(pick.picks) ? "Ready when you are. No changes after this, and no peeking at the result!" : `Pick ${pick.picks.filter((p) => !p).length} more to lock in.`}
				</p>
			</section>

			<section aria-labelledby="predict-grid" className="space-y-3 lg:order-1">
				<div className="flex items-baseline justify-between gap-3">
					<h3 id="predict-grid" className="font-semibold">
						Starting grid
					</h3>
					<span className="text-muted-foreground text-xs">
						{race.entries.length} starters · <span className="pointer-fine:hidden">tap to pick</span>
						<span className="hidden pointer-fine:inline">click or drag to a slot</span>
					</span>
				</div>
				<ol className="grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2">
					{race.entries.map((e) => {
						const at = pick.picks.indexOf(e.driver.id);
						return (
							<li key={e.driver.id}>
								<button
									type="button"
									draggable
									onDragStart={(ev) => ev.dataTransfer.setData(DRAG, `driver:${e.driver.id}`)}
									onClick={() => set(toggle(pick.picks, e.driver.id))}
									disabled={at < 0 && next < 0}
									aria-pressed={at >= 0}
									aria-label={`${gridLabel(e)} ${e.driver.name}, ${e.team.name}${at >= 0 ? `: your P${at + 1}` : ""}`}
									className={cn(
										"flex h-11 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-sm ring-1 ring-inset transition-colors disabled:opacity-50",
										at >= 0 ? "bg-primary/10 ring-primary" : "bg-card ring-border hover:bg-muted",
									)}
								>
									<span className="text-muted-foreground w-8 shrink-0 text-xs font-semibold tabular-nums">{gridLabel(e)}</span>
									<Flag code={e.driver.flag} className="text-xs" />
									<span className="flex min-w-0 flex-1 items-baseline gap-1.5">
										<span className="min-w-0 truncate font-medium">{e.driver.name}</span>
										<span className="text-muted-foreground min-w-0 shrink-[3] truncate text-xs">{e.team.name}</span>
									</span>
									{at >= 0 && (
										<span className="bg-primary text-primary-foreground animate-in zoom-in-50 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
											P{at + 1}
										</span>
									)}
								</button>
							</li>
						);
					})}
				</ol>
			</section>
		</div>
	);
}

/* --------------------------------------------------------------- reveal --- */

const ROW = "grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_2.25rem] items-center gap-1.5 sm:grid-cols-[2.5rem_minmax(0,20rem)_minmax(0,1fr)_3.5rem] sm:gap-4";

function Reveal({ race, result }: { race: RaceEntry; result: Score }) {
	const byId = useMemo(() => new Map(race.entries.map((e) => [e.driver.id, e])), [race]);
	const short = useMemo(() => shortNames(race.entries), [race]);
	const actual = podium(race);
	const fl = result.bonus;
	const flEntry = fl.actual ? byId.get(fl.actual) : undefined;
	const flPick = fl.pick ? byId.get(fl.pick) : undefined;
	return (
		<Card>
			<CardContent className="space-y-2">
				<div className={cn(ROW, "text-muted-foreground text-[11px] font-medium sm:text-xs")} aria-hidden>
					<span>Pos</span>
					<span>Your pick</span>
					<span>Result</span>
					<span className="text-right">Pts</span>
				</div>
				<ol className="space-y-1.5" aria-label="Your prediction against the result">
					{result.slots.map((s, i) => {
						const mine = s.pick ? byId.get(s.pick) : undefined;
						const real = actual[i];
						return (
							<li
								key={s.slot}
								className={cn(ROW, "animate-in fade-in-0 slide-in-from-left-3 fill-mode-both duration-500")}
								style={{ animationDelay: `${i * 160}ms` }}
							>
								<span className="text-muted-foreground text-sm font-semibold tabular-nums">P{s.slot}</span>
								<div className={cn("flex h-12 min-w-0 flex-col justify-center rounded-lg px-2 leading-tight sm:px-2.5", VERDICT_STYLE[s.verdict])}>
									<span className="truncate text-[13px] font-semibold sm:text-sm">
										{mine ? (
											<>
												<span className="sm:hidden">{short.get(mine.driver.id)}</span>
												<span className="hidden sm:inline">{mine.driver.name}</span>
											</>
										) : (
											"—"
										)}
									</span>
									<span className="truncate text-[11px] opacity-85">
										{s.finish ? `Finished P${s.finish}` : mine ? (mine.finish == null ? "Not classified" : "") : ""}
									</span>
									<span className="sr-only">: {s.verdict === "match" ? "exact" : s.verdict === "close" ? "one place off" : s.points ? "in the top six" : "not in the top six"}</span>
								</div>
								<div className="flex min-w-0 flex-col leading-tight">
									<ULink
										href={href.driver(real.driver.id)}
										data-card={`driver:${real.driver.id}`}
										className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium underline-offset-4 hover:underline sm:text-sm"
									>
										<span className="hidden shrink-0 sm:inline-flex"><Flag code={real.driver.flag} className="text-xs" /></span>
										<span className="truncate sm:hidden">{short.get(real.driver.id)}</span>
										<span className="hidden truncate sm:inline">{real.driver.name}</span>
									</ULink>
									<span className="text-muted-foreground flex min-w-0 gap-1 text-[11px] sm:text-xs">
										<span className="truncate">{real.team.name}</span>
										<span className="shrink-0">· from {gridLabel(real)}</span>
									</span>
								</div>
								<Points points={s.points} delay={i * 160 + 250} />
							</li>
						);
					})}
					<li className={cn(ROW, "animate-in fade-in-0 slide-in-from-left-3 fill-mode-both border-t pt-2 duration-500")} style={{ animationDelay: `${SLOTS * 160}ms` }}>
						<Timer className="text-muted-foreground size-4" aria-label="Fastest lap" />
						<div
							className={cn(
								"flex h-12 min-w-0 flex-col justify-center rounded-lg px-2 leading-tight sm:px-2.5",
								VERDICT_STYLE[fl.points ? "match" : "miss"],
							)}
						>
							<span className="truncate text-[13px] font-semibold sm:text-sm">
								{flPick ? (
									<>
										<span className="sm:hidden">{short.get(flPick.driver.id)}</span>
										<span className="hidden sm:inline">{flPick.driver.name}</span>
									</>
								) : (
									"No pick"
								)}
							</span>
							<span className="truncate text-[11px] opacity-85">Fastest lap</span>
						</div>
						<div className="flex min-w-0 flex-col leading-tight">
							{flEntry ? (
								<ULink
									href={href.driver(flEntry.driver.id)}
									data-card={`driver:${flEntry.driver.id}`}
									className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium underline-offset-4 hover:underline sm:text-sm"
								>
									<span className="hidden shrink-0 sm:inline-flex"><Flag code={flEntry.driver.flag} className="text-xs" /></span>
									<span className="truncate sm:hidden">{short.get(flEntry.driver.id)}</span>
									<span className="hidden truncate sm:inline">{flEntry.driver.name}</span>
								</ULink>
							) : (
								<span className="text-sm">—</span>
							)}
							<span className="text-muted-foreground truncate text-[11px] sm:text-xs">{flEntry?.team.name ?? ""}</span>
						</div>
						<Points points={fl.points} delay={SLOTS * 160 + 250} />
					</li>
				</ol>
				<div className="flex items-center justify-between border-t pt-3 text-sm">
					<span className="text-muted-foreground">Total</span>
					<span className="font-semibold tabular-nums">
						{result.total} <span className="text-muted-foreground font-normal">/ {result.max}</span>
					</span>
				</div>
			</CardContent>
		</Card>
	);
}

function Points({ points, delay }: { points: number; delay: number }) {
	return (
		<span
			className={cn(
				"animate-in zoom-in-50 fade-in-0 fill-mode-both justify-self-end rounded-md px-1.5 py-1 text-sm font-semibold tabular-nums duration-300",
				points ? "text-foreground" : "text-muted-foreground",
			)}
			style={{ animationDelay: `${delay}ms` }}
		>
			+{points}
		</span>
	);
}
