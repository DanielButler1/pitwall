// "Grid of nine" state: the day's board (or a practice one), guesses, give up, saves and stats,
// as the website's components/play/grid.tsx keeps them (same storage keys, so the logic is shared).

import { useCallback, useMemo, useState } from "react";
import { gameStore, type GameMode } from "@pitwall/core/game/daily";
import {
	CELLS,
	cellAnswers,
	dailyGrid,
	fits,
	generateGrid,
	gridFromIds,
	gridIds,
	playBoard,
	recordResult,
	type Attempt,
	type Board,
	type Grid,
	type GridData,
	type GridDriver,
	type GridStats,
} from "@pitwall/core/game/grid";

const store = gameStore("grid");
type DailyState = { cats: string[]; attempts: Attempt[]; gaveUp?: boolean };
type PracticeState = { grid: Grid; attempts: Attempt[]; gaveUp?: boolean };
export const readGridStats = () => store.readStats("stats", CELLS + 1) as GridStats;

/** Today's saved progress, on the board it was played on even if the data changed since. */
function readDaily(data: GridData, today: number): DailyState {
	const save = store.readDaily<DailyState>("daily", today);
	const saved = gridFromIds(data, save?.cats);
	const grid = saved ?? dailyGrid(data, today);
	return { cats: gridIds(data, grid), attempts: save && saved ? save.attempts : [], gaveUp: save?.gaveUp };
}

/** Saves are read once: key the component on `today` so a new day starts afresh. */
export function useGrid(data: GridData, today: number) {
	const [mode, setModeState] = useState<GameMode>("daily");
	const [daily, setDaily] = useState<DailyState>(() => readDaily(data, today));
	const [practice, setPractice] = useState<PracticeState | null>(null);
	const [stats, setStats] = useState<GridStats>(readGridStats);
	const [best, setBest] = useState<number | null>(() => store.read<number | null>("best", null));

	const setMode = (m: GameMode) => {
		setModeState(m);
		if (m === "practice" && !practice) setPractice({ grid: generateGrid(data, Math.random), attempts: [] });
	};

	const state = mode === "daily" ? daily : practice;
	const grid = useMemo(() => (state ? ("grid" in state ? state.grid : gridFromIds(data, state.cats)) : null), [data, state]);
	const answers = useMemo(() => (grid ? Array.from({ length: CELLS }, (_, i) => cellAnswers(data, grid, i)) : null), [data, grid]);
	const board = useMemo(() => (grid && answers && state ? playBoard(data, grid, state.attempts, answers) : null), [data, grid, answers, state]);
	const over = !!board && (board.over || !!state?.gaveUp);

	const finishDaily = useCallback(
		(b: Board) => {
			const s = recordResult(readGridStats(), today, b.filled);
			store.write("stats", s);
			setStats(s);
			const prev = store.read<number | null>("best", null);
			if (prev == null || b.rarity > prev) {
				store.write("best", b.rarity);
				setBest(b.rarity);
			}
		},
		[today],
	);

	/** Plays a guess; true if it filled the cell. */
	const guess = (cell: number, d: GridDriver): boolean | null => {
		if (!grid || !answers || !state || over) return null;
		const attempts: Attempt[] = [...state.attempts, [cell, d.id]];
		const next = playBoard(data, grid, attempts, answers);
		const ok = next.cells[cell]?.driver.id === d.id && !board?.cells[cell] && fits(data, grid, cell, d);
		if (mode === "practice") setPractice({ ...(state as PracticeState), attempts });
		else {
			const save = { cats: gridIds(data, grid), attempts };
			setDaily(save);
			store.writeDaily("daily", today, save);
			if (next.over) finishDaily(next);
		}
		return ok;
	};

	const giveUp = () => {
		if (!grid || !board || !state) return;
		if (mode === "practice") return setPractice({ ...(state as PracticeState), gaveUp: true });
		const save = { cats: gridIds(data, grid), attempts: state.attempts, gaveUp: true };
		setDaily(save);
		store.writeDaily("daily", today, save);
		finishDaily(board);
	};

	const newPractice = () => {
		setModeState("practice");
		setPractice({ grid: generateGrid(data, Math.random), attempts: [] });
	};

	return { mode, setMode, grid, answers, board, over, stats, best, guess, giveUp, newPractice };
}
