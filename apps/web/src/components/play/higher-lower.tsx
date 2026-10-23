"use client";

// "Higher or lower" (/play/higher-lower): two drivers (or constructors) and one career stat.
// Daily is a fixed run of ten rounds, the same for everyone; Practice is endless, until the
// first miss. Data is public/data/higher-lower.json; rounds, answers and share text come from
// lib/game/higher-lower. The shared game chrome (header, result card, stats) is ./kit.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, X } from "lucide-react";
import { gameStore, type GameMode, type GameStats } from "@pitwall/core/game/daily";
import {
	DAILY_ROUNDS,
	dailyRounds,
	emptyStats,
	endlessKind,
	isCorrect,
	nextRound,
	puzzleNumber,
	recordResult,
	score,
	shareText,
	STATS,
	unpack,
	value,
	WIN_SCORE,
	type Choice,
	type Entity,
	type HigherLowerFile,
	type Round,
} from "@pitwall/core/game/higher-lower";
import { cn } from "@/lib/utils";
import { Flag, href, num, Page } from "../f1";
import { ULink } from "../universe-link";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { GameError, GameHeader, GameLoading, jsonLoader, ResultCard, shareResult, StatsDialog, useGameData, useToday, VERDICT_STYLE } from "./kit";

type Data = { entities: Entity[]; lapsFrom: number };

const loadData = jsonLoader("/data/higher-lower.json", (f: HigherLowerFile): Data => ({ entities: f.entities.map(unpack), lapsFrom: f.lapsFrom }));

const store = gameStore("higher-lower");
const readStats = () => store.readStats("stats", DAILY_ROUNDS + 1);
/** How long a reveal shows before the challenger moves across. */
const REVEAL_MS = 1500;

const years = (e: Entity) => (e.first === e.last ? String(e.first) : `${e.first}–${e.last}`);

