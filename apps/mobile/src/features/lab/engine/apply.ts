// Applying universes on the phone. The website does this in a Web Worker; React Native has no
// workers, so here the work runs on the JS thread in slices of a few milliseconds, yielding between
// them so taps, scrolling and progress keep flowing. The slow parts are the performance ratings
// (once per dataset), whole-history simulations (yielding between seasons, through core's
// `simulateHistorySteps`) and indexing plus standings (`finishUniverseSteps`, between seasons).
// Results are cached per reality and universe revision, so going back and forth is instant.

import { useEffect, useRef, useState } from "react";
import type { Db } from "@pitwall/core/f1/dataset";
import { simulateHistorySteps } from "@pitwall/core/sim/history";
import { buildModifiers } from "@pitwall/core/sim/modifiers";
import { deriveRatings, ratingCurves, type RatingCurves } from "@pitwall/core/sim/ratings";
import { changesHash } from "@pitwall/core/universe/share";
import { finishUniverseSteps, mergeDiff, universeDiff, type Change, type UniverseDb } from "@pitwall/core/universe/apply";

export type ApplyProgress = { label: string; fraction: number | null };

/** Work for this long, then let the UI breathe (about two frames: shorter slices made long runs much slower). */
const SLICE_MS = 32;
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const now = () => performance.now();

/* ----------------------------------------------------------------- queue --- */

// One job at a time (there is one thread). A newer job on the same channel replaces a queued or
// running one: the running one stops at its next pause.
type Job = { channel: string; run: (alive: () => boolean) => Promise<void>; cancelled: boolean; skipped?: () => void };
const queue: Job[] = [];
let running: Job | null = null;

function schedule(channel: string, run: Job["run"], skipped?: () => void) {
	for (const j of queue) if (j.channel === channel) j.cancelled = true;
	if (running?.channel === channel) running.cancelled = true;
	const job: Job = { channel, run, cancelled: false, skipped };
	queue.push(job);
	void drain();
	return job;
}

async function drain() {
	if (running) return;
	while (queue.length) {
		const job = queue.shift()!;
		if (job.cancelled) {
			job.skipped?.();
			continue;
		}
		running = job;
		try {
			await job.run(() => !job.cancelled);
		} catch {
			// each job reports its own errors
		}
		running = null;
	}
}

class Superseded extends Error {}

/** Runs a generator in slices, throwing Superseded if the job is replaced on the way. */
async function stepThrough<T>(steps: Generator<unknown, T>, alive: () => boolean, onStep?: (value: unknown) => void): Promise<T> {
	let until = now() + SLICE_MS;
	for (;;) {
		const step = steps.next();
		if (step.done) return step.value;
		onStep?.(step.value);
		if (now() >= until) {
			await pause();
			if (!alive()) throw new Superseded();
			until = now() + SLICE_MS;
		}
	}
}

/* ----------------------------------------------------------------- cache --- */

const results = new WeakMap<Db, Map<string, UniverseDb>>();
const remember = (base: Db, key: string, db: UniverseDb) => {
	let m = results.get(base);
	if (!m) results.set(base, (m = new Map()));
	m.delete(key);
	m.set(key, db);
	// each one is a full indexed copy of history: keep a few
	if (m.size > 4) m.delete(m.keys().next().value!);
	return db;
};
export const cachedUniverse = (base: Db, key: string) => results.get(base)?.get(key) ?? null;

/** What the last applies cost on this device, newest first (for the Lab's footnote and reports). */
export type ApplyTiming = { key: string; total: number; stages: [string, number][] };
export const timings: ApplyTiming[] = [];

const SIM_KINDS = new Set<Change["kind"]>(["race-sim", "season-sim", "history-sim", "driver-swap"]);

/* ----------------------------------------------------------------- apply --- */

/**
 * Applies a change list to real history without holding the thread for long. Resolves null when a
 * newer request on the same channel replaced it.
 */
export function applyAsync(base: Db, key: string, changes: Change[], opts: { channel: string; onProgress?: (p: ApplyProgress) => void }): Promise<UniverseDb | null> {
	const hit = cachedUniverse(base, key);
	if (hit) return Promise.resolve(hit);
	// no changes: reality itself
	if (!changes.length) return Promise.resolve(remember(base, key, base));
	// several screens often want the same universe at once (the Lab, an editor, the banner): one run
	let flights = inflight.get(base);
	if (!flights) inflight.set(base, (flights = new Map()));
	const joined = flights.get(key);
	if (joined) {
		if (opts.onProgress) joined.listeners.add(opts.onProgress);
		return joined.promise;
	}
	const listeners = new Set<(p: ApplyProgress) => void>(opts.onProgress ? [opts.onProgress] : []);
	const promise = run(base, key, changes, opts.channel, (p) => listeners.forEach((fn) => fn(p)));
	flights.set(key, { promise, listeners });
	const done = () => flights.get(key)?.promise === promise && flights.delete(key);
	promise.then(done, done);
	return promise;
}

const inflight = new WeakMap<Db, Map<string, { promise: Promise<UniverseDb | null>; listeners: Set<(p: ApplyProgress) => void> }>>();

