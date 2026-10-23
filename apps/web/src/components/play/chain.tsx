"use client";

// Daily "Teammate chain" game (/play/chain). The team-mate graph is a static file
// (public/data/chain.json); the day's pair, par, the rules and the share text come from
// lib/game/chain. A game is the list of actions taken (picks, undo, hint, give up), replayed
// on load, so the daily save stays tiny. Shared game chrome: ./kit.

import { createContext, Fragment, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dices, Flag as FlagIcon, Lightbulb, Link2, Undo2, X } from "lucide-react";
import { gameStore, type GameMode } from "@pitwall/core/game/daily";
import {
	BUCKETS,
	bucketLabel,
	bottomEnd,
	canHint,
	classify,
	dailyPair,
	DIFFICULTIES,
	driverWeight,
	emptyStats,
	fullChain,
	GIVE_UP,
	groupStints,
	HINT,
	linkCount,
	linkLabel,
	linkOf,
	MAX_STRIKES,
	overPar,
	pairOf,
	puzzleNumber,
	randomPair,
	recordResult,
	replay,
	scoreBucket,
	shareText,
	shortestChain,
	step,
	strikesUsed,
	topEnd,
	UNDO,
	unpack,
	type ChainDriver,
	type ChainState,
	type ChainStats,
	type Difficulty,
	type Graph,
	type HintInfo,
	type Pair,
	type Stint,
	type Strike,
} from "@pitwall/core/game/chain";
import { cn } from "@/lib/utils";
import { Flag, href, Page } from "../f1";
import { ULink } from "../universe-link";
import { Button } from "../ui/button";
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

const loadData = jsonLoader("/data/chain.json", unpack);

/** A game in progress: the pair (by driver id) and every action taken. */
type Saved = { a: string; b: string; actions: string[] };

const store = gameStore("chain");
const readStats = (difficulty: Difficulty) => store.readStats(`stats:${difficulty}`, BUCKETS);
const span = (d: ChainDriver) => (d.first === d.last ? String(d.first) : `${d.first}–${d.last}`);
const savedOf = (g: Graph, p: Pair, actions: string[] = []): Saved => ({ a: g.drivers[p.a].id, b: g.drivers[p.b].id, actions });

