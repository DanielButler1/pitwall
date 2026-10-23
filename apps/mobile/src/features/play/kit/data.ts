// Game data on the phone. The website downloads each game's /data/<game>.json, built from the
// dataset by core's builders; the app has the dataset on the device, so it runs the same builders
// here (once per Db) and the same unpack functions. Files that need more than the dataset (the
// lap chart's Jolpica laps) are fetched like the website does, with React Query.

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { Db } from "@pitwall/core/f1/dataset";
import { dayIndex } from "@pitwall/core/game/daily";
import { useRealDb } from "@/data/dataset";
import { dataUrl } from "@/lib/config";

/** A game's data built from the dataset, memoised per Db. `peek` returns it only if already built. */
export type DbLoader<T> = { (db: Db): T; peek(db: Db): T | undefined };

/**
 * Wraps a build (e.g. `(db) => unpack(guessFile(db))`) so it runs once per Db. Define loaders at
 * module level so every screen shares the cache.
 */
export function dbLoader<T>(build: (db: Db) => T): DbLoader<T> {
	const cache = new WeakMap<Db, T>();
	const load = ((db: Db) => {
		let value = cache.get(db);
		if (value === undefined) {
			value = build(db);
			cache.set(db, value);
		}
		return value;
	}) as DbLoader<T>;
	load.peek = (db) => cache.get(db);
	return load;
}

type DbState<T> = { db: Db; data: T | null; error: boolean };

/**
 * Runs a loader against the current dataset: `data` is null while it builds (a frame after the
 * screen first paints, so the loading state shows rather than a frozen tap), `error` with `retry`
 * if the build threw. Already-built data is there on the first render.
 */
export function useDbData<T>(loader: DbLoader<T>): { data: T | null; error: boolean; retry: () => void } {
	// real history even while a Lab universe is shown: the daily puzzles must match everyone else's
	const db = useRealDb();
	const [state, setState] = useState<DbState<T> | null>(null);
	const [attempt, setAttempt] = useState(0);
	const cached = loader.peek(db);
	useEffect(() => {
		if (loader.peek(db) !== undefined) return;
		let live = true;
		// let the loading state paint before the (synchronous) build takes the JS thread
		const frame = requestAnimationFrame(() => {
			setTimeout(() => {
				if (!live) return;
				try {
					const data = loader(db);
					if (live) setState({ db, data, error: false });
				} catch {
					if (live) setState({ db, data: null, error: true });
				}
			}, 0);
		});
		return () => {
			live = false;
			cancelAnimationFrame(frame);
		};
	}, [db, loader, attempt]);
	const current = state?.db === db ? state : null;
	return { data: cached ?? current?.data ?? null, error: cached === undefined && !!current?.error, retry: useCallback(() => setAttempt((a) => a + 1), []) };
}

/**
 * A JSON file from the website's /data (e.g. "lap-chart.json"), mapped once and kept for the
 * session; null `path` waits. The query key is the path, so two screens share one download.
 */
export function useDataFile<F, T>(path: string | null, map: (file: F) => T) {
	return useQuery({
		queryKey: ["play-data", path],
		enabled: path != null,
		staleTime: Infinity,
		gcTime: 30 * 60_000,
		queryFn: async () => {
			const res = await fetch(dataUrl(path!));
			if (!res.ok) throw new Error(`The site answered ${res.status}`);
			return map((await res.json()) as F);
		},
	});
}

/** Today's puzzle day, and a rollover callback for Countdown (when midnight UTC passes on screen). */
export function useToday() {
	const [today, setToday] = useState(() => dayIndex());
	const rollover = useCallback(() => setToday(dayIndex()), []);
	return { today, rollover };
}
