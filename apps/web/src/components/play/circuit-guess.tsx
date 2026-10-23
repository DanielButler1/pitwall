"use client";

// Daily "Guess the circuit" game (/play/circuit). The circuit list is a static file
// (public/data/circuit-guess.json); the day's mystery circuit, the comparisons and the share
// text come from lib/game/circuit-guess. The page shell is the shared clue board; the country
// tile adds the distance and a compass arrow from the guess to the mystery circuit.

import { useMemo } from "react";
import { ArrowUp, Check } from "lucide-react";
import {
	ATTRIBUTES,
	circuitWeight,
	compare,
	dailyTarget,
	DIFFICULTIES,
	randomTarget,
	shareText,
	TYPE_LABEL,
	unpack,
	type CircuitFile,
	type Comparison,
	type CountryTile,
	type GuessCircuit,
} from "@pitwall/core/game/circuit-guess";
import { compassPoint } from "@pitwall/core/game/clue";
import { Flag, href, num } from "../f1";
import { ULink } from "../universe-link";
import { ClueGame, NumberTile, yearSpan, type ClueData, type ClueGameConfig } from "./clue-board";
import { ClueTile, Figures, jsonLoader, useGameData } from "./kit";

type Data = ClueData<GuessCircuit> & { grandsPrix: Record<string, string>; drivers: Record<string, string> };
type Names = Pick<Data, "grandsPrix" | "drivers">;
const NO_NAMES: Names = { grandsPrix: {}, drivers: {} };

const loadData = jsonLoader("/data/circuit-guess.json", (f: CircuitFile): Data => {
	const list = f.circuits.map(unpack);
	return { list, byId: new Map(list.map((c) => [c.id, c])), grandsPrix: f.grandsPrix, drivers: f.drivers };
});

