// Applies universes off the main thread. A full dynamic history (1950 to 2075)
// takes ~0.4 s to simulate; here that never blocks the page. The worker loads
// its own copy of real history and replies with only the difference a universe
// makes (see `UniverseDiff`), which the page merges into its copy.
// It also derives the performance ratings (~150 ms) for the Lab's charts and
// posts back only the compact curves (see `RatingCurves`).

import { hydrate, indexData, type Db, type RawDataset } from "../f1/dataset.ts";
import { deriveRatings, ratingCurves, type RatingCurves } from "../sim/ratings.ts";
import { universeDiff, type Change, type UniverseDiff } from "./apply.ts";

/** `channel` groups requests where only the latest matters (e.g. a preview while a slider moves). */
export type WorkerRequest =
	| { id: number; type?: "apply"; channel: string; changes: Change[]; dataUrl: string }
	| { id: number; type: "ratings"; channel: string; dataUrl: string };
export type WorkerResponse =
	| { id: number; type: "progress"; done: number; total: number; year: number }
	| { id: number; type: "done"; diff: UniverseDiff; ms: number }
	| { id: number; type: "ratings"; curves: RatingCurves; ms: number }
	| { id: number; type: "superseded" }
	| { id: number; type: "error"; message: string };

type Scope = { onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null; postMessage: (msg: WorkerResponse) => void };
const scope = self as unknown as Scope;

let base: Promise<Db> | null = null;
const loadBase = (url: string) =>
	(base ??= fetch(url)
		.then((r) => {
			if (!r.ok) throw new Error(`Failed to load dataset (${r.status})`);
			return r.json() as Promise<RawDataset>;
		})
		.then((raw) => indexData(hydrate(raw)))
		.catch((e) => {
			base = null;
			throw e;
		}));

const waiting = new Map<string, WorkerRequest>();
let running = false;

async function run() {
	running = true;
	while (waiting.size) {
		const [channel, req] = waiting.entries().next().value!;
		waiting.delete(channel);
		try {
			const db = await loadBase(req.dataUrl);
			const t = performance.now();
			if (req.type === "ratings") {
				const curves = ratingCurves(deriveRatings(db));
				scope.postMessage({ id: req.id, type: "ratings", curves, ms: performance.now() - t });
				continue;
			}
			let last = 0;
			const diff = universeDiff(db, req.changes, (year, from, to) => {
				const now = performance.now();
				if (now - last < 60) return;
				last = now;
				scope.postMessage({ id: req.id, type: "progress", done: year - from, total: to - from + 1, year });
			});
			scope.postMessage({ id: req.id, type: "done", diff, ms: performance.now() - t });
		} catch (err) {
			scope.postMessage({ id: req.id, type: "error", message: (err as Error).message ?? String(err) });
		}
	}
	running = false;
}

scope.onmessage = (e) => {
	const prev = waiting.get(e.data.channel);
	if (prev) scope.postMessage({ id: prev.id, type: "superseded" });
	waiting.set(e.data.channel, e.data);
	if (!running) void run();
};
