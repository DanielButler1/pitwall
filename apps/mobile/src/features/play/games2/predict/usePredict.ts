// "Race prediction" state, as the website keeps it: one attempt a day (the draft and the locked-in
// prediction are saved), or a random race in practice.

import { useMemo, useState } from "react";
import { gameStore, recordResult, type GameMode } from "@pitwall/core/game/daily";
import { dailyRace, isWin, PERCENT_BUCKETS, randomRace, resultBucket, score, SLOTS } from "@pitwall/core/game/predict";
import type { RaceData } from "@pitwall/core/game/race-entries";

const store = gameStore("predict");
const readStats = () => store.readStats("stats", PERCENT_BUCKETS);

/** Six driver ids (null = empty slot), the fastest-lap pick, and whether it's locked in. */
export type Pick = { picks: (string | null)[]; fl: string | null; done: boolean };
const EMPTY: Pick = { picks: Array(SLOTS).fill(null), fl: null, done: false };

/** Saves are read once: key the component on `today` so a new day starts afresh. */
export function usePredict(data: RaceData, today: number) {
	const [mode, setModeState] = useState<GameMode>("daily");
	const [daily, setDaily] = useState<Pick>(() => ({ ...EMPTY, ...store.readDaily<Pick>("daily", today) }));
	const [stats, setStats] = useState(readStats);
	const [practice, setPractice] = useState<{ race: string; pick: Pick } | null>(null);

	const setMode = (m: GameMode) => {
		setModeState(m);
		if (m === "practice" && !practice) setPractice({ race: randomRace(data.races).id, pick: EMPTY });
	};

	const race = useMemo(() => (mode === "daily" ? dailyRace(data.races, today) : practice ? (data.byId.get(practice.race) ?? null) : null), [data, today, mode, practice]);
	const pick = mode === "daily" ? daily : (practice?.pick ?? EMPTY);
	const result = useMemo(() => (race && pick.done ? score(race, pick.picks, pick.fl) : null), [race, pick]);

	const update = (next: Pick) => {
		if (mode === "practice") {
			setPractice((p) => p && { ...p, pick: next });
			return;
		}
		if (!race) return;
		setDaily(next);
		store.writeDaily("daily", today, next);
		if (next.done) {
			const total = score(race, next.picks, next.fl).total;
			const s = recordResult(readStats(), today, isWin(total), resultBucket(total));
			store.write("stats", s);
			setStats(s);
		}
	};

	const newPractice = (exclude?: string) => setPractice({ race: randomRace(data.races, Math.random, exclude).id, pick: EMPTY });

	return { mode, setMode, race, pick, result, update, newPractice, stats };
}
