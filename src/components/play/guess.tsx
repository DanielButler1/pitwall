"use client";

// Daily "Guess the driver" game (/play/guess). The driver list is a static file
// (public/data/guess.json); the day's mystery driver, the comparisons and the share text
// come from lib/game/guess. Progress and stats live in localStorage, per difficulty. The
// shared game chrome (header, picker, tiles, result card, stats) is ./kit.

import { useEffect, useMemo, useState } from "react";
import { Dices, Globe, Users } from "lucide-react";
import { gameStore, type GameMode } from "@/lib/game/daily";
import {
	ATTRIBUTES,
	compare,
	dailyTarget,
	DIFFICULTIES,
	driverWeight,
	emptyStats,
	MAX_GUESSES,
	puzzleNumber,
	randomTarget,
	recordResult,
	shareText,
	unpack,
	type Comparison,
	type Difficulty,
	type GuessDriver,
	type GuessFile,
	type GuessStats,
	type Tile,
} from "@/lib/game/guess";
import { cn } from "@/lib/utils";
import { Flag, href, num, Page } from "../f1";
import { ULink } from "../universe-link";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import {
	ChoiceToggle,
	ClueTile,
	EntityPicker,
	Figures,
	GameError,
	GameHeader,
	GameLoading,
	jsonLoader,
	Legend,
	ResultCard,
	shareResult,
	StatsDialog,
	useGameData,
	useToday,
	verdictIcon,
} from "./kit";

type Data = { drivers: GuessDriver[]; byId: Map<string, GuessDriver>; teams: Record<string, string> };

const loadData = jsonLoader("/data/guess.json", (f: GuessFile): Data => {
	const drivers = f.drivers.map(unpack);
	return { drivers, byId: new Map(drivers.map((d) => [d.id, d])), teams: f.teams };
});

const store = gameStore("guess");
const readStats = (difficulty: Difficulty) => store.readStats(`stats:${difficulty}`, MAX_GUESSES);
const span = (d: GuessDriver) => (d.first === d.last ? d.first : `${d.first}–${d.last}`);

export function GuessGame() {
	const { data, error, retry } = useGameData(loadData);
	const { today, rollover } = useToday();
	const [difficulty, setDifficultyState] = useState<Difficulty>("modern");
	const [mode, setMode] = useState<GameMode>("daily");
	const [daily, setDaily] = useState<string[]>([]);
	const [stats, setStats] = useState<GuessStats>(emptyStats);
	const [practice, setPractice] = useState<{ target: string; guesses: string[] } | null>(null);
	const [statsOpen, setStatsOpen] = useState(false);

	useEffect(() => setDifficultyState(store.read<Difficulty>("difficulty", "modern") === "all" ? "all" : "modern"), []);

	// the day's saved progress and stats for this difficulty
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

	// a practice driver whenever practice starts without one
	useEffect(() => {
		if (data && mode === "practice" && !practice) setPractice({ target: randomTarget(data.drivers, difficulty).id, guesses: [] });
	}, [data, mode, practice, difficulty]);

	const items = useMemo(() => data?.drivers.map((d) => ({ id: d.id, label: d.name, sublabel: span(d), weight: driverWeight(d), driver: d })) ?? [], [data]);
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
		store.writeDaily(`daily:${difficulty}`, today, { guesses: next });
		const done = d.id === target.id || next.length >= MAX_GUESSES;
		if (done) {
			const s = recordResult(readStats(difficulty), today, d.id === target.id, next.length);
			store.write(`stats:${difficulty}`, s);
			setStats(s);
		}
	};

	const share = () => {
		if (today == null) return;
		const diff = difficulty === "all" ? " (All time)" : "";
		const label = mode === "daily" ? `#${puzzleNumber(today)}${diff}` : `practice${diff}`;
		shareResult(shareText({ rows, won, label, url: `${location.origin}/play/guess` }));
	};

	const newPractice = (exclude: string) => setPractice({ target: randomTarget(data!.drivers, difficulty, Math.random, exclude).id, guesses: [] });
	const level = DIFFICULTIES.find((d) => d.id === difficulty)!;
	const ready = data && target && today != null;
	return (
		<Page className="max-w-5xl space-y-8">
			<GameHeader
				title="Guess the driver"
				today={today}
				mode={mode}
				onModeChange={setMode}
				controls={<ChoiceToggle value={difficulty} options={DIFFICULTIES} onChange={setDifficulty} />}
				onStats={() => setStatsOpen(true)}
			>
				A new mystery driver every day at midnight UTC, the same for everyone. You have {MAX_GUESSES} guesses: each one shows how close it was on
				nationality, career span, teams and results. {level.description}.
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
							status={won ? (rows.length === 1 ? "First time! Got it in 1." : `Got it in ${rows.length} of ${MAX_GUESSES}.`) : "Out of guesses. The mystery driver was"}
							mode={mode}
							nextLabel={mode === "practice" ? "Next practice driver" : "Practice with a random driver"}
							countdownLabel="Next driver in"
							onShare={share}
							onStats={() => setStatsOpen(true)}
							onNext={() => {
								setMode("practice");
								newPractice(target.id);
							}}
							onRollover={rollover}
						>
							<Reveal target={target} teams={data.teams} />
						</ResultCard>
					) : (
						<div className="space-y-2">
							<EntityPicker items={items} exclude={guesses} onPick={(i) => guess(i.driver)} label="Guess a driver" placeholder="Type a driver's name…" noun="drivers" />
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
										New driver
									</Button>
								)}
							</div>
						</div>
					)}
					<Board rows={rows} teams={data.teams} />
					<Legend
						close="Close: same continent, a team in common, or within 5 seasons, 25 starts or 5 wins"
						direction="The mystery driver's number is higher (double arrow: by a lot)"
					/>
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
	return (
		<ClueTile
			verdict={tile.verdict}
			icon={verdictIcon(tile.verdict, tile.direction, tile.key === "nation" ? Globe : Users)}
			hint={hint}
			srText={`${attr.label} ${text}: ${tile.verdict}${tile.direction ? `, mystery driver's is ${tile.direction}` : ""}`}
			delay={delay}
		>
			{value}
		</ClueTile>
	);
}

/* --------------------------------------------------------------- reveal --- */

function Reveal({ target: d, teams }: { target: GuessDriver; teams: Record<string, string> }) {
	return (
		<>
			<div className="flex items-center gap-3">
				<Flag code={d.flag} className="text-3xl" />
				<div className="min-w-0">
					<ULink href={href.driver(d.id)} data-card={`driver:${d.id}`} className="block truncate text-2xl font-semibold tracking-tight underline-offset-4 hover:underline">
						{d.name}
					</ULink>
					<div className="text-muted-foreground text-sm">
						{d.nation} · {span(d)}
					</div>
				</div>
			</div>
			<div className="text-muted-foreground text-sm">{d.teams.map((t) => teams[t] ?? t).join(", ")}</div>
			<Figures
				items={[
					["Starts", d.starts],
					["Wins", d.wins],
					["Podiums", d.podiums],
					["Poles", d.poles],
					["Titles", d.titles],
				]}
			/>
		</>
	);
}
