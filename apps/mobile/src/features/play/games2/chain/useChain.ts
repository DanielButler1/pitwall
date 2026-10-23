// "Teammate chain" state, as the website keeps it: a game is its pair and the list of actions
// taken (picks, undo, hint, give up), replayed on load; daily saves and stats per difficulty.

import { useMemo, useState } from "react";
import { gameStore, type GameMode } from "@pitwall/core/game/daily";
import {
	BUCKETS,
	bottomEnd,
	dailyPair,
	pairOf,
	randomPair,
	recordResult,
	replay,
	step,
	topEnd,
	type ChainState,
	type ChainStats,
	type Difficulty,
	type Graph,
	type Pair,
} from "@pitwall/core/game/chain";

type Saved = { a: string; b: string; actions: string[] };

const store = gameStore("chain");
const readStats = (difficulty: Difficulty) => store.readStats(`stats:${difficulty}`, BUCKETS) as ChainStats;
const savedOf = (g: Graph, p: Pair, actions: string[] = []): Saved => ({ a: g.drivers[p.a].id, b: g.drivers[p.b].id, actions });

/** Saves are read once per difficulty: key the component on `today` so a new day starts afresh. */
export function useChain(g: Graph, today: number) {
	const [difficulty, setDifficultyState] = useState<Difficulty>(() => (store.read<Difficulty>("difficulty", "classic") === "hard" ? "hard" : "classic"));
	const [mode, setModeState] = useState<GameMode>("daily");
	const [daily, setDaily] = useState<Saved | null>(() => store.readDaily<Saved>(`daily:${difficulty}`, today));
	const [stats, setStats] = useState<ChainStats>(() => readStats(difficulty));
	const [practice, setPractice] = useState<Saved | null>(null);

	const setDifficulty = (d: Difficulty) => {
		setDifficultyState(d);
		store.write("difficulty", d);
		setDaily(store.readDaily<Saved>(`daily:${d}`, today));
		setStats(readStats(d));
		setPractice(mode === "practice" ? savedOf(g, randomPair(g, d)) : null);
	};

	const setMode = (m: GameMode) => {
		setModeState(m);
		if (m === "practice" && !practice) setPractice(savedOf(g, randomPair(g, difficulty)));
	};

	// the saved pair if there is one (a data update mid-day can't swap it), else the day's pick
	const game = useMemo((): Saved | null => {
		if (mode === "practice") return practice;
		const saved = daily && pairOf(g, daily.a, daily.b) ? daily : null;
		return saved ?? savedOf(g, dailyPair(g, difficulty, today));
	}, [g, today, mode, practice, daily, difficulty]);


	const state = useMemo((): ChainState | null => {
		if (!game) return null;
		const pair = pairOf(g, game.a, game.b);
		return pair ? replay(g, pair, game.actions) : null;
	}, [g, game]);

	// never offered: drivers in the chain, and those already ruled out against the current ends
	const exclude = useMemo(() => {
		if (!state) return new Set<string>();
		const t = topEnd(state);
		const b = bottomEnd(state);
		return new Set([...state.top, ...state.bottom, ...state.strikes.filter((s) => s.top === t && s.bottom === b).map((s) => s.driver)].map((i) => g.drivers[i].id));
	}, [g, state]);

	/** Applies an action; returns the state before and after, or null if nothing changed. */
	const act = (action: string): { before: ChainState; after: ChainState } | null => {
		if (!game || !state) return null;
		const next = step(g, state, action);
		if (next === state) return null;
		const saved = { ...game, actions: [...game.actions, action] };
		if (mode === "practice") setPractice(saved);
		else {
			setDaily(saved);
			store.writeDaily(`daily:${difficulty}`, today, saved);
			if (next.over) {
				const s = recordResult(readStats(difficulty), today, next);
				store.write(`stats:${difficulty}`, s);
				setStats(s);
			}
		}
		return { before: state, after: next };
	};

	const newPractice = () => {
		setModeState("practice");
		setPractice(savedOf(g, randomPair(g, difficulty, Math.random, state?.pair.id)));
	};

	return { difficulty, setDifficulty, mode, setMode, state, exclude, stats, act, newPractice };
}
