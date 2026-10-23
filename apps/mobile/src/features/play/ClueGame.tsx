// The shared screen of the clue-board games ("Guess the constructor", "Guess the circuit"): the
// same page as "Guess the driver" (Daily / Practice, Modern / All time, picker, board of clue
// tiles, result, stats), driven by a game config, as apps/web/src/components/play/clue-board.tsx.

import { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import type { Direction, Verdict } from "@pitwall/core/game/daily";
import { MAX_GUESSES, recordResult, type Difficulty } from "@pitwall/core/game/clue";
import { webUrl } from "@/lib/config";
import { useOpen } from "@/lib/links";
import {
	ChoiceToggle,
	ClueHeader,
	ClueRow,
	EntityPicker,
	GameError,
	GameHeader,
	GameLoading,
	GameScreen,
	Legend,
	ResultCard,
	shareResult,
	StatsPanel,
	useGuessGame,
	type ClueTileData,
	type PickerItem,
} from "./kit";
import { GuessFooter, resultStatus } from "./shared";

export type ClueRowData<T> = { guess: T; correct: boolean; tiles: { key: string; verdict: Verdict; direction: Direction }[] };
export type ClueColumn = { key: string; label: string; short: string; close?: string };

export type ClueGameConfig<T extends { id: string; name: string }, R extends ClueRowData<T>> = {
	/** Storage name (pitwall-<game>:) and path under /play. */
	game: string;
	title: string;
	/** e.g. "constructor": "Guess a constructor", "New constructor", "Next constructor in". */
	noun: string;
	what: string;
	clues: string;
	difficulties: { id: Difficulty; label: string; description: string }[];
	columns: ClueColumn[];
	dailyTarget: (list: T[], difficulty: Difficulty, day: number) => T;
	randomTarget: (list: T[], difficulty: Difficulty, random: () => number, exclude?: string) => T;
	compare: (guess: T, target: T) => R;
	shareText: (o: { rows: R[]; won: boolean; label: string; url?: string }) => string;
	/** The guess's page. */
	href: (guess: T) => string;
	tile: (row: R, index: number) => ClueTileData;
	legend: { close: string; direction?: string };
	reveal: (target: T) => ReactNode;
};

export type ClueData<T> = { list: T[]; byId: Map<string, T>; items: PickerItem[] };

export function ClueGame<T extends { id: string; name: string }, R extends ClueRowData<T>>({
	config: c,
	data,
	error,
	retry,
}: {
	config: ClueGameConfig<T, R>;
	data: ClueData<T> | null;
	error: boolean;
	retry: () => void;
}) {
	const open = useOpen();
	const g = useGuessGame<string, Difficulty>({
		game: c.game,
		variant: { key: "difficulty", ids: ["modern", "all"], fallback: "modern" },
		maxGuesses: MAX_GUESSES,
		ready: data,
		dailyTarget: (v, day) => c.dailyTarget(data!.list, v, day).id,
		randomTarget: (v, exclude) => c.randomTarget(data!.list, v, Math.random, exclude).id,
		recordResult,
	});
	const target = data && g.targetId ? (data.byId.get(g.targetId) ?? null) : null;
	const rows = useMemo(
		() => (data && target ? g.guesses.map((id) => data.byId.get(id)).filter((d) => !!d).map((d) => c.compare(d, target)) : []),
		[c, data, target, g.guesses],
	);
	const level = c.difficulties.find((d) => d.id === g.variant)!;

	return (
		<GameScreen title={c.title} today={g.today} mode={g.mode} onStats={g.openStats}>
			<GameHeader mode={g.mode} onModeChange={g.setMode} controls={<ChoiceToggle value={g.variant} options={c.difficulties} onChange={g.setVariant} />}>
				{`A new mystery ${c.noun} every day at midnight UTC, the same for everyone. You have ${MAX_GUESSES} guesses: each one shows how close it was on ${c.clues}. ${level.description}. Tap a tile to see what it means.`}
			</GameHeader>

			{error ? (
				<GameError what={c.what} onRetry={retry} />
			) : !data || !target ? (
				<GameLoading />
			) : (
				<View className="mt-2">
					{g.over ? (
						<ResultCard
							won={g.won}
							status={resultStatus(g.won, rows.length, MAX_GUESSES, `Out of guesses. The mystery ${c.noun} was`)}
							mode={g.mode}
							nextLabel={g.mode === "practice" ? `Next practice ${c.noun}` : `Practice with a random ${c.noun}`}
							countdownLabel={`Next ${c.noun} in`}
							onShare={() => shareResult(c.shareText({ rows, won: g.won, label: g.shareLabel(), url: webUrl(`/play/${c.game}`) }))}
							onNext={g.playAgain}
							onStats={g.openStats}
							onRollover={g.rollover}
						>
							{c.reveal(target)}
						</ResultCard>
					) : (
						<View className="gap-1">
							<EntityPicker items={data.items} exclude={g.guesses} onPick={(i) => g.guess(i.id)} label={`Guess a ${c.noun}`} placeholder={`Type a ${c.noun}'s name`} noun={`${c.noun}s`} />
							<GuessFooter text={`Guess ${rows.length + 1} of ${MAX_GUESSES}`} practice={g.mode === "practice"} newLabel={`New ${c.noun}`} onNew={g.newPractice} />
						</View>
					)}
					{rows.length ? (
						<View className="mt-2" accessibilityLabel="Your guesses">
							<ClueHeader labels={c.columns.map((a) => a.short)} />
							{[...rows].reverse().map((r, i) => (
								<ClueRow key={r.guess.id} n={rows.length - i} title={r.guess.name} onPressTitle={() => open(c.href(r.guess))} tiles={r.tiles.map((_, t) => c.tile(r, t))} />
							))}
						</View>
					) : null}
					<Legend close={c.legend.close} direction={c.legend.direction} />
				</View>
			)}

			<StatsPanel
				open={g.statsOpen}
				onClose={g.closeStats}
				stats={g.stats}
				today={g.today}
				description={`Daily puzzles, ${level.label.toLowerCase()}. Saved on this device.`}
				highlight={g.highlight}
			/>
		</GameScreen>
	);
}

/**
 * A numeric clue tile's data: the guess's value with an arrow towards the answer, and a hint such
 * as "First season: 1977. The mystery constructor's is later (within 5 years)".
 */
export function numberTile(
	tile: { key: string; verdict: Verdict; direction: Direction },
	column: ClueColumn,
	noun: string,
	text: string,
	content: ReactNode,
	words: [string, string] = ["more", "fewer"],
): ClueTileData {
	return {
		key: tile.key,
		verdict: tile.verdict,
		direction: tile.direction,
		hint:
			tile.verdict === "match"
				? `${column.label}: ${text}, a match`
				: `${column.label}: ${text}. The mystery ${noun}'s is ${tile.direction === "higher" ? words[0] : words[1]}${tile.verdict === "close" && column.close ? ` (${column.close})` : ""}`,
		srText: `${column.label} ${text}: ${tile.verdict}${tile.direction ? `, mystery ${noun}'s is ${tile.direction}` : ""}`,
		content,
	};
}

/** Years as "1950–2026" (or one year). */
export const yearSpan = (first: number, last: number) => (first === last ? String(first) : `${first}–${last}`);