export function ChainGame() {
	const { data: g, error, retry } = useGameData(loadData);
	const { today, rollover } = useToday();
	const [difficulty, setDifficultyState] = useState<Difficulty>("classic");
	const [mode, setMode] = useState<GameMode>("daily");
	const [daily, setDaily] = useState<Saved | null>(null);
	const [stats, setStats] = useState<ChainStats>(emptyStats);
	const [practice, setPractice] = useState<Saved | null>(null);
	const [statsOpen, setStatsOpen] = useState(false);
	const [announce, setAnnounce] = useState("");

	useEffect(() => setDifficultyState(store.read<Difficulty>("difficulty", "classic") === "hard" ? "hard" : "classic"), []);

	// the day's saved progress and stats for this difficulty
	useEffect(() => {
		if (today == null) return;
		setDaily(store.readDaily<Saved>(`daily:${difficulty}`, today));
		setStats(readStats(difficulty));
	}, [today, difficulty]);

	const setDifficulty = (d: Difficulty) => {
		setDifficultyState(d);
		store.write("difficulty", d);
		setPractice(null);
	};

	// today's game: the saved pair if there is one (so a data update mid-day can't swap it), else the day's pick
	const game = useMemo((): Saved | null => {
		if (!g || today == null) return null;
		if (mode === "practice") return practice;
		const saved = daily && pairOf(g, daily.a, daily.b) ? daily : null;
		return saved ?? savedOf(g, dailyPair(g, difficulty, today));
	}, [g, today, mode, practice, daily, difficulty]);

	useEffect(() => {
		if (g && mode === "practice" && !practice) setPractice(savedOf(g, randomPair(g, difficulty)));
	}, [g, mode, practice, difficulty]);

	const state = useMemo(() => {
		if (!g || !game) return null;
		const pair = pairOf(g, game.a, game.b);
		return pair ? replay(g, pair, game.actions) : null;
	}, [g, game]);

	const items = useMemo(() => g?.drivers.map((d) => ({ id: d.id, label: d.name, sublabel: span(d), weight: driverWeight(d), driver: d })) ?? [], [g]);
	// never offered: drivers in the chain, and those already ruled out against the current ends
	const exclude = useMemo(() => {
		if (!g || !state) return [];
		const t = topEnd(state);
		const b = bottomEnd(state);
		return [...state.top, ...state.bottom, ...state.strikes.filter((s) => s.top === t && s.bottom === b).map((s) => s.driver)].map((i) => g.drivers[i].id);
	}, [g, state]);

	const act = (action: string) => {
		if (!g || !game || !state || today == null) return;
		const next = step(g, state, action);
		if (next === state) return;
		describe(g, state, next, action, setAnnounce);
		const saved = { ...game, actions: [...game.actions, action] };
		if (mode === "practice") {
			setPractice(saved);
			return;
		}
		setDaily(saved);
		store.writeDaily(`daily:${difficulty}`, today, saved);
		if (next.over) {
			const s = recordResult(readStats(difficulty), today, next);
			store.write(`stats:${difficulty}`, s);
			setStats(s);
		}
	};

	const pick = (d: ChainDriver) => {
		if (!g || !state) return;
		if (classify(g, state, d.i) === "repeat") toast.info(`${d.name} is already in the chain or ruled out here`);
		else act(d.id);
	};

	const share = () => {
		if (!g || !state || today == null) return;
		const diff = difficulty === "hard" ? " (Hard)" : "";
		const label = mode === "daily" ? `#${puzzleNumber(today)}${diff}` : `practice${diff}`;
		shareResult(shareText(g, state, { label, url: `${location.origin}/play/chain` }), { description: "Paste it anywhere: it shows the two ends, never the drivers in between." });
	};

	const newPractice = () => g && setPractice(savedOf(g, randomPair(g, difficulty, Math.random, state?.pair.id)));
	const level = DIFFICULTIES.find((d) => d.id === difficulty)!;
	const ready = g && state && today != null;
	return (
		<Page className="max-w-5xl space-y-8">
			<GameHeader
				title="Teammate chain"
				today={today}
				mode={mode}
				onModeChange={setMode}
				controls={<ChoiceToggle value={difficulty} options={DIFFICULTIES} onChange={setDifficulty} />}
				onStats={() => setStatsOpen(true)}
			>
				Link the two drivers through team-mates (entered for the same constructor in the same race) in as few links as you can. Name a team-mate of
				either end and the chain grows from both sides until they meet. A wrong pick or a hint costs one of your {MAX_STRIKES} strikes; undo is free.{" "}
				{level.description}. A new pair every day at midnight UTC.
			</GameHeader>

			{error ? (
				<GameError what="the team-mate chains" onRetry={retry} />
			) : !ready ? (
				<GameLoading />
			) : (
				<div className="space-y-6">
					{state.over && (
						<ResultCard
							won={state.solved}
							status={statusLine(state)}
							mode={mode}
							nextLabel={mode === "practice" ? "Next practice pair" : "Practice with a random pair"}
							countdownLabel="Next pair in"
							onShare={share}
							onStats={() => setStatsOpen(true)}
							onNext={() => {
								setMode("practice");
								newPractice();
							}}
							onRollover={rollover}
						>
							<Reveal g={g} state={state} />
						</ResultCard>
					)}
					{!state.over && <Controls state={state} mode={mode} onAct={act} onNewPair={newPractice} />}
					<Board g={g} state={state} items={items} exclude={exclude} onPick={pick} />
					<p className="sr-only" aria-live="polite">
						{announce}
					</p>
					<div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2 text-xs">
						<LegendItem verdict="match" icon={Link2}>
							Team-mates: the link shows the team and seasons
						</LegendItem>
						<LegendItem verdict="miss" icon={X}>
							Never team-mates: a strike
						</LegendItem>
						<LegendItem verdict="close" icon={Lightbulb}>
							Hint: a team on a shortest route, for a strike
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
				distributionTitle="Links over par"
				distributionLabel="Wins by links over par"
				bucketLabel={bucketLabel}
				bucketSrLabel={(i) => `wins at ${i === 0 ? "par" : `${bucketLabel(i)} over par`}`}
				labelClassName="w-8"
				highlight={mode === "daily" && state?.solved ? scoreBucket(state) : null}
			/>
		</Page>
	);
}

function statusLine(s: ChainState): string {
	if (!s.solved) return s.gaveUp ? "You gave up. One shortest chain:" : "Out of strikes. One shortest chain:";
	const score = `Par ${s.pair.par} · You ${linkCount(s)}`;
	return overPar(s) === 0 ? `Connected! ${score}, a perfect chain.` : `Connected! ${score}.`;
}

/** Screen-reader news of what an action just did. */
function describe(g: Graph, before: ChainState, after: ChainState, action: string, say: (text: string) => void) {
	const name = (i: number) => g.drivers[i].name;
	if (action === UNDO) return say("Last link taken back.");
	if (action === GIVE_UP) return say("You gave up.");
	if (action === HINT && after.hint) return say(`Hint: a ${teamsText(g, after.hint.stints)} team-mate of ${name(after.hint.from)}.`);
	if (after.strikes.length > before.strikes.length) {
		const x = after.strikes[after.strikes.length - 1];
		return say(`${name(x.driver)} was never team-mates with ${name(x.top)} or ${name(x.bottom)}. Strike ${strikesUsed(after)} of ${MAX_STRIKES}.`);
	}
	const end = after.placed[after.placed.length - 1];
	const list = after[end];
	const added = list[list.length - 1];
	say(`${name(added)} added: ${linkLabel(g, linkOf(g, list[list.length - 2], added)!)}.${after.solved ? " Chain connected!" : ""}`);
}

const teamsText = (g: Graph, stints: Stint[]) => groupStints(stints).map((t) => g.teams[t.team]?.name).join(" / ");

/* ------------------------------------------------------------- controls --- */

function Controls({ state, mode, onAct, onNewPair }: { state: ChainState; mode: GameMode; onAct: (a: string) => void; onNewPair: () => void }) {
	const used = strikesUsed(state);
	return (
		<div className="flex max-w-2xl flex-wrap items-center justify-between gap-x-4 gap-y-3">
			<div className="flex items-center gap-4 text-sm">
				<span>
					<span className="text-muted-foreground">Par</span> <span className="font-semibold tabular-nums">{state.pair.par}</span>
				</span>
				<span>
					<span className="text-muted-foreground">Links</span> <span className="font-semibold tabular-nums">{linkCount(state)}</span>
				</span>
				<span className="flex items-center gap-1.5" aria-label={`${used} of ${MAX_STRIKES} strikes used`} role="img">
					<span className="text-muted-foreground">Strikes</span>
					{Array.from({ length: MAX_STRIKES }, (_, i) => (
						<span
							key={i}
							className={cn(
								"inline-flex size-4 items-center justify-center rounded-full",
								i < used ? "bg-destructive text-white" : "ring-border ring-1 ring-inset",
							)}
						>
							{i < used && <X className="size-2.5" strokeWidth={3} />}
						</span>
					))}
				</span>
			</div>
			<div className="flex flex-wrap items-center gap-1.5">
				<Button variant="outline" size="sm" className="pointer-coarse:min-h-10" disabled={!state.placed.length} onClick={() => onAct(UNDO)}>
					<Undo2 data-icon="inline-start" />
					Undo
				</Button>
				<Button variant="outline" size="sm" className="pointer-coarse:min-h-10" disabled={!canHint(state)} onClick={() => onAct(HINT)}>
					<Lightbulb data-icon="inline-start" />
					Hint
				</Button>
				{mode === "practice" ? (
					<Button variant="ghost" size="sm" className="pointer-coarse:min-h-10" onClick={onNewPair}>
						<Dices data-icon="inline-start" />
						New pair
					</Button>
				) : (
					<Button variant="ghost" size="sm" className="pointer-coarse:min-h-10" onClick={() => onAct(GIVE_UP)}>
						<FlagIcon data-icon="inline-start" />
						Give up
					</Button>
				)}
			</div>
		</div>
	);
}

/* ---------------------------------------------------------------- board --- */

type Item =
	| { kind: "driver"; i: number; role: "a" | "b" | "link" }
	| { kind: "link"; stints: Stint[] }
	| { kind: "gap"; content: React.ReactNode };

/** Drivers top to bottom with the links between them: `items` alternate drivers and links/gaps. */
function ChainList({ g, items, compact, label }: { g: Graph; items: Item[]; compact?: boolean; label: string }) {
	return (
		<ol className="min-w-0" aria-label={label}>
			{items.map((item, k) => {
				const above = items[k - 1]?.kind;
				const below = items[k + 1]?.kind;
				if (item.kind === "driver") return <DriverRow key={`d${item.i}`} d={g.drivers[item.i]} role={item.role} above={above} below={below} compact={compact} />;
				if (item.kind === "link") return <LinkRow key={`l${k}`} g={g} stints={item.stints} compact={compact} />;
				return <GapRow key="gap">{item.content}</GapRow>;
			})}
		</ol>
	);
}

/**
 * Whether names link to their pages with hover cards. Off on the board while the game is on:
 * a driver card lists their teams and a team card its drivers, which would give links away.
 */
const Linked = createContext(true);

/** The left column holding the line and the nodes. */
const RAIL = "grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2.5 sm:gap-x-3";
const LINE = { link: "bg-emerald-600/60 dark:bg-emerald-500/50", gap: "border-border border-l-2 border-dashed" } as const;

function railHalf(kind: Item["kind"] | undefined) {
	if (kind === "link") return cn("w-0.5", LINE.link);
	if (kind === "gap") return cn("w-0", LINE.gap);
	return "w-0.5 bg-transparent";
}

function DriverRow({ d, role, above, below, compact }: { d: ChainDriver; role: "a" | "b" | "link"; above?: Item["kind"]; below?: Item["kind"]; compact?: boolean }) {
	const end = role !== "link";
	const linked = useContext(Linked);
	const nameClass = cn("min-w-0 truncate", end ? "font-semibold" : "font-medium");
	return (
		<li className={cn(RAIL, "animate-in fade-in-0 slide-in-from-top-1 duration-300")}>
			<div className="relative flex flex-col items-center" aria-hidden>
				<span className={cn("flex-1", railHalf(above))} />
				<span
					className={cn(
						"flex shrink-0 items-center justify-center rounded-full font-semibold",
						compact ? "size-6 text-[11px]" : "size-8 text-xs",
						end ? "bg-foreground text-background" : VERDICT_STYLE.match,
					)}
				>
					{end ? role.toUpperCase() : <Link2 className={compact ? "size-3" : "size-3.5"} strokeWidth={2.5} />}
				</span>
				<span className={cn("flex-1", railHalf(below))} />
			</div>
			<div
				className={cn(
					"bg-card flex min-w-0 items-center gap-2.5 rounded-xl ring-1",
					compact ? "my-0.5 px-2.5 py-1.5 text-sm" : "my-1 px-3 py-2.5 text-sm sm:text-base",
					end ? "ring-foreground/20" : "ring-foreground/10",
				)}
			>
				<Flag code={d.flag} />
				{linked ? (
					<ULink href={href.driver(d.id)} data-card={`driver:${d.id}`} className={cn(nameClass, "underline-offset-4 hover:underline")}>
						{d.name}
					</ULink>
				) : (
					<span className={nameClass}>{d.name}</span>
				)}
				<span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">{span(d)}</span>
				{end && <span className="sr-only">{role === "a" ? "(start)" : "(finish)"}</span>}
			</div>
		</li>
	);
}

function LinkRow({ g, stints, compact }: { g: Graph; stints: Stint[]; compact?: boolean }) {
	return (
		<li className={RAIL}>
			<div className="flex justify-center" aria-hidden>
				<span className={cn("w-0.5", LINE.link)} />
			</div>
			<div className={cn("text-muted-foreground flex min-w-0 items-center text-xs", compact ? "min-h-5 py-0.5" : "min-h-8 py-1")}>
				<TeamsLabel g={g} stints={stints} />
			</div>
		</li>
	);
}

/** "McLaren, 1988–1989 · Williams, 1993", with the teams linked (hover cards) once the game is over. */
function TeamsLabel({ g, stints }: { g: Graph; stints: Stint[] }) {
	const linked = useContext(Linked);
	return (
		<span className="min-w-0">
			<span className="sr-only">Team-mates at </span>
			{groupStints(stints).map((t, k) => {
				const team = g.teams[t.team];
				return (
					<Fragment key={t.team}>
						{k > 0 && <span aria-hidden> · </span>}
						<span className="whitespace-nowrap">
							{linked ? (
								<ULink href={href.team(team.id)} data-card={`team:${team.id}`} className="text-foreground/80 font-medium underline-offset-4 hover:underline">
									{team.name}
								</ULink>
							) : (
								<span className="text-foreground/80 font-medium">{team.name}</span>
							)}
							, <span className="tabular-nums">{t.ranges.join(", ")}</span>
						</span>
					</Fragment>
				);
			})}
		</span>
	);
}

function GapRow({ children }: { children: React.ReactNode }) {
	return (
		<li className={RAIL}>
			<div className="flex justify-center" aria-hidden>
				<span className={LINE.gap} />
			</div>
			<div className="py-2">{children}</div>
		</li>
	);
}

function Board({
	g,
	state,
	items: pickerItems,
	exclude,
	onPick,
}: {
	g: Graph;
	state: ChainState;
	items: { id: string; label: string; sublabel: string; weight: number; driver: ChainDriver }[];
	exclude: string[];
	onPick: (d: ChainDriver) => void;
}) {
	const items: Item[] = [];
	const push = (list: number[], from: "a" | "b") =>
		list.forEach((i, k) => {
			if (k > 0) items.push({ kind: "link", stints: linkOf(g, list[k - 1], i)! });
			items.push({ kind: "driver", i, role: k === 0 ? from : "link" });
		});
	push(state.top, "a");
	if (state.solved) items.push({ kind: "link", stints: linkOf(g, topEnd(state), bottomEnd(state))! });
	else
		items.push({
			kind: "gap",
			content: <Gap g={g} state={state} items={pickerItems} exclude={exclude} onPick={onPick} />,
		});
	const bottom: Item[] = [];
	state.bottom.forEach((i, k) => {
		bottom.unshift({ kind: "driver", i, role: k === 0 ? "b" : "link" });
		if (k < state.bottom.length - 1) bottom.unshift({ kind: "link", stints: linkOf(g, i, state.bottom[k + 1])! });
	});
	items.push(...bottom);
	return (
		<div className="max-w-2xl space-y-4">
			{state.over && <div className="text-sm font-medium">Your chain</div>}
			<Linked value={state.over}>
				<ChainList g={g} items={items} label="Your chain" />
			</Linked>
			{state.solved && state.strikes.length > 0 && (
				<div className="space-y-1.5">
					<div className="text-muted-foreground text-xs font-medium">Wrong picks</div>
					<Strikes g={g} strikes={state.strikes} />
				</div>
			)}
		</div>
	);
}

function Gap({
	g,
	state,
	items,
	exclude,
	onPick,
}: {
	g: Graph;
	state: ChainState;
	items: { id: string; label: string; sublabel: string; weight: number; driver: ChainDriver }[];
	exclude: string[];
	onPick: (d: ChainDriver) => void;
}) {
	const t = g.drivers[topEnd(state)];
	const b = g.drivers[bottomEnd(state)];
	return (
		<div className="border-border space-y-3 rounded-xl border border-dashed p-3 sm:p-4">
			{state.over ? (
				<div className="text-muted-foreground text-sm">Not connected.</div>
			) : (
				<>
					<div className="text-muted-foreground text-xs sm:text-sm">
						Name a team-mate of <span className="text-foreground font-medium">{t.name}</span> or <span className="text-foreground font-medium">{b.name}</span>
					</div>
					<EntityPicker items={items} exclude={exclude} onPick={(i) => onPick(i.driver)} label={`A team-mate of ${t.name} or ${b.name}`} placeholder="Type a driver's name…" noun="drivers" />
					{state.hint && <HintCallout g={g} hint={state.hint} />}
				</>
			)}
			{state.strikes.length > 0 && <Strikes g={g} strikes={[...state.strikes].reverse()} />}
		</div>
	);
}

function HintCallout({ g, hint }: { g: Graph; hint: HintInfo }) {
	return (
		<div className="animate-in fade-in-0 flex items-start gap-2.5 text-sm">
			<span className={cn("mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded", VERDICT_STYLE.close)}>
				<Lightbulb className="size-3" strokeWidth={2.5} />
			</span>
			<span className="min-w-0">
				Hint: try a team-mate of <span className="font-medium">{g.drivers[hint.from].name}</span> at <TeamsLabel g={g} stints={hint.stints} />
			</span>
		</div>
	);
}

function Strikes({ g, strikes }: { g: Graph; strikes: Strike[] }) {
	return (
		<ul className="space-y-1" aria-label="Wrong picks">
			{strikes.map((s, k) => {
				const d = g.drivers[s.driver];
				const ends = s.top === s.bottom ? g.drivers[s.top].lastName : `${g.drivers[s.top].lastName} or ${g.drivers[s.bottom].lastName}`;
				return (
					<li key={`${s.driver}-${k}`} className="animate-in fade-in-0 flex min-w-0 items-center gap-2 text-sm opacity-70">
						<span className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded", VERDICT_STYLE.miss)}>
							<X className="size-3" strokeWidth={2.5} />
						</span>
						<Flag code={d.flag} />
						<span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
							<span className="font-medium line-through decoration-1">{d.name}</span>
							<span className="text-muted-foreground text-xs">never team-mates with {ends}</span>
						</span>
					</li>
				);
			})}
		</ul>
	);
}

/* --------------------------------------------------------------- reveal --- */

function Reveal({ g, state }: { g: Graph; state: ChainState }) {
	const best = useMemo(() => shortestChain(g, state.pair.a, state.pair.b) ?? [], [g, state.pair]);
	const mine = fullChain(state);
	const same = state.solved && mine.length === best.length && mine.every((x, k) => x === best[k]);
	const items: Item[] = best.flatMap((i, k): Item[] => [
		...(k > 0 ? [{ kind: "link", stints: linkOf(g, best[k - 1], i)! } as const] : []),
		{ kind: "driver", i, role: k === 0 ? "a" : k === best.length - 1 ? "b" : "link" },
	]);
	return (
		<>
			<Figures
				items={[
					["Par", state.pair.par],
					...(state.solved ? ([["Your links", linkCount(state)]] as [string, number][]) : []),
					["Strikes", state.strikes.length],
					["Hints", state.hints.length],
				]}
			/>
			{same ? (
				<div className="text-muted-foreground text-sm">Your chain is a shortest one: nothing to improve.</div>
			) : (
				<div className="space-y-2">
					<div className="text-muted-foreground text-xs font-medium">{state.solved ? `A shortest chain (${best.length - 1} links)` : `${best.length - 1} links`}</div>
					<ChainList g={g} items={items} compact label="A shortest chain" />
				</div>
			)}
		</>
	);
}
