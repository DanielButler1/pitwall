// "Name the grid" state, as the website keeps it: who's been named, when the clock started and
// the time used once it's over. The clock starts on the first keystroke and keeps running across
// restarts of the app (the start time is saved).

import { useEffect, useMemo, useRef, useState } from "react";
import { gameStore, recordResult, type GameMode } from "@pitwall/core/game/daily";
import { dailyGrid, isWin, matcher, matchHint, matchName, PERCENT_BUCKETS, RACE_TIME, raceSlots, randomGrid, resultBucket, THEME_TIME, themeSlots, type Slot } from "@pitwall/core/game/name-grid";
import type { RaceData, RaceEntry, Theme } from "@pitwall/core/game/race-entries";

const store = gameStore("name-the-grid");
const readStats = () => store.readStats("stats", PERCENT_BUCKETS);

type Run = { named: string[]; start: number | null; used: number | null };
const EMPTY: Run = { named: [], start: null, used: null };
type Practice = { source: string; id: string; run: Run };
export type Puzzle = { key: string; slots: Slot[]; limit: number; race: RaceEntry | null; theme: Theme | null };

/** Saves are read once: key the component on `today` so a new day starts afresh. */
export function useNameGrid(data: RaceData, today: number) {
	const [mode, setModeState] = useState<GameMode>("daily");
	const [daily, setDaily] = useState<Run>(() => ({ ...EMPTY, ...store.readDaily<Run>("daily", today) }));
	const [stats, setStats] = useState(readStats);
	const [practice, setPractice] = useState<Practice | null>(null);
	const [source, setSource] = useState("race");
	const [query, setQuery] = useState("");
	const [now, setNow] = useState(() => Date.now());

	const newPractice = (from: string, exclude?: string) => {
		const id = from === "race" ? randomGrid(data.races, Math.random, exclude).id : from;
		setPractice({ source: from, id, run: EMPTY });
		setQuery("");
	};

	const puzzle = useMemo((): Puzzle | null => {
		if (mode === "daily") {
			const race = dailyGrid(data.races, today);
			return { key: `daily:${race.id}`, slots: raceSlots(race), limit: RACE_TIME, race, theme: null };
		}
		if (!practice) return null;
		if (practice.source === "race") {
			const race = data.byId.get(practice.id);
			return race ? { key: `race:${race.id}`, slots: raceSlots(race), limit: RACE_TIME, race, theme: null } : null;
		}
		const theme = data.themes.find((t) => t.id === practice.id);
		return theme ? { key: `theme:${theme.id}`, slots: themeSlots(theme), limit: THEME_TIME, race: null, theme } : null;
	}, [data, today, mode, practice]);

	const match = useMemo(() => (puzzle ? matcher(puzzle.slots) : null), [puzzle]);
	const run = mode === "daily" ? daily : (practice?.run ?? EMPTY);
	const namedIdx = useMemo(() => {
		const ids = new Set(run.named);
		return new Set(puzzle?.slots.flatMap((s, i) => (ids.has(s.driver.id) ? [i] : [])) ?? []);
	}, [run.named, puzzle]);
	const total = puzzle?.slots.length ?? 0;
	const over = run.used != null;

	const setRun = (next: Run) => {
		if (mode === "practice") {
			setPractice((p) => p && { ...p, run: next });
			return;
		}
		setDaily(next);
		store.writeDaily("daily", today, next);
		if (next.used != null) {
			const named = next.named.length;
			const s = recordResult(readStats(), today, isWin(named, total), resultBucket(named, total));
			store.write("stats", s);
			setStats(s);
		}
	};

	const finish = (used: number, from: Run = run) => {
		if (from.used != null) return;
		setRun({ ...from, start: from.start ?? Date.now(), used: Math.max(0, Math.min(used, puzzle?.limit ?? used)) });
		setQuery("");
	};

	// the clock: ticks while running and ends the game when time's up (also after a restart)
	const finishRef = useRef(finish);
	useEffect(() => {
		finishRef.current = finish;
	});
	useEffect(() => {
		if (!puzzle || run.start == null || run.used != null) return;
		const start = run.start;
		const tick = () => {
			const t = Date.now();
			setNow(t);
			if (t - start >= puzzle.limit) finishRef.current(puzzle.limit);
		};
		const first = setTimeout(tick, 0);
		const id = setInterval(tick, 250);
		return () => {
			clearTimeout(first);
			clearInterval(id);
		};
	}, [puzzle, run]);

	/** Names slot `index`; returns true when that completed the grid. */
	const name = (index: number, from: Run) => {
		const next = { ...from, named: [...from.named, puzzle!.slots[index].driver.id] };
		if (next.named.length >= total) next.used = Date.now() - (next.start ?? Date.now());
		setRun(next);
		setQuery("");
	};

	/** The text field changed: starts the clock, and names a driver as soon as the input is unambiguous. Returns true on a hit. */
	const type = (value: string): boolean => {
		if (over || !match) return false;
		let from = run;
		if (from.start == null && value.trim()) {
			from = { ...from, start: Date.now() };
			setNow(from.start!);
			setRun(from);
		}
		const res = matchName(match, value, namedIdx);
		if (res.kind === "hit" && !res.wait) {
			name(res.index, from);
			return true;
		}
		setQuery(value);
		return false;
	};

	/** Submit (the keyboard's done key): names a close or prefix match. */
	const enter = (): boolean => {
		if (over || !match) return false;
		const res = matchName(match, query, namedIdx);
		if (res.kind === "hit") {
			name(res.index, run);
			return true;
		}
		return false;
	};

	const feedback = useMemo(() => {
		if (!match || !query.trim() || !puzzle) return null;
		return matchHint(matchName(match, query, namedIdx), query, puzzle.slots);
	}, [match, query, namedIdx, puzzle]);

	const setMode = (m: GameMode) => {
		setModeState(m);
		setQuery("");
		if (m === "practice" && !practice) setPractice({ source: "race", id: randomGrid(data.races).id, run: EMPTY });
	};

	const changeSource = (s: string) => {
		setSource(s);
		newPractice(s, practice?.id);
	};

	const remaining = run.start == null ? (puzzle?.limit ?? RACE_TIME) : over ? (puzzle?.limit ?? 0) - run.used! : Math.max(0, (puzzle?.limit ?? 0) - (now - run.start));
	const giveUp = () => finish(run.start == null ? 0 : Date.now() - run.start);

	const next = () => {
		const wasDaily = mode === "daily";
		setModeState("practice");
		if (!wasDaily) newPractice(practice?.source ?? "race", practice?.id);
		else {
			setSource("race");
			newPractice("race", puzzle?.race?.id);
		}
	};

	return { mode, setMode, puzzle, run, namedIdx, total, over, query, type, enter, feedback, remaining, giveUp, stats, source, changeSource, practice, newPractice, next, named: run.named.length };
}
