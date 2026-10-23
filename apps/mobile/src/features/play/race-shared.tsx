// Shared by "Guess the race" and "Lap chart mystery": the race catalogue (core's raceGuessFile,
// built on the device), the race picker (year tokens like "05" or "1988" plus Grand Prix,
// circuit and country words), the guess board, its legends, and the answer's title.

import { ArrowDown, ArrowUp, Check, ChevronsDown, ChevronsUp, Globe, MapPin, Users, X, type LucideIcon } from "lucide-react-native";
import { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { raceGuessFile } from "@pitwall/core/game/race-guess-data";
import { RACE_TILES, searchRaces, unpackRaces, type RaceColumn, type RaceComparison, type RaceTile, type RgRace } from "@pitwall/core/game/race-guess";
import { Flag } from "@/components/f1";
import { Text } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { href, useOpen } from "@/lib/links";
import { ClueHeader, ClueRow, dbLoader, EntityPicker, Legend, LegendItem, TileText, verdictIcon, type ClueTileData, type PickerItem } from "./kit";
import { LinkText, RevealTitle } from "./shared";

/** The race catalogue, built once per dataset. */
export const loadRaceCatalog = dbLoader((db) => unpackRaces(raceGuessFile(db)));

/** "Japanese Grand Prix" → "Japanese GP" for tight spots. */
export const shortGp = (name: string) => name.replace(/ Grand Prix$/, " GP");

type RaceItem = PickerItem & { race: RgRace };

/**
 * The race search: each option is just "2005 Japanese Grand Prix" (the circuit, its flag or the
 * round would answer clues). `races` must be memoised.
 */
export function RacePicker({ races, exclude, onPick, placeholder = "Type a year, Grand Prix or circuit" }: { races: RgRace[]; exclude: number[]; onPick: (race: RgRace) => void; placeholder?: string }) {
	const items = useMemo<RaceItem[]>(() => races.map((r) => ({ id: String(r.id), label: r.label, race: r })), [races]);
	const byId = useMemo(() => new Map(items.map((i) => [i.race.id, i])), [items]);
	return (
		<EntityPicker
			items={items}
			exclude={exclude}
			onPick={(i) => onPick(i.race)}
			label="Guess a race"
			placeholder={placeholder}
			noun="races"
			search={(_, q, ex) =>
				searchRaces(
					races,
					q,
					new Set([...ex].map(Number)),
				).map((r) => byId.get(r.id)!)
			}
		/>
	);
}

/** Close-tile icons for tiles without a direction. */
const CLOSE_ICON: Partial<Record<RaceTile["key"], LucideIcon>> = { grandPrix: Globe, circuit: MapPin, winner: Users };

function tileIcon(t: RaceTile): LucideIcon {
	if (t.direction && t.verdict !== "match") return t.far ? (t.direction === "higher" ? ChevronsUp : ChevronsDown) : t.direction === "higher" ? ArrowUp : ArrowDown;
	return verdictIcon(t.verdict, null, CLOSE_ICON[t.key]);
}

function raceTile(tile: RaceTile, attr: RaceColumn, r: RgRace): ClueTileData {
	// coarse columns (no amber state) must not describe the answer beyond match / miss / direction
	const coarse = !attr.close;
	const winner = r.top[0];
	let content: ReactNode;
	let text: string;
	let hint: string;
	if (tile.key === "year" || tile.key === "round") {
		const v = tile.key === "year" ? r.year : r.round;
		content = <TileText strong>{String(v)}</TileText>;
		text = String(v);
		const way = tile.key === "year" ? (tile.direction === "higher" ? "later" : "earlier") : tile.direction === "higher" ? "a later round" : "an earlier round";
		hint =
			tile.verdict === "match"
				? `${attr.label} ${v}: a match`
				: `${attr.label} ${v}: the mystery race is ${tile.key === "year" ? `${way}${tile.far ? ", by more than 10 years" : ""}` : way}${tile.verdict === "close" ? ` (${attr.close})` : ""}`;
	} else if (tile.key === "grandPrix") {
		content = (
			<>
				<Flag code={r.grandPrix.flag} className="text-[14px] leading-[18px]" />
				<TileText className="text-[10px]">{shortGp(r.grandPrix.name).replace(/ GP$/, "")}</TileText>
			</>
		);
		text = r.grandPrix.name;
		hint =
			tile.verdict === "match"
				? `Same Grand Prix: ${text}`
				: tile.verdict === "close"
					? `${text}: another Grand Prix on the same continent`
					: coarse
						? `Not the ${text}`
						: `Not the ${text}, and another continent`;
	} else if (tile.key === "circuit") {
		content = <TileText>{r.circuit.name}</TileText>;
		text = r.circuit.name;
		hint = tile.verdict === "match" ? `Same circuit: ${text}` : tile.verdict === "close" ? `${text}: another circuit in ${r.circuit.countryName}` : `Not ${text}, and another country`;
	} else {
		content = <TileText>{winner?.driver.lastName ?? "–"}</TileText>;
		text = winner ? `${winner.driver.name} (${winner.team.name})` : "none";
		hint =
			tile.verdict === "match"
				? `Same winner: ${text}`
				: tile.verdict === "close"
					? `Won by ${text}: the mystery race's winner drove for ${winner?.team.name} too`
					: coarse
						? `Won by ${winner?.driver.name ?? "nobody"}: the mystery race had another winner`
						: `Won by ${text}: another driver and team`;
	}
	return {
		key: tile.key,
		verdict: tile.verdict,
		direction: tile.direction,
		icon: tileIcon(tile),
		hint,
		srText: `${attr.label} ${text}: ${tile.verdict}${tile.direction ? `, mystery race's is ${tile.direction}` : ""}`,
		content,
	};
}

/** Every guess so far (newest first), each compared tile by tile with the answer. */
export function RaceBoard({ rows, columns = RACE_TILES }: { rows: RaceComparison[]; columns?: RaceColumn[] }) {
	const open = useOpen();
	if (!rows.length) return null;
	return (
		<View className="mt-2" accessibilityLabel="Your guesses">
			<ClueHeader labels={columns.map((c) => c.short)} />
			{[...rows].reverse().map((r, i) => (
				<ClueRow
					key={r.guess.id}
					n={rows.length - i}
					title={r.guess.label}
					leading={<Flag code={r.guess.circuit.flag} />}
					onPressTitle={() => open(href.race(r.guess))}
					tiles={r.tiles.map((t) => raceTile(t, columns.find((c) => c.key === t.key)!, r.guess))}
				/>
			))}
		</View>
	);
}

export function RaceLegend() {
	return (
		<Legend
			close="Close: within 3 years or 2 rounds, a Grand Prix on the same continent, a circuit in the same country, or a winner from the same team"
			direction="The mystery race is later (double arrow: more than 10 years or 5 rounds)"
		/>
	);
}

/** The key under a board of coarse (match / miss only) columns: the lap chart mystery's. */
export function CoarseLegend() {
	return (
		<View className="gap-2 px-4 pt-4">
			<LegendItem verdict="match" icon={Check}>
				Match
			</LegendItem>
			<LegendItem verdict="miss" icon={X}>
				Miss
			</LegendItem>
			<LegendItem verdict="miss" icon={ArrowUp}>
				Year: the mystery race is later
			</LegendItem>
		</View>
	);
}

/** The answer's title: flag, race name linking to its page, date, round and circuit. */
export function RaceTitle({ race: r }: { race: RgRace }) {
	return (
		<View className="gap-1">
			<RevealTitle flag={r.circuit.flag} title={r.label} href={href.race(r)} />
			<Text variant="muted">
				{`${fmtDate(r.date)} · Round ${r.round} · `}
				<LinkText href={href.circuit(r.circuit.id)} className="font-normal">
					{r.circuit.name}
				</LinkText>
				{r.circuit.place && r.circuit.place !== r.circuit.name ? `, ${r.circuit.place}` : ""}
			</Text>
		</View>
	);
}
