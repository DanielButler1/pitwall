"use client";

import { useEffect, useRef, useState } from "react";
import { hydrate, indexData, type Db, type RawDataset } from "../f1/dataset";
import { deriveRatings, ratingCurves, type RatingCurves } from "../sim/ratings";
import { applyUniverse, finishUniverse, mergeDiff, type Change, type Universe, type UniverseDb } from "./apply";
import { getUniverse, onUniversesChanged } from "./store";
import type { WorkerRequest, WorkerResponse } from "./worker";

const DATA_URL = "/data/f1.json";
let basePromise: Promise<Db> | null = null;

/** Real history in the browser: /data/f1.json, fetched once per session. */
export function loadBaseDb(): Promise<Db> {
	basePromise ??= fetch(DATA_URL)
		.then((r) => {
			if (!r.ok) throw new Error(`Failed to load dataset (${r.status})`);
			return r.json() as Promise<RawDataset>;
		})
		.then((raw) => indexData(hydrate(raw)))
		.catch((e) => {
			basePromise = null;
			throw e;
		});
	return basePromise;
}

export function useBaseDb() {
	const [base, setBase] = useState<Db | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		loadBaseDb().then(setBase, (e: Error) => setError(e.message));
	}, []);
	return { base, error };
}

/* ---------------------------------------------------------------- worker --- */

export type ApplyProgress = { done: number; total: number; year: number };
type Pending = { resolve: (db: UniverseDb | null) => void; reject: (e: Error) => void; onProgress?: (p: ApplyProgress) => void; fallback: () => UniverseDb; base: Db };
type PendingRatings = { resolve: (c: RatingCurves) => void; reject: (e: Error) => void; fallback: () => RatingCurves };

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();
const pendingRatings = new Map<number, PendingRatings>();

function disableWorker() {
	worker?.terminate();
	worker = null;
	// finish anything in flight on the main thread instead
	for (const [id, p] of pending) {
		pending.delete(id);
		try {
			p.resolve(p.fallback());
		} catch (e) {
			p.reject(e as Error);
		}
	}
	for (const [id, p] of pendingRatings) {
		pendingRatings.delete(id);
		try {
			p.resolve(p.fallback());
		} catch (e) {
			p.reject(e as Error);
		}
	}
}

function getWorker(): Worker | null {
	if (worker !== undefined) return worker;
	if (typeof Worker === "undefined") return (worker = null);
	try {
		worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
	} catch {
		return (worker = null);
	}
	worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
		const msg = e.data;
		const r = pendingRatings.get(msg.id);
		if (r) {
			if (msg.type !== "ratings" && msg.type !== "error") return;
			pendingRatings.delete(msg.id);
			if (msg.type === "ratings") r.resolve(msg.curves);
			else r.reject(new Error(msg.message));
			return;
		}
		const p = pending.get(msg.id);
		if (!p) return;
		if (msg.type === "progress") return p.onProgress?.({ done: msg.done, total: msg.total, year: msg.year });
		pending.delete(msg.id);
		if (msg.type === "superseded") p.resolve(null);
		else if (msg.type === "error") p.reject(new Error(msg.message));
		else if (msg.type === "done") {
			try {
				p.resolve(finishUniverse(mergeDiff(p.base, msg.diff)));
			} catch (err) {
				p.reject(err as Error);
			}
		}
	};
	worker.onerror = (e) => {
		e.preventDefault();
		disableWorker();
	};
	return worker;
}

const results = new Map<string, UniverseDb>();
const remember = (key: string, db: UniverseDb) => {
	results.set(key, db);
	if (results.size > 10) results.delete(results.keys().next().value!);
	return db;
};

/**
 * Apply a universe in the Web Worker (falling back to the main thread).
 * Resolves `null` if a newer request on the same channel replaced this one.
 */
export function applyAsync(
	base: Db,
	key: string,
	changes: Change[],
	opts: { channel: string; onProgress?: (p: ApplyProgress) => void },
): Promise<UniverseDb | null> {
	const hit = results.get(key);
	if (hit) return Promise.resolve(hit);
	const fallback = () => applyUniverse(base, { id: key, updatedAt: 0, changes });
	if (!changes.length) return Promise.resolve(remember(key, fallback()));
	const w = getWorker();
	if (!w) return new Promise((r) => setTimeout(r, 0)).then(() => remember(key, fallback()));
	const id = nextId++;
	return new Promise<UniverseDb | null>((resolve, reject) => {
		pending.set(id, { resolve, reject, onProgress: opts.onProgress, fallback, base });
		const req: WorkerRequest = { id, channel: opts.channel, changes, dataUrl: DATA_URL };
		w.postMessage(req);
	}).then((db) => (db ? remember(key, db) : null));
}

