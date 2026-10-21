// Universe "tinkering" changes, gathered into one lookup every simulator reads.
// They're order-independent: a performance tweak affects every simulated race in
// its range wherever it sits in the change list.

export type DriverPerformance = { driverId: string; fromYear: number; toYear: number; /** rating points, 1 = 1% of the field */ delta: number };
export type TeamPerformance = { constructorId: string; fromYear: number; toYear: number; delta: number };
export type DriverSwap = { year: number; driverA: string; driverB: string; seed?: number };
export type DriverMove = { driverId: string; constructorId: string; fromYear: number; toYear: number };
export type CareerOverride = { driverId: string; retireAfter?: number; debutYear?: number };
export type Removal = { driverId: string; fromYear: number; toYear: number };

export type HistoryMode = "real-grids" | "dynamic";
export type HistorySim = {
	fromYear: number;
	toYear: number;
	seed: number;
	chaos: number;
	reliability: number;
	mode: HistoryMode;
	/** Dynamic mode: how closely team form follows reality while real seasons last (0–1, default 0.5). */
	anchor?: number;
};

type ModifierChange =
	| ({ kind: "driver-performance" } & DriverPerformance)
	| ({ kind: "team-performance" } & TeamPerformance)
	| ({ kind: "driver-swap" } & DriverSwap)
	| ({ kind: "driver-move" } & DriverMove)
	| ({ kind: "career" } & CareerOverride)
	| ({ kind: "remove-driver" } & Removal);

export type Modifiers = {
	driverDelta: (driverId: string, year: number) => number;
	teamDelta: (constructorId: string, year: number) => number;
	/** Seat swaps per season, in list order. */
	swaps: Map<number, DriverSwap[]>;
	moves: DriverMove[];
	careers: Map<string, CareerOverride>;
	removed: (driverId: string, year: number) => boolean;
	/** True if a season has any driver/team offset, swap or removal. */
	touches: (year: number) => boolean;
	/** Stable key for caching simulations. */
	key: string;
};

export function buildModifiers(changes: readonly { kind: string }[]): Modifiers {
	const list = changes.filter((c): c is ModifierChange =>
		["driver-performance", "team-performance", "driver-swap", "driver-move", "career", "remove-driver"].includes(c.kind),
	);
	const dp = list.filter((c) => c.kind === "driver-performance");
	const tp = list.filter((c) => c.kind === "team-performance");
	const rm = list.filter((c) => c.kind === "remove-driver");
	const swaps = new Map<number, DriverSwap[]>();
	for (const c of list) if (c.kind === "driver-swap") (swaps.get(c.year) ?? swaps.set(c.year, []).get(c.year)!).push(c);
	const careers = new Map<string, CareerOverride>();
	for (const c of list) if (c.kind === "career") careers.set(c.driverId, { ...careers.get(c.driverId), ...c });
	const inRange = (c: { fromYear: number; toYear: number }, y: number) => y >= c.fromYear && y <= c.toYear;
	const touchedYears = new Set<number>(swaps.keys());
	for (const c of [...dp, ...tp, ...rm]) for (let y = c.fromYear; y <= c.toYear; y++) touchedYears.add(y);
	return {
		driverDelta: (id, y) => dp.reduce((a, c) => (c.driverId === id && inRange(c, y) ? a + c.delta : a), 0),
		teamDelta: (id, y) => tp.reduce((a, c) => (c.constructorId === id && inRange(c, y) ? a + c.delta : a), 0),
		swaps,
		moves: list.filter((c) => c.kind === "driver-move"),
		careers,
		removed: (id, y) => rm.some((c) => c.driverId === id && inRange(c, y)),
		touches: (y) => touchedYears.has(y),
		key: JSON.stringify(list.map(({ ...c }) => (delete (c as { id?: string }).id, c))),
	};
}

export const NO_MODIFIERS = buildModifiers([]);
