// "Guess the driver" (/play/guess): eight guesses to find the day's mystery driver, each compared
// on nationality, career span, teams, starts, wins and titles. The driver list is built on the
// device with core's guessFile (the website's /data/guess.json); picks, comparisons and the share
// text come from core's game/guess.

import { Globe, Users } from "lucide-react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { guessFile } from "@pitwall/core/game/guess-data";
import {
	ATTRIBUTES,
	compare,
	dailyTarget,
	DIFFICULTIES,
	driverWeight,
	MAX_GUESSES,
	randomTarget,
	recordResult,
	shareText,
	unpack,
	type Comparison,
	type Difficulty,
	type GuessDriver,
	type Tile,
} from "@pitwall/core/game/guess";
import { Flag } from "@/components/f1";
import { Text } from "@/components/ui";
import { webUrl } from "@/lib/config";
import { num } from "@/lib/format";
import { href, useOpen } from "@/lib/links";
import {
	ChoiceToggle,
	ClueHeader,
	ClueRow,
	dbLoader,
	EntityPicker,
	Figures,
	GameError,
	GameHeader,
	GameLoading,
	GameScreen,
	Legend,
	ResultCard,
	shareResult,
	StatsPanel,
	TileText,
	useDbData,
	useGuessGame,
	verdictIcon,
	type ClueTileData,
} from "./kit";
import { GuessFooter, RevealTitle, resultStatus } from "./shared";

const span = (d: GuessDriver) => (d.first === d.last ? String(d.first) : `${d.first}–${d.last}`);

const load = dbLoader((db) => {
	const f = guessFile(db);
	const drivers = f.drivers.map(unpack);
	return {
		drivers,
		byId: new Map(drivers.map((d) => [d.id, d])),
		teams: f.teams,
		items: drivers.map((d) => ({ id: d.id, label: d.name, sublabel: span(d), weight: driverWeight(d) })),
	};
});
type Data = ReturnType<typeof load>;