const column = (key: string) => ATTRIBUTES.find((a) => a.key === key)!;
const km = (n: number) => `${n.toLocaleString("en-GB", { maximumFractionDigits: 3 })} km`;
/** 8,820 km as "8.8k" for the narrow phone tiles (the hint spells it out). */
const shortKm = (n: number) => (n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 9950 ? 1 : 0)}k`);

const makeConfig = (names: Names): ClueGameConfig<GuessCircuit, Comparison> => ({
	game: "circuit",
	title: "Guess the circuit",
	noun: "circuit",
	what: "the circuits",
	clues: "country (with the distance and direction to the mystery circuit), layout and Grand Prix history",
	difficulties: DIFFICULTIES,
	columns: ATTRIBUTES,
	nameHeader: "Circuit",
	dailyTarget,
	randomTarget,
	compare,
	shareText,
	rowName: (c) => (
		<ULink href={href.circuit(c.id)} data-card={`circuit:${c.id}`} className="truncate font-medium underline-offset-4 hover:underline">
			{c.name}
		</ULink>
	),
	tile: (row, i, delay) => <CircuitTile row={row} index={i} delay={delay} />,
	legend: {
		close: "Close: same continent, or within 0.5 km, 2 turns, 5 years or 5 Grands Prix",
		direction: "The mystery circuit's number is higher (double arrow: by a lot). The country tile points towards it",
	},
	reveal: (c) => <Reveal target={c} names={names} />,
});

export function CircuitGame() {
	const { data, error, retry } = useGameData(loadData);
	const config = useMemo(() => makeConfig(data ?? NO_NAMES), [data]);
	const items = useMemo(
		() =>
			data?.list.map((c) => ({
				id: c.id,
				label: c.alias ? `${c.name} (${c.alias})` : c.name,
				sublabel: c.place,
				weight: circuitWeight(c),
			})) ?? [],
		[data],
	);
	return <ClueGame config={config} data={data} error={error} retry={retry} items={items} />;
}

function CircuitTile({ row, index, delay }: { row: Comparison; index: number; delay: number }) {
	const tile = row.tiles[index];
	const c = row.guess;
	const col = column(tile.key);
	if (tile.key === "country") {
		const { km: d, bearing } = tile as CountryTile;
		const where = row.correct ? "" : ` The mystery circuit is ${num(d)} km ${compassPoint(bearing)}.`;
		const same = tile.verdict === "match" ? `Same country: ${c.country}.` : tile.verdict === "close" ? `${c.country}: same continent.` : `Not ${c.country}, and another continent.`;
		return (
			<ClueTile verdict={tile.verdict} icon={null} hint={`${same}${where}`} srText={`Country ${c.country}: ${tile.verdict}.${where}`} delay={delay}>
				<Flag code={c.flag} className="text-base sm:text-lg" />
				{row.correct ? (
					<Check aria-hidden className="size-3.5 opacity-90 sm:size-4" strokeWidth={2.5} />
				) : (
					<>
						<span className="max-w-full truncate text-[10px] leading-tight font-semibold tabular-nums sm:text-[11px]">
							<span className="sm:hidden">{shortKm(d)}</span>
							<span className="hidden sm:inline">{num(d)} km</span>
						</span>
						<ArrowUp aria-hidden className="size-3.5 opacity-90 sm:size-4" strokeWidth={2.5} style={{ transform: `rotate(${bearing}deg)` }} />
					</>
				)}
			</ClueTile>
		);
	}
	if (tile.key === "type") {
		const t = TYPE_LABEL[c.type];
		return (
			<ClueTile
				verdict={tile.verdict}
				hint={`${t.label}: ${t.description}. ${tile.verdict === "match" ? "Same type as the mystery circuit." : "The mystery circuit is another type."}`}
				srText={`Type ${t.label}: ${tile.verdict}`}
				delay={delay}
			>
				<span className="max-w-full truncate text-[11px] font-semibold sm:text-sm">{t.label}</span>
			</ClueTile>
		);
	}
	const key = tile.key as "length" | "turns" | "first" | "races" | "last";
	const v = c[key];
	const year = key === "first" || key === "last";
	return (
		<NumberTile
			tile={tile}
			column={col}
			noun="circuit"
			value={key === "length" ? v.toFixed(2) : year ? v : num(v)}
			text={key === "length" ? km(v) : year ? String(v) : num(v)}
			words={year ? ["later", "earlier"] : key === "length" ? ["longer", "shorter"] : ["more", "fewer"]}
			delay={delay}
		/>
	);
}

function Reveal({ target: c, names }: { target: GuessCircuit; names: Names }) {
	const type = TYPE_LABEL[c.type];
	return (
		<>
			<div className="flex items-center gap-3">
				<Flag code={c.flag} className="text-3xl" />
				<div className="min-w-0">
					<ULink href={href.circuit(c.id)} data-card={`circuit:${c.id}`} className="block text-2xl font-semibold tracking-tight underline-offset-4 hover:underline">
						{c.fullName}
					</ULink>
					<div className="text-muted-foreground text-sm">
						{c.place}, {c.country} · {yearSpan(c.first, c.last)}
					</div>
				</div>
			</div>
			<div className="text-muted-foreground text-sm">
				{type.label} ({type.description}) · {c.clockwise ? "clockwise" : "anticlockwise"} · {km(c.length)} · {c.turns} turns
			</div>
			<dl className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
				<dt className="text-muted-foreground">Grands Prix</dt>
				<dd className="space-y-0.5">
					{c.grandsPrix.map((g) => (
						<div key={g.id}>
							<ULink href={href.grandPrix(g.id)} data-card={`grandPrix:${g.id}`} className="underline-offset-4 hover:underline">
								{names.grandsPrix[g.id] ?? g.id}
							</ULink>{" "}
							<span className="text-muted-foreground tabular-nums">
								{yearSpan(g.first, g.last)}
								{g.count > 1 && ` (${g.count})`}
							</span>
						</div>
					))}
				</dd>
				<dt className="text-muted-foreground max-sm:mt-1">Most wins</dt>
				<dd className="flex flex-wrap gap-x-1">
					{c.winners.map((w, i) => (
						<span key={w.id}>
							<ULink href={href.driver(w.id)} data-card={`driver:${w.id}`} className="underline-offset-4 hover:underline">
								{names.drivers[w.id] ?? w.id}
							</ULink>{" "}
							<span className="text-muted-foreground tabular-nums">{w.wins}</span>
							{i < c.winners.length - 1 && ","}
						</span>
					))}
				</dd>
			</dl>
			<Figures
				items={[
					["Grands Prix", c.races],
					["Length (km)", c.length],
					["Turns", c.turns],
				]}
			/>
		</>
	);
}