export function HigherLowerGame() {
	const { data, error, retry } = useGameData(loadData);
	const { today, rollover } = useToday();
	const [mode, setModeState] = useState<GameMode>("daily");
	const [daily, setDaily] = useState<Choice[]>([]);
	const [stats, setStats] = useState<GameStats>(emptyStats);
	const [best, setBest] = useState(0);
	const [endless, setEndless] = useState<{ rounds: Round[]; answers: Choice[] } | null>(null);
	const [revealing, setRevealing] = useState<number | null>(null);
	const [statsOpen, setStatsOpen] = useState(false);

	useEffect(() => setBest(store.read<number>("best", 0)), []);
	useEffect(() => {
		if (today == null) return;
		setDaily(store.readDaily<{ answers: Choice[] }>("daily", today)?.answers ?? []);
		setStats(readStats());
	}, [today]);

	const dailyRun = useMemo(() => (data && today != null ? dailyRounds(data.entities, today) : null), [data, today]);

	const freshEndless = useCallback(() => {
		if (!data) return;
		const kind = endlessKind([], Math.random);
		setEndless({ rounds: [nextRound(data.entities, [], kind, Math.random)], answers: [] });
	}, [data]);

	useEffect(() => {
		if (mode === "practice" && !endless) freshEndless();
	}, [mode, endless, freshEndless]);

	const setMode = (m: GameMode) => {
		setModeState(m);
		setRevealing(null);
	};

	const rounds = mode === "daily" ? dailyRun : (endless?.rounds ?? null);
	const answers = mode === "daily" ? daily : (endless?.answers ?? []);
	const marks = rounds ? answers.map((c, i) => isCorrect(rounds[i], c)) : [];
	const points = rounds ? score(rounds, answers) : 0;
	const streak = mode === "practice" ? marks.filter(Boolean).length : 0;
	const finished = mode === "daily" ? answers.length >= DAILY_ROUNDS : marks.length > 0 && !marks[marks.length - 1];
	const over = finished && revealing == null;
	const at = revealing ?? Math.min(answers.length, (rounds?.length ?? 1) - 1);
	const round = rounds?.[at] ?? null;

	// the reveal holds for a moment, then the next round slides in
	useEffect(() => {
		if (revealing == null) return;
		const t = setTimeout(() => setRevealing(null), REVEAL_MS);
		return () => clearTimeout(t);
	}, [revealing]);

	const answer = useCallback(
		(choice: Choice) => {
			if (!data || !rounds || today == null || revealing != null || finished) return;
			const idx = answers.length;
			const correct = isCorrect(rounds[idx], choice);
			if (mode === "daily") {
				const next = [...daily, choice];
				setDaily(next);
				store.writeDaily("daily", today, { answers: next });
				if (next.length >= DAILY_ROUNDS) {
					const s = recordResult(readStats(), today, score(rounds, next));
					store.write("stats", s);
					setStats(s);
				}
			} else {
				setEndless((e) => {
					if (!e) return e;
					const nextRounds = correct ? [...e.rounds, nextRound(data.entities, e.rounds, endlessKind(e.rounds, Math.random), Math.random)] : e.rounds;
					return { rounds: nextRounds, answers: [...e.answers, choice] };
				});
				if (correct && streak + 1 > best) {
					setBest(streak + 1);
					store.write("best", streak + 1);
				}
			}
			setRevealing(idx);
		},
		[data, rounds, today, revealing, finished, answers.length, mode, daily, streak, best],
	);

	// keyboard: ↑ / H higher, ↓ / L lower
	useEffect(() => {
		if (over || !round) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement)?.closest?.("input, textarea, [role=dialog]")) return;
			const k = e.key.toLowerCase();
			if (k === "arrowup" || k === "h") answer("higher");
			else if (k === "arrowdown" || k === "l") answer("lower");
			else return;
			e.preventDefault();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [over, round, answer]);

	const share = () => {
		if (today == null) return;
		if (mode === "daily") shareResult(shareText({ marks, label: `#${puzzleNumber(today)}`, tail: `${points}/${DAILY_ROUNDS}`, url: `${location.origin}/play/higher-lower` }));
		else shareResult(shareText({ marks: marks.length <= 20 ? marks : [], label: "endless", tail: `streak ${streak}`, url: `${location.origin}/play/higher-lower` }));
	};

	const ready = data && rounds && round && today != null;
	return (
		<Page className="max-w-5xl space-y-8">
			<GameHeader title="Higher or lower" today={today} mode={mode} onModeChange={setMode} practiceLabel="Endless" onStats={() => setStatsOpen(true)}>
				Does the next driver or constructor have more? Career wins, poles, starts, podiums or laps led, one stat a round; ties count as right. Daily is ten
				rounds, the same for everyone, new at midnight UTC. Endless keeps going until your first miss.
			</GameHeader>

			{error ? (
				<GameError what="the drivers" onRetry={retry} />
			) : !ready ? (
				<GameLoading />
			) : over ? (
				<ResultCard
					won={mode === "daily" ? points >= WIN_SCORE : streak > 0 && streak >= best}
					status={
						mode === "daily"
							? `${points === DAILY_ROUNDS ? "Perfect! " : ""}You scored ${points} out of ${DAILY_ROUNDS}.`
							: streak >= best && streak > 0
								? `New best: a streak of ${streak}.`
								: `Streak over at ${streak}. Your best is ${best}.`
					}
					mode={mode}
					nextLabel={mode === "daily" ? "Play endless" : "Play again"}
					countdownLabel="Next run in"
					onShare={share}
					onStats={() => setStatsOpen(true)}
					onNext={() => {
						setMode("practice");
						freshEndless();
					}}
					onRollover={rollover}
				>
					<Summary rounds={rounds.slice(0, answers.length)} answers={answers} />
				</ResultCard>
			) : (
				<div className="space-y-5">
					<Progress mode={mode} marks={marks} at={at} revealing={revealing != null} streak={streak} best={best} />
					<div className="space-y-1 text-center">
						<h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{STATS[round.stat].question[round.left.kind]}</h2>
						<p className="text-muted-foreground text-xs sm:text-sm">
							Does <span className="text-foreground font-medium">{round.right.name}</span> have more {STATS[round.stat].unit[1]} than {round.left.name}?
							{round.stat === "lapsLed" && ` Laps led are counted since ${data.lapsFrom}.`}
						</p>
					</div>
					<Duel key={at} round={round} carried={at > 0 && rounds[at - 1].right.id === round.left.id} reveal={revealing === at} choice={answers[at]} onAnswer={answer} />
					<p className="text-muted-foreground hidden items-center justify-center gap-1.5 text-xs sm:flex">
						<Kbd>↑</Kbd> or <Kbd>H</Kbd> higher, <Kbd>↓</Kbd> or <Kbd>L</Kbd> lower
					</p>
				</div>
			)}

			<StatsDialog
				open={statsOpen}
				onOpenChange={setStatsOpen}
				stats={stats}
				today={today}
				description={`Daily runs of ${DAILY_ROUNDS}; ${WIN_SCORE} or more counts as a win. Best endless streak: ${best}. Saved in this browser.`}
				distributionTitle="Score distribution"
				distributionLabel="Daily runs by score"
				bucketLabel={(i) => String(i)}
				bucketSrLabel={(i) => `runs scoring ${i}`}
				labelClassName="w-5"
				highlight={mode === "daily" && over ? points : null}
			/>
		</Page>
	);
}