export type AppliedState = { db: UniverseDb | null; pending: boolean; progress: ApplyProgress | null; error: string | null };

/**
 * A universe (or candidate change list) applied off the main thread. Keeps
 * showing the previous result while a new one is computed.
 */
export function useAppliedUniverse(base: Db | null, key: string | null, changes: Change[] | null, opts: { channel: string; debounce?: number }): AppliedState {
	const [state, setState] = useState<AppliedState>({ db: null, pending: false, progress: null, error: null });
	const latest = useRef<string | null>(null);
	useEffect(() => {
		latest.current = key;
		if (!base || !key || !changes) {
			setState({ db: null, pending: false, progress: null, error: null });
			return;
		}
		const hit = results.get(key);
		if (hit) {
			setState({ db: hit, pending: false, progress: null, error: null });
			return;
		}
		setState((s) => ({ ...s, pending: true, progress: null, error: null }));
		const timer = setTimeout(() => {
			applyAsync(base, key, changes, {
				channel: opts.channel,
				onProgress: (progress) => latest.current === key && setState((s) => ({ ...s, progress })),
			}).then(
				(db) => db && latest.current === key && setState({ db, pending: false, progress: null, error: null }),
				(e: Error) => latest.current === key && setState((s) => ({ ...s, pending: false, progress: null, error: e.message })),
			);
		}, opts.debounce ?? 0);
		return () => clearTimeout(timer);
		// `key` identifies `changes`
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [base, key, opts.channel, opts.debounce]);
	return state;
}

/** Stable key for an unsaved change list (previews). */
export function changesKey(prefix: string, changes: Change[]) {
	const s = JSON.stringify(changes.map(({ id: _id, ...rest }) => rest));
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
	return `${prefix}:${(h >>> 0).toString(36)}:${s.length}`;
}

/* --------------------------------------------------------------- ratings --- */

let curvesPromise: Promise<RatingCurves> | null = null;

/**
 * The Lab's rating curves, derived in the worker (deriving them takes ~150 ms,
 * which would freeze the page). Falls back to the main thread, after a tick,
 * only if workers are unavailable. Fetched once per session.
 */
export function loadRatingCurves(base: Db): Promise<RatingCurves> {
	const fallback = () => ratingCurves(deriveRatings(base));
	curvesPromise ??= new Promise<RatingCurves>((resolve, reject) => {
		const w = getWorker();
		if (!w) return void setTimeout(() => {
			try {
				resolve(fallback());
			} catch (e) {
				reject(e as Error);
			}
		}, 0);
		const id = nextId++;
		pendingRatings.set(id, { resolve, reject, fallback });
		const req: WorkerRequest = { id, type: "ratings", channel: "ratings", dataUrl: DATA_URL };
		w.postMessage(req);
	}).catch((e) => {
		curvesPromise = null;
		throw e;
	});
	return curvesPromise;
}

export function useRatingCurves(base: Db | null): { curves: RatingCurves | null; error: string | null } {
	const [state, setState] = useState<{ curves: RatingCurves | null; error: string | null }>({ curves: null, error: null });
	useEffect(() => {
		if (!base) return;
		let alive = true;
		loadRatingCurves(base).then(
			(curves) => alive && setState({ curves, error: null }),
			(e: Error) => alive && setState({ curves: null, error: e.message }),
		);
		return () => {
			alive = false;
		};
	}, [base]);
	return state;
}

/* -------------------------------------------------------------- universe --- */

export type UniverseState =
	| { status: "loading"; progress: ApplyProgress | null }
	| { status: "error"; message: string }
	| { status: "missing" }
	| { status: "ready"; base: Db; db: UniverseDb; universe: Universe };

/** Real history with a stored universe applied. Re-applies when the universe is edited. */
export function useUniverseDb(id: string): UniverseState {
	const [state, setState] = useState<UniverseState>({ status: "loading", progress: null });
	useEffect(() => {
		let alive = true;
		const load = async () => {
			try {
				const [base, universe] = await Promise.all([loadBaseDb(), getUniverse(id)]);
				if (!alive) return;
				if (!universe) return setState({ status: "missing" });
				const db = await applyAsync(base, `${universe.id}@${universe.updatedAt}`, universe.changes, {
					channel: `page:${id}`,
					onProgress: (progress) => alive && setState((s) => (s.status === "loading" ? { status: "loading", progress } : s)),
				});
				if (alive && db) setState({ status: "ready", base, db, universe });
			} catch (e) {
				if (alive) setState({ status: "error", message: (e as Error).message });
			}
		};
		load();
		const off = onUniversesChanged(load);
		return () => {
			alive = false;
			off();
		};
	}, [id]);
	return state;
}
