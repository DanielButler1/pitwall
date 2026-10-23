// "Higher or lower" state, as the website keeps it: the day's ten rounds (answers saved), or an
// endless run until the first miss (best streak saved). A reveal holds for a moment before the
// next round comes in.

import { useEffect, useMemo, useState } from "react";
import { gameStore, type GameMode, type GameStats } from "@pitwall/core/game/daily";
import { DAILY_ROUNDS, dailyRounds, endlessKind, isCorrect, nextRound, recordResult, score, type Choice, type Round } from "@pitwall/core/game/higher-lower";
import type { HigherLowerData } from "../data";

const store = gameStore("higher-lower");
const readStats = () => store.readStats("stats", DAILY_ROUNDS + 1);
/** How long a reveal shows before the challenger moves across. */
export const REVEAL_MS = 1500;

/** Saves are read once: key the component on `today` so a new day starts afresh. */
export function useHigherLower(data: HigherLowerData, today: number) {
	const [mode, setModeState] = useState<GameMode>("daily");
	const [daily, setDaily] = useState<Choice[]>(() => store.readDaily<{ answers: Choice[] }>("daily", today)?.answers ?? []);
	const [stats, setStats] = useState<GameStats>(readStats);
	const [best, setBest] = useState(() => store.read<number>("best", 0));
	const [endless, setEndless] = useState<{ rounds: Round[]; answers: Choice[] } | null>(null);
	const [revealing, setRevealing] = useState<number | null>(null);

	const dailyRun = useMemo(() => dailyRounds(data.entities, today), [data, today]);

	const freshEndless = () => setEndless({ rounds: [nextRound(data.entities, [], endlessKind([], Math.random), Math.random)], answers: [] });

	const setMode = (m: GameMode) => {
		setModeState(m);
		setRevealing(null);
		if (m === "practice" && !endless) freshEndless();
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

	useEffect(() => {
		if (revealing == null) return;
		const t = setTimeout(() => setRevealing(null), REVEAL_MS);
		return () => clearTimeout(t);
	}, [revealing]);

	/** Answers the current round; returns whether it was right (null if it couldn't be answered now). */
	const answer = (choice: Choice): boolean | null => {
		if (!rounds || revealing != null || finished) return null;
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
		return correct;
	};

	const playEndless = () => {
		setModeState("practice");
		setRevealing(null);
		freshEndless();
	};

	return { mode, setMode, rounds, answers, marks, points, streak, best, over, at, round, revealing, stats, answer, playEndless };
}
