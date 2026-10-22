"use client";

// Daily "Career path" game (/play/career): a mystery driver's career told team by team. The
// data is public/data/career.json; the pick, reveals, verdicts and share text come from
// lib/game/career. Progress and stats live in localStorage, per difficulty; the shared game
// chrome (header, picker, result card, stats) is ./kit.

import { useEffect, useMemo, useState } from "react";
import { Check, Dices, Lock, Users, X } from "lucide-react";
import { gameStore, type GameMode, type GameStats, type Verdict } from "@/lib/game/daily";
import {
	dailyTarget,
	DIFFICULTIES,
	driverWeight,
	emptyStats,
	HINT_AFTER,
	HINTS,
	judge,
	MAX_GUESSES,
	puzzleNumber,
	randomTarget,
	recordResult,
	revealed,
	shareText,
	span,
	unpackFile,
	type CareerDriver,
	type CareerFile,
	type Difficulty,
	type GuessResult,
	type HintKey,
	type Stint,
} from "@/lib/game/career";
import { cn } from "@/lib/utils";
import { Flag, Hint, href, num, Page } from "../f1";
import { ULink } from "../universe-link";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import {
	ChoiceToggle,
	EntityPicker,
	Figures,
	GameError,
	GameHeader,
	GameLoading,
	jsonLoader,
	LegendItem,
	ResultCard,
	shareResult,
	StatsDialog,
	useGameData,
	useToday,
	VERDICT_STYLE,
} from "./kit";

type Data = { drivers: CareerDriver[]; byId: Map<string, CareerDriver>; teamNames: Map<string, string> };

const loadData = jsonLoader("/data/career.json", (f: CareerFile): Data => {
	const drivers = unpackFile(f);
	return { drivers, byId: new Map(drivers.map((d) => [d.id, d])), teamNames: new Map(f.teams) };
});

const store = gameStore("career");
const readStats = (difficulty: Difficulty) => store.readStats(`stats:${difficulty}`, MAX_GUESSES);

