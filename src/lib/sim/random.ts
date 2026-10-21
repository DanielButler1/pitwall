// Seeded randomness. Everything the simulator does is a pure function of the
// seed and its inputs: no Math.random, no clocks, no uuids.

export type Rand = () => number;

/** mulberry32-style generator; returns floats in [0, 1). */
export function rng(seed: number): Rand {
	let a = seed >>> 0 || 0x9e3779b9;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Stable 32-bit hash of any mix of numbers and strings (FNV-1a over a string form). */
export function hash(...parts: (string | number)[]): number {
	let h = 0x811c9dc5;
	const s = parts.join("\u0001");
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** An independent stream for one purpose (e.g. one race, one winter). */
export const stream = (...parts: (string | number)[]) => rng(hash(...parts));

export function gaussian(rand: Rand) {
	const u = Math.max(rand(), 1e-12);
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

export const pick = <T>(rand: Rand, list: readonly T[]): T => list[Math.floor(rand() * list.length)];

export const randInt = (rand: Rand, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

/** Only for UI "re-roll" buttons: never called by the simulator itself. */
export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