export function GuessScreen() {
	const open = useOpen();
	const { data, error, retry } = useDbData(load);
	const g = useGuessGame<string, Difficulty>({
		game: "guess",
		variant: { key: "difficulty", ids: ["modern", "all"], fallback: "modern" },
		maxGuesses: MAX_GUESSES,
		ready: data,
		dailyTarget: (v, day) => dailyTarget(data!.drivers, v, day).id,
		randomTarget: (v, exclude) => randomTarget(data!.drivers, v, Math.random, exclude).id,
		recordResult,
	});
	const target = data && g.targetId ? (data.byId.get(g.targetId) ?? null) : null;
	const rows = useMemo(
		() => (data && target ? g.guesses.map((id) => data.byId.get(id)).filter((d) => !!d).map((d) => compare(d, target)) : []),
		[data, target, g.guesses],
	);
	const level = DIFFICULTIES.find((d) => d.id === g.variant)!;

	return (
		<GameScreen title="Guess the driver" today={g.today} mode={g.mode} onStats={g.openStats}>
			<GameHeader mode={g.mode} onModeChange={g.setMode} controls={<ChoiceToggle value={g.variant} options={DIFFICULTIES} onChange={g.setVariant} />}>
				{`A new mystery driver every day at midnight UTC, the same for everyone. You have ${MAX_GUESSES} guesses: each one shows how close it was on nationality, career span, teams and results. ${level.description}. Tap a tile to see what it means.`}
			</GameHeader>

			{error ? (
				<GameError what="the drivers" onRetry={retry} />
			) : !data || !target ? (
				<GameLoading />
			) : (
				<View className="mt-2">
					{g.over ? (
						<ResultCard
							won={g.won}
							status={resultStatus(g.won, rows.length, MAX_GUESSES, "Out of guesses. The mystery driver was")}
							mode={g.mode}
							nextLabel={g.mode === "practice" ? "Next practice driver" : "Practice with a random driver"}
							countdownLabel="Next driver in"
							onShare={() => shareResult(shareText({ rows, won: g.won, label: g.shareLabel(), url: webUrl("/play/guess") }))}
							onNext={g.playAgain}
							onStats={g.openStats}
							onRollover={g.rollover}
						>
							<Reveal target={target} teams={data.teams} />
						</ResultCard>
					) : (
						<View className="gap-1">
							<EntityPicker items={data.items} exclude={g.guesses} onPick={(i) => g.guess(i.id)} label="Guess a driver" placeholder="Type a driver's name" noun="drivers" />
							<GuessFooter text={`Guess ${rows.length + 1} of ${MAX_GUESSES}`} practice={g.mode === "practice"} newLabel="New driver" onNew={g.newPractice} />
						</View>
					)}
					<Board rows={rows} data={data} onOpen={(id) => open(href.driver(id))} />
					<Legend
						close="Close: same continent, a team in common, or within 5 seasons, 25 starts or 5 wins"
						direction="The mystery driver's number is higher (double arrow: by a lot)"
					/>
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

function Board({ rows, data, onOpen }: { rows: Comparison[]; data: Data; onOpen: (id: string) => void }) {
	if (!rows.length) return null;
	return (
		<View className="mt-2" accessibilityLabel="Your guesses">
			<ClueHeader labels={ATTRIBUTES.map((a) => a.short)} />
			{[...rows].reverse().map((r, i) => (
				<ClueRow key={r.guess.id} n={rows.length - i} title={r.guess.name} onPressTitle={() => onOpen(r.guess.id)} tiles={r.tiles.map((t) => tileData(t, r.guess, data.teams))} />
			))}
		</View>
	);
}

function tileData(tile: Tile, d: GuessDriver, teams: Record<string, string>): ClueTileData {
	const attr = ATTRIBUTES.find((a) => a.key === tile.key)!;
	const teamName = (id: string) => teams[id] ?? id;
	const base = { key: tile.key, verdict: tile.verdict, direction: tile.direction };
	if (tile.key === "nation") {
		return {
			...base,
			icon: verdictIcon(tile.verdict, null, Globe),
			hint: tile.verdict === "match" ? `Same nationality: ${d.nation}` : tile.verdict === "close" ? `${d.nation}: same continent` : `Not ${d.nation}, and another continent`,
			srText: `Nationality ${d.nation}: ${tile.verdict}`,
			content: <Flag code={d.flag} className="text-[16px] leading-5" />,
		};
	}
	if (tile.key === "teams") {
		const shared = "shared" in tile ? (tile.shared as string[]) : [];
		const lead = shared[0] ?? d.teams[d.teams.length - 1]!;
		const more = (shared.length ? shared.length : d.teams.length) - 1;
		const list = d.teams.map(teamName).join(", ");
		return {
			...base,
			icon: verdictIcon(tile.verdict, null, Users),
			hint: `Raced for ${list}. ${tile.verdict === "match" ? "Exactly the same teams." : shared.length ? `In common: ${shared.map(teamName).join(", ")}.` : "No team in common."}`,
			srText: `Teams ${list}: ${tile.verdict}`,
			content: (
				<>
					<TileText>{teamName(lead)}</TileText>
					{more > 0 ? <TileText className="text-[10px] font-normal">{`+${more}`}</TileText> : null}
				</>
			),
		};
	}
	const v = d[tile.key];
	const year = tile.key === "first" || tile.key === "last";
	const text = String(v);
	const more = year ? (tile.direction === "higher" ? "later" : "earlier") : tile.direction === "higher" ? "more" : "fewer";
	return {
		...base,
		hint: tile.verdict === "match" ? `${attr.label}: ${text}, a match` : `${attr.label}: ${text}. The mystery driver's is ${more}${tile.verdict === "close" && attr.close ? ` (${attr.close})` : ""}`,
		srText: `${attr.label} ${text}: ${tile.verdict}${tile.direction ? `, mystery driver's is ${tile.direction}` : ""}`,
		content: <TileText strong>{year ? text : num(v)}</TileText>,
	};
}

function Reveal({ target: d, teams }: { target: GuessDriver; teams: Record<string, string> }) {
	return (
		<>
			<RevealTitle flag={d.flag} title={d.name} subtitle={`${d.nation} · ${span(d)}`} href={href.driver(d.id)} />
			<Text variant="muted">{d.teams.map((t) => teams[t] ?? t).join(", ")}</Text>
			<Figures
				items={[
					["Starts", d.starts],
					["Wins", d.wins],
					["Podiums", d.podiums],
					["Poles", d.poles],
					["Titles", d.titles],
				]}
			/>
		</>
	);
}