export function CareerGame() {
	const { data, error, retry } = useGameData(loadData);
	const { today, rollover } = useToday();
	const [difficulty, setDifficultyState] = useState<Difficulty>("modern");
	const [mode, setMode] = useState<GameMode>("daily");
	const [daily, setDaily] = useState<string[]>([]);
	const [stats, setStats] = useState<GameStats>(emptyStats);
	const [practice, setPractice] = useState<{ target: string; guesses: string[] } | null>(null);
	const [statsOpen, setStatsOpen] = useState(false);

	useEffect(() => setDifficultyState(store.read<Difficulty>("difficulty", "modern") === "all" ? "all" : "modern"), []);

	useEffect(() => {
		if (today == null) return;
		setDaily(store.readDaily<{ guesses: string[] }>(`daily:${difficulty}`, today)?.guesses ?? []);
		setStats(readStats(difficulty));
	}, [today, difficulty]);

	const setDifficulty = (d: Difficulty) => {
		setDifficultyState(d);
		store.write("difficulty", d);
		setPractice(null);
	};

	const target = useMemo(() => {
		if (!data || today == null) return null;
		if (mode === "daily") return dailyTarget(data.drivers, difficulty, today);
		return practice ? (data.byId.get(practice.target) ?? null) : null;
	}, [data, today, mode, difficulty, practice]);

	useEffect(() => {
		if (data && mode === "practice" && !practice) setPractice({ target: randomTarget(data.drivers, difficulty).id, guesses: [] });
	}, [data, mode, practice, difficulty]);

	const items = useMemo(
		() => data?.drivers.map((d) => ({ id: d.id, label: d.name, sublabel: span(d.first, d.last), weight: driverWeight(d), driver: d })) ?? [],
		[data],
	);
	const guesses = mode === "daily" ? daily : (practice?.guesses ?? []);
	const results = useMemo(
		() => (data && target ? guesses.map((id) => data.byId.get(id)).filter((d) => !!d).map((d) => judge(d, target)) : []),
		[data, target, guesses],
	);
	const won = results.some((r) => r.verdict === "match");
	const over = won || results.length >= MAX_GUESSES;

	const guess = (d: CareerDriver) => {
		if (over || !target || today == null) return;
		const next = [...guesses, d.id];
		if (mode === "practice") {
			setPractice((p) => p && { ...p, guesses: next });
			return;
		}
		setDaily(next);
		store.writeDaily(`daily:${difficulty}`, today, { guesses: next });
		if (d.id === target.id || next.length >= MAX_GUESSES) {
			const s = recordResult(readStats(difficulty), today, d.id === target.id, next.length);
			store.write(`stats:${difficulty}`, s);
			setStats(s);
		}
	};

	const share = () => {
		if (today == null) return;
		const diff = difficulty === "all" ? " (All time)" : "";
		const label = mode === "daily" ? `#${puzzleNumber(today)}${diff}` : `practice${diff}`;
		shareResult(shareText({ results, won, label, url: `${location.origin}/play/career` }));
	};

	const newPractice = (exclude: string) => setPractice({ target: randomTarget(data!.drivers, difficulty, Math.random, exclude).id, guesses: [] });
	const level = DIFFICULTIES.find((d) => d.id === difficulty)!;
	const ready = data && target && today != null;
	const wrong = results.filter((r) => r.verdict !== "match").length;
	const shown = target ? revealed(target, wrong, over) : { stints: 0, hints: 0 };
	return (
		<Page className="max-w-5xl space-y-8">
			<GameHeader
				title="Career path"
				today={today}
				mode={mode}
				onModeChange={setMode}
				controls={<ChoiceToggle value={difficulty} options={DIFFICULTIES} onChange={setDifficulty} />}
				onStats={() => setStatsOpen(true)}
			>
				A mystery driver every day at midnight UTC, told team by team. You see where the career began; each wrong guess shows the next team, and
				wrong guesses 3, 4 and 5 also unlock their nationality, wins and podiums, and initials. {MAX_GUESSES} guesses. {level.description}.
			</GameHeader>

			{error ? (
				<GameError what="the drivers" onRetry={retry} />
			) : !ready ? (
				<GameLoading />
			) : (
				<div className="space-y-6">
					{over ? (
						<ResultCard
							won={won}
							status={won ? (results.length === 1 ? "First time! Got it in 1." : `Got it in ${results.length} of ${MAX_GUESSES}.`) : "Out of guesses. The mystery driver was"}
							mode={mode}
							nextLabel={mode === "practice" ? "Next practice driver" : "Practice with a random driver"}
							countdownLabel="Next career in"
							onShare={share}
							onStats={() => setStatsOpen(true)}
							onNext={() => {
								setMode("practice");
								newPractice(target.id);
							}}
							onRollover={rollover}
						>
							<Reveal target={target} />
						</ResultCard>
					) : (
						<div className="space-y-2">
							<EntityPicker items={items} exclude={guesses} onPick={(i) => guess(i.driver)} label="Guess the driver" placeholder="Type a driver's name…" noun="drivers" />
							<div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
								<span className="flex items-center gap-1.5">
									Guess {results.length + 1} of {MAX_GUESSES}
									<span className="hidden items-center gap-1.5 sm:inline-flex">
										· <Kbd>↑</Kbd>
										<Kbd>↓</Kbd> to choose, <Kbd>Enter</Kbd> to guess
									</span>
								</span>
								{mode === "practice" && (
									<Button variant="ghost" size="xs" onClick={() => newPractice(target.id)}>
										<Dices data-icon="inline-start" />
										New driver
									</Button>
								)}
							</div>
						</div>
					)}
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-8">
						<Timeline target={target} shown={shown.stints} over={over} />
						<div className="space-y-6">
							<Hints target={target} shown={shown.hints} wrong={over ? null : wrong} />
							<Guesses results={results} teamNames={data.teamNames} />
						</div>
					</div>
					<div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2 text-xs">
						<LegendItem verdict="match" icon={Check}>
							The mystery driver
						</LegendItem>
						<LegendItem verdict="close" icon={Users}>
							Wrong, but drove for one of the same teams
						</LegendItem>
						<LegendItem verdict="miss" icon={X}>
							No team in common
						</LegendItem>
					</div>
				</div>
			)}

			<StatsDialog
				open={statsOpen}
				onOpenChange={setStatsOpen}
				stats={stats}
				today={today}
				description={`Daily puzzles, ${level.label.toLowerCase()}. Saved in this browser.`}
				highlight={mode === "daily" && won ? results.length - 1 : null}
			/>
		</Page>
	);
}