/* ------------------------------------------------------------- progress --- */

function Progress({ mode, marks, at, revealing, streak, best }: { mode: GameMode; marks: boolean[]; at: number; revealing: boolean; streak: number; best: number }) {
	if (mode === "practice")
		return (
			<div className="text-muted-foreground flex items-center justify-center gap-4 text-sm">
				<span>
					Streak <span className="text-foreground font-semibold tabular-nums">{streak}</span>
				</span>
				<span>
					Best <span className="text-foreground font-semibold tabular-nums">{Math.max(best, streak)}</span>
				</span>
			</div>
		);
	const shown = revealing ? marks : marks.slice(0, at);
	return (
		<div className="flex flex-col items-center gap-2">
			<ol className="flex gap-1" aria-label={`Round ${at + 1} of ${DAILY_ROUNDS}`}>
				{Array.from({ length: DAILY_ROUNDS }, (_, i) => {
					const m = shown[i];
					return (
						<li
							key={i}
							className={cn(
								"flex size-6 items-center justify-center rounded-md transition-colors sm:size-7",
								m === true ? VERDICT_STYLE.match : m === false ? "bg-red-600 text-white" : i === at ? "ring-foreground/40 ring-2 ring-inset" : "bg-muted",
							)}
						>
							{m === true ? <Check className="size-3.5" strokeWidth={3} aria-label="right" /> : m === false ? <X className="size-3.5" strokeWidth={3} aria-label="wrong" /> : <span className="sr-only">round {i + 1}</span>}
						</li>
					);
				})}
			</ol>
			<div className="text-muted-foreground text-xs">
				Round {Math.min(at + 1, DAILY_ROUNDS)} of {DAILY_ROUNDS} · Score <span className="text-foreground font-medium tabular-nums">{shown.filter(Boolean).length}</span>
			</div>
		</div>
	);
}

/* ---------------------------------------------------------------- cards --- */

function useCountUp(target: number, run: boolean) {
	const [n, setN] = useState(run ? 0 : target);
	const frame = useRef(0);
	useEffect(() => {
		if (!run) {
			setN(target);
			return;
		}
		if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setN(target);
			return;
		}
		const start = performance.now();
		const tick = (t: number) => {
			const p = Math.min(1, (t - start) / 700);
			setN(Math.round(target * (1 - (1 - p) ** 3)));
			if (p < 1) frame.current = requestAnimationFrame(tick);
		};
		frame.current = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame.current);
	}, [target, run]);
	return n;
}

