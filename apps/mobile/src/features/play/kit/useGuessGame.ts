// The state every "find the mystery X" game shares (Guess the driver, Career path, the clue
// boards, Guess the season, Guess the race): Daily / Practice, a saved variant (difficulty or
// pool), today's guesses saved per variant, a practice target, the stats, and the haptics for a
// right or wrong guess. The game supplies its picks and the stats rule; it builds its own rows.

import { useCallback, useMemo, useState } from "react";
import { gameStore, type GameMode, type GameStats } from "@pitwall/core/game/daily";
import { haptic } from "@/lib/haptics";
import { useToday } from "./data";

export type GuessGameOptions<Id extends string | number, V extends string> = {
	/** Storage name: saves go under `pitwall-<game>:` as on the website. */
	game: string;
	/** A saved variant (e.g. difficulty under "difficulty", pool under "pool"); omit for none. */
	variant?: { key: string; ids: readonly V[]; fallback: V };
	maxGuesses: number;
	/** Distribution buckets in the stats (defaults to maxGuesses). */
	buckets?: number;
	/** The game's data (or a flag): targets are picked once it's truthy, and again if it changes. */
	ready: unknown;
	dailyTarget: (variant: V, today: number) => Id;
	randomTarget: (variant: V, exclude?: Id) => Id;
	recordResult: (stats: GameStats, day: number, won: boolean, guesses: number) => GameStats;
};

export function useGuessGame<Id extends string | number, V extends string = string>(o: GuessGameOptions<Id, V>) {
	const store = useMemo(() => gameStore(o.game), [o.game]);
	const { today, rollover } = useToday();
	const buckets = o.buckets ?? o.maxGuesses;
	const variants = o.variant;

	const [variantState, setVariantState] = useState<V>(() => {
		if (!variants) return "" as V;
		const saved = store.read<string>(variants.key, variants.fallback);
		return (variants.ids as readonly string[]).includes(saved) ? (saved as V) : variants.fallback;
	});
	const variant = variantState;
	const suffix = variants ? `:${variant}` : "";
	const [mode, setModeState] = useState<GameMode>("daily");
	const [practice, setPractice] = useState<{ variant: V; target: Id; guesses: Id[] } | null>(null);
	const [statsOpen, setStatsOpen] = useState(false);
	// bumped after every save, so the reads below refresh
	const [version, setVersion] = useState(0);

	const savedDaily = useMemo(
		() => store.readDaily<{ guesses: Id[] }>(`daily${suffix}`, today)?.guesses ?? [],
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[store, suffix, today, version],
	);
	const stats = useMemo(
		() => store.readStats(`stats${suffix}`, buckets),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[store, suffix, buckets, version],
	);

	const freshPractice = (v: V, exclude?: Id) => ({ variant: v, target: o.randomTarget(v, exclude), guesses: [] as Id[] });

	// practice starts with a random target the first time it's needed (and again for a new variant)
	const practiceNow = o.ready && mode === "practice" ? (practice && practice.variant === variant ? practice : null) : null;
	const needsPractice = o.ready && mode === "practice" && !practiceNow;
	// adjusting state while rendering (React re-renders straight away, before painting)
	if (needsPractice) setPractice(freshPractice(variant));

	// the daily pick shuffles the whole pool: once per day and variant, not per render
	const dailyId = useMemo(
		() => (o.ready ? o.dailyTarget(variant, today) : null),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[o.ready, variant, today],
	);
	const targetId: Id | null = !o.ready ? null : mode === "daily" ? dailyId : (practiceNow?.target ?? null);
	const guesses: readonly Id[] = mode === "daily" ? savedDaily : (practiceNow?.guesses ?? []);
	const won = targetId != null && guesses.includes(targetId);
	const over = won || guesses.length >= o.maxGuesses;

	const setMode = useCallback((m: GameMode) => setModeState(m), []);
	const setVariant = useCallback(
		(v: V) => {
			if (!variants) return;
			setVariantState(v);
			store.write(variants.key, v);
			setPractice(null);
		},
		[store, variants],
	);

	/** Makes a guess: true when it was right. Plays the success or error haptic. */
	const guess = (id: Id): boolean | null => {
		if (over || targetId == null || guesses.includes(id)) return null;
		const next = [...guesses, id];
		const right = id === targetId;
		haptic(right ? "success" : "error");
		if (mode === "practice") {
			setPractice((p) => p && { ...p, guesses: next });
			return right;
		}
		store.writeDaily(`daily${suffix}`, today, { guesses: next });
		if (right || next.length >= o.maxGuesses) store.write(`stats${suffix}`, o.recordResult(store.readStats(`stats${suffix}`, buckets), today, right, next.length));
		setVersion((n) => n + 1);
		return right;
	};

	/** A fresh practice target (never the current one). */
	const newPractice = () => setPractice(freshPractice(variant, targetId ?? undefined));
	/** The result card's button: switch to practice with a new target. */
	const playAgain = () => {
		setModeState("practice");
		setPractice(freshPractice(variant, targetId ?? undefined));
	};

	return {
		store,
		today,
		rollover,
		mode,
		setMode,
		variant,
		setVariant,
		targetId,
		guesses,
		won,
		over,
		stats,
		statsOpen,
		openStats: () => setStatsOpen(true),
		closeStats: () => setStatsOpen(false),
		guess,
		newPractice,
		playAgain,
		/** The share label: "#3" or "practice", plus " (All time)" for the all-time variant. */
		shareLabel: (allTime = variant === "all") => `${mode === "daily" ? `#${today + 1}` : "practice"}${allTime ? " (All time)" : ""}`,
		/** Today's result bucket for the stats highlight (daily wins only). */
		highlight: mode === "daily" && won ? guesses.length - 1 : null,
	};
}