/* ------------------------------------------------------------- timeline --- */

function Timeline({ target, shown, over }: { target: CareerDriver; shown: number; over: boolean }) {
	const n = target.stints.length;
	return (
		<section className="min-w-0 space-y-3" aria-label="Career">
			<h2 className="flex items-baseline justify-between gap-3 text-sm font-medium">
				Career
				<span className="text-muted-foreground text-xs font-normal">
					{n} team stints{!over && shown < n ? ` · ${n - shown} hidden` : ""}
				</span>
			</h2>
			<ol className="relative space-y-2">
				<span aria-hidden className="bg-border absolute top-4 bottom-4 left-[0.9375rem] w-px" />
				{target.stints.map((s, i) => (
					<StintSlot key={i} n={i + 1} stint={i < shown ? s : null} over={over} first={i === 0} />
				))}
			</ol>
		</section>
	);
}

function StintSlot({ n, stint, over, first }: { n: number; stint: Stint | null; over: boolean; first: boolean }) {
	return (
		<li className="relative flex items-center gap-3">
			<span
				className={cn(
					"relative z-10 flex size-[1.875rem] shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
					stint ? "bg-foreground text-background" : "bg-background text-muted-foreground ring-border ring-1",
				)}
			>
				{n}
			</span>
			{stint ? (
				<div className={cn("bg-card ring-foreground/10 min-w-0 flex-1 rounded-xl px-3.5 py-2.5 ring-1", !first && "animate-in fade-in-0 slide-in-from-top-1 duration-500")}>
					<div className="flex min-w-0 items-baseline justify-between gap-3">
						{over ? (
							<ULink href={href.team(stint.team)} data-card={`team:${stint.team}`} className="min-w-0 truncate text-sm font-semibold underline-offset-4 hover:underline sm:text-base">
								{stint.teamName}
							</ULink>
						) : (
							<span className="min-w-0 truncate text-sm font-semibold sm:text-base">{stint.teamName}</span>
						)}
						<span className="text-muted-foreground shrink-0 text-xs tabular-nums sm:text-sm">{span(stint.from, stint.to)}</span>
					</div>
					{over && (
						<div className="text-muted-foreground mt-0.5 text-xs tabular-nums">
							{num(stint.starts)} {stint.starts === 1 ? "start" : "starts"} · {num(stint.wins)} {stint.wins === 1 ? "win" : "wins"} · {num(stint.podiums)}{" "}
							{stint.podiums === 1 ? "podium" : "podiums"}
						</div>
					)}
				</div>
			) : (
				<div className="text-muted-foreground border-border flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-dashed px-3.5 text-xs sm:text-sm">
					<Lock className="size-3.5 shrink-0" aria-hidden />
					<span className="truncate">Hidden team</span>
				</div>
			)}
		</li>
	);
}

/* ---------------------------------------------------------------- hints --- */

function hintValue(key: HintKey, d: CareerDriver): React.ReactNode {
	if (key === "nation")
		return (
			<span className="flex min-w-0 flex-col items-center gap-1">
				<Flag code={d.flag} className="text-lg" />
				<span className="max-w-full truncate text-[11px] font-medium sm:text-xs">{d.nation}</span>
			</span>
		);
	if (key === "results")
		return (
			<span className="text-sm font-semibold tabular-nums sm:text-base">
				{num(d.wins)} · {num(d.podiums)}
			</span>
		);
	return <span className="text-base font-semibold tracking-wide sm:text-lg">{d.initials}</span>;
}