function Duel({ round, carried, reveal, choice, onAnswer }: { round: Round; carried: boolean; reveal: boolean; choice?: Choice; onAnswer: (c: Choice) => void }) {
	const correct = reveal && choice ? isCorrect(round, choice) : null;
	return (
		<div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
			<EntityCard
				entity={round.left}
				linked
				className={cn("animate-in fade-in-0 duration-500", carried ? "slide-in-from-bottom-6 sm:slide-in-from-bottom-0 sm:slide-in-from-right-24" : "zoom-in-95")}
			>
				<StatValue value={value(round.left, round.stat) ?? 0} stat={round.stat} />
			</EntityCard>
			<span
				aria-hidden
				className="bg-background text-muted-foreground ring-border absolute top-1/2 left-1/2 z-10 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-semibold ring-1"
			>
				vs
			</span>
			<EntityCard
				entity={round.right}
				linked={reveal}
				className={cn(
					"animate-in fade-in-0 zoom-in-95 fill-mode-both delay-150 duration-500 transition-shadow",
					correct === true && "ring-2 ring-emerald-600",
					correct === false && "ring-2 ring-red-600",
				)}
			>
				{reveal ? (
					<div className="flex flex-col items-center gap-1" aria-live="polite">
						<StatValue value={value(round.right, round.stat) ?? 0} stat={round.stat} animate />
						<span className={cn("inline-flex items-center gap-1 text-sm font-medium", correct ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
							{correct ? <Check className="size-4" strokeWidth={2.5} /> : <X className="size-4" strokeWidth={2.5} />}
							{correct ? "Right" : "Wrong"}
						</span>
					</div>
				) : (
					<div className="flex w-full flex-wrap justify-center gap-2">
						<Button size="lg" className="min-w-28 pointer-coarse:min-h-11" onClick={() => onAnswer("higher")}>
							<ArrowUp data-icon="inline-start" />
							Higher
						</Button>
						<Button size="lg" variant="outline" className="min-w-28 pointer-coarse:min-h-11" onClick={() => onAnswer("lower")}>
							<ArrowDown data-icon="inline-start" />
							Lower
						</Button>
					</div>
				)}
			</EntityCard>
		</div>
	);
}

function StatValue({ value: v, stat, animate = false }: { value: number; stat: Round["stat"]; animate?: boolean }) {
	const n = useCountUp(v, animate);
	return (
		<div className="text-center">
			<div className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{num(n)}</div>
			<div className="text-muted-foreground text-xs">{STATS[stat].unit[v === 1 ? 0 : 1]}</div>
		</div>
	);
}

/**
 * One side of the duel. No hover card here, ever: the entity cards list the very career stats
 * being asked. The name only becomes a (card-less) link once this side's value is showing.
 */
function EntityCard({ entity: e, linked, className, children }: { entity: Entity; linked: boolean; className?: string; children: React.ReactNode }) {
	const link = e.kind === "driver" ? href.driver(e.id) : href.team(e.id);
	const context = [years(e), e.kind === "driver" ? e.context : e.titles ? `${e.titles} ${e.titles === 1 ? "title" : "titles"}` : ""].filter(Boolean);
	const nameClass = "min-w-0 truncate text-lg font-semibold tracking-tight sm:text-xl";
	return (
		<div className={cn("bg-card ring-foreground/10 flex min-h-44 min-w-0 flex-col items-center justify-between gap-4 rounded-2xl px-4 py-5 text-center ring-1 sm:min-h-64 sm:px-6 sm:py-6", className)}>
			<div className="flex w-full min-w-0 flex-col items-center gap-1.5">
				<span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{e.kind === "driver" ? "Driver" : "Constructor"}</span>
				<div className="flex max-w-full min-w-0 items-center gap-2">
					<Flag code={e.flag} className="text-lg" />
					{linked ? (
						<ULink href={link} prefetch={false} className={cn(nameClass, "underline-offset-4 hover:underline")}>
							{e.name}
						</ULink>
					) : (
						<span className={nameClass}>{e.name}</span>
					)}
				</div>
				<div className="text-muted-foreground max-w-full truncate text-xs sm:text-sm">{context.join(" · ")}</div>
			</div>
			{children}
		</div>
	);
}

/* -------------------------------------------------------------- summary --- */

function Summary({ rounds, answers }: { rounds: Round[]; answers: Choice[] }) {
	return (
		<ol className="space-y-1.5" aria-label="Your answers">
			{rounds.map((r, i) => {
				const ok = isCorrect(r, answers[i]);
				const a = value(r.left, r.stat) ?? 0;
				const b = value(r.right, r.stat) ?? 0;
				return (
					<li key={i} className="flex min-w-0 items-start gap-2 text-xs sm:items-center sm:text-sm">
						<span className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded", ok ? VERDICT_STYLE.match : "bg-red-600 text-white")}>
							{ok ? <Check className="size-3" strokeWidth={3} aria-label="right" /> : <X className="size-3" strokeWidth={3} aria-label="wrong" />}
						</span>
						<span className="text-muted-foreground w-16 shrink-0 sm:w-20">{STATS[r.stat].label}</span>
						<span className="min-w-0 flex-1 sm:truncate">
							<span className="whitespace-nowrap"><NameLink e={r.left} /> <span className="tabular-nums">{num(a)}</span></span>
							<span className="text-muted-foreground"> vs </span>
							<span className="whitespace-nowrap"><NameLink e={r.right} /> <span className="font-semibold tabular-nums">{num(b)}</span></span>
						</span>
					</li>
				);
			})}
		</ol>
	);
}

const NameLink = ({ e }: { e: Entity }) => (
	<ULink href={e.kind === "driver" ? href.driver(e.id) : href.team(e.id)} data-card={`${e.kind}:${e.id}`} className="underline-offset-4 hover:underline">
		{e.name}
	</ULink>
);