function run(base: Db, key: string, changes: Change[], channel: string, onProgress: (p: ApplyProgress) => void): Promise<UniverseDb | null> {
	const opts = { channel, onProgress };
	return new Promise((resolve, reject) => {
		schedule(opts.channel, async (alive) => {
			const again = cachedUniverse(base, key);
			if (again) return resolve(again);
			const stages: [string, number][] = [];
			const started = now();
			let mark = started;
			const stage = (name: string) => {
				const t = now();
				stages.push([name, Math.round(t - mark)]);
				mark = t;
			};
			const report = (label: string, fraction: number | null) => opts.onProgress?.({ label, fraction });
			try {
				if (changes.some((c) => SIM_KINDS.has(c.kind))) {
					report("Rating every driver and car", null);
					await pause();
					if (!alive()) throw new Superseded();
					mark = now();
					deriveRatings(base);
					stage("ratings");
				}
				// whole-history runs first, a season per step; universeDiff then finds them cached
				const mods = buildModifiers(changes);
				for (const c of changes) {
					if (c.kind !== "history-sim") continue;
					let last = 0;
					await stepThrough(simulateHistorySteps(base, c, mods), alive, (year) => {
						const t = now();
						if (t - last < 250) return;
						last = t;
						const y = year as number;
						report(`Simulating ${y}`, (y - c.fromYear) / Math.max(1, c.toYear - c.fromYear + 1));
					});
					stage(`history ${c.mode} ${c.fromYear}-${c.toYear}`);
				}
				report("Applying changes", null);
				await pause();
				if (!alive()) throw new Superseded();
				mark = now();
				const merged = mergeDiff(base, universeDiff(base, changes));
				stage("diff");
				const years = merged.modifiedYears?.size ?? 0;
				let done = 0;
				let last = 0;
				const db = await stepThrough(finishUniverseSteps(merged), alive, () => {
					done++;
					const t = now();
					if (t - last < 250) return;
					last = t;
					report("Adding up the championships", years ? done / years : null);
				});
				stage("standings");
				const total = Math.round(now() - started);
				timings.unshift({ key, total, stages });
				if (timings.length > 20) timings.pop();
				console.log(`[lab] applied ${key} in ${total} ms (${stages.map(([s, ms]) => `${s} ${ms}`).join(", ")})`);
				resolve(remember(base, key, db));
			} catch (e) {
				if (e instanceof Superseded) resolve(null);
				else reject(e instanceof Error ? e : new Error(String(e)));
			}
		}, () => resolve(null));
	});
}

export type AppliedState = { db: UniverseDb | null; pending: boolean; progress: ApplyProgress | null; error: string | null };

/**
 * A universe (or a candidate change list) applied in the background. Keeps showing the previous
 * result while a new one is computed, as on the website.
 */
export function useApplied(base: Db | null, key: string | null, changes: Change[] | null, opts: { channel: string; debounce?: number }): AppliedState {
	// the last finished result (any key), and progress or failure for the key being worked on
	const [last, setLast] = useState<UniverseDb | null>(null);
	const [work, setWork] = useState<{ key: string; progress: ApplyProgress | null; error: string | null } | null>(null);
	const latest = useRef<string | null>(null);
	useEffect(() => {
		latest.current = key;
		if (!base || !key || !changes || cachedUniverse(base, key)) return;
		const go = (retry: boolean) =>
			applyAsync(base, key, changes, {
				channel: opts.channel,
				onProgress: (progress) => latest.current === key && setWork({ key, progress, error: null }),
			}).then(
				(db) => {
					if (latest.current !== key) return;
					if (db) setLast(db);
					// replaced by another screen's request on the same channel, but still wanted here
					else if (retry) setTimeout(() => latest.current === key && go(false), 50);
				},
				(e: Error) => latest.current === key && setWork({ key, progress: null, error: e.message }),
			);
		const timer = setTimeout(() => go(true), opts.debounce ?? 0);
		return () => {
			clearTimeout(timer);
			latest.current = null;
		};
		// `key` identifies `changes`
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [base, key, opts.channel, opts.debounce]);
	if (!base || !key || !changes) return { db: null, pending: false, progress: null, error: null };
	const hit = cachedUniverse(base, key);
	if (hit) return { db: hit, pending: false, progress: null, error: null };
	const mine = work?.key === key ? work : null;
	return { db: last, pending: !mine?.error, progress: mine?.progress ?? null, error: mine?.error ?? null };
}

/** Stable key for an unsaved change list (previews). */
export function changesKey(prefix: string, changes: Change[]) {
	const s = JSON.stringify(changes.map(({ id: _id, ...rest }) => (void _id, rest)));
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
	return `${prefix}:${(h >>> 0).toString(36)}:${s.length}`;
}

/** Cache key for a universe: its content, so renaming or duplicating one doesn’t re-apply it. */
export const universeKey = (u: { changes: Change[] }) => `u:${changesHash(u.changes)}`;

/* --------------------------------------------------------------- ratings --- */

const curves = new WeakMap<Db, Promise<RatingCurves>>();

/** The rating curves for the performance editors' charts (deriving the ratings is the slow part). */
export function loadRatingCurves(base: Db): Promise<RatingCurves> {
	let p = curves.get(base);
	if (!p) {
		p = new Promise<RatingCurves>((resolve, reject) => {
			schedule(`ratings:${base.meta.generatedAt}`, async () => {
				await pause();
				try {
					const t = now();
					const r = ratingCurves(deriveRatings(base));
					console.log(`[lab] rating curves in ${Math.round(now() - t)} ms`);
					resolve(r);
				} catch (e) {
					reject(e as Error);
				}
			});
		});
		curves.set(base, p);
		p.catch(() => curves.delete(base));
	}
	return p;
}

export function useRatingCurves(base: Db): { curves: RatingCurves | null; error: string | null } {
	const [state, setState] = useState<{ curves: RatingCurves | null; error: string | null }>({ curves: null, error: null });
	useEffect(() => {
		let alive = true;
		loadRatingCurves(base).then(
			(c) => alive && setState({ curves: c, error: null }),
			(e: Error) => alive && setState({ curves: null, error: e.message }),
		);
		return () => {
			alive = false;
		};
	}, [base]);
	return state;
}

/** Derives the ratings ahead of time (opening the Lab), so the first simulation starts sooner. */
export function warmRatings(base: Db) {
	void loadRatingCurves(base);
}