/** The hint cards: open ones show their value, locked ones say which wrong guess opens them. */
function Hints({ target, shown, wrong }: { target: CareerDriver; shown: number; wrong: number | null }) {
	return (
		<section className="space-y-3" aria-label="Hints">
			<h2 className="flex items-baseline justify-between gap-3 text-sm font-medium">
				Hints
				<span className="text-muted-foreground text-xs font-normal">
					{shown} of {HINTS.length} unlocked
				</span>
			</h2>
			<div className="grid grid-cols-3 gap-1.5">
				{HINTS.map((h, i) => {
					const open = i < shown;
					const after = HINT_AFTER[i];
					const next = !open && wrong != null && wrong + 1 === after;
					const text = open ? (h.key === "nation" ? target.nation : h.key === "results" ? `${target.wins} wins, ${target.podiums} podiums` : target.initials) : "";
					return (
						<div
							key={h.key}
							className={cn(
								"flex h-[4.5rem] min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-center",
								open
									? "bg-card ring-foreground/10 animate-in fade-in-0 zoom-in-95 ring-1 duration-500"
									: next
										? "bg-muted/50 text-foreground/80 ring-foreground/25 ring-1 ring-inset"
										: "bg-muted/50 text-muted-foreground ring-border ring-1 ring-inset",
							)}
						>
							<span className="text-muted-foreground max-w-full truncate text-[10px] font-medium tracking-wide uppercase sm:text-[11px]">{h.label}</span>
							{open ? (
								hintValue(h.key, target)
							) : (
								<span className="flex max-w-full items-center gap-1 text-[11px] sm:text-xs">
									<Lock className="size-3 shrink-0" aria-hidden />
									<span className="truncate">After guess {after}</span>
								</span>
							)}
							<span className="sr-only">{open ? `${h.label}: ${text}` : `${h.label}: locked, unlocks after wrong guess ${after}`}</span>
						</div>
					);
				})}
			</div>
		</section>
	);
}

/* -------------------------------------------------------------- guesses --- */

const VERDICT_ICON: Record<Verdict, typeof Check> = { match: Check, close: Users, miss: X };

function Guesses({ results, teamNames }: { results: GuessResult[]; teamNames: Map<string, string> }) {
	if (!results.length) return null;
	return (
		<section className="space-y-3" aria-label="Your guesses">
			<h2 className="text-sm font-medium">Your guesses</h2>
			<ol className="space-y-1.5">
				{results.map((r, i) => {
					const Icon = VERDICT_ICON[r.verdict];
					const names = r.shared.map((t) => teamNames.get(t) ?? t);
					const label = r.verdict === "match" ? "Correct" : r.verdict === "close" ? "Shared team" : "No shared team";
					const hint = r.verdict === "match" ? "The mystery driver" : r.verdict === "close" ? `Both drove for ${names.join(", ")}` : "Never drove for the same team";
					return (
						<li key={r.guess.id} className="animate-in fade-in-0 slide-in-from-top-1 flex min-h-10 items-center gap-2.5 text-sm duration-300">
							<span className="text-muted-foreground w-4 shrink-0 text-xs tabular-nums">{i + 1}</span>
							<Flag code={r.guess.flag} />
							<ULink href={href.driver(r.guess.id)} data-card={`driver:${r.guess.id}`} className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline">
								{r.guess.name}
							</ULink>
							<Hint label={hint}>
								<span className={cn("inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium whitespace-nowrap", VERDICT_STYLE[r.verdict])}>
									<Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
									{label}
									<span className="sr-only">: {hint}</span>
								</span>
							</Hint>
						</li>
					);
				})}
			</ol>
		</section>
	);
}

/* --------------------------------------------------------------- reveal --- */

function Reveal({ target: d }: { target: CareerDriver }) {
	return (
		<>
			<div className="flex items-center gap-3">
				<Flag code={d.flag} className="text-3xl" />
				<div className="min-w-0">
					<ULink href={href.driver(d.id)} data-card={`driver:${d.id}`} className="block truncate text-2xl font-semibold tracking-tight underline-offset-4 hover:underline">
						{d.name}
					</ULink>
					<div className="text-muted-foreground text-sm">
						{d.nation} · {span(d.first, d.last)} · {d.stints.length} team stints
					</div>
				</div>
			</div>
			<Figures
				items={[
					["Starts", d.starts],
					["Wins", d.wins],
					["Podiums", d.podiums],
					["Titles", d.titles],
				]}
			/>
		</>
	);
}
