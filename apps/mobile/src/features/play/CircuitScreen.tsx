// "Guess the circuit" (/play/circuit): the clue board over every track. The list is core's
// circuitFile built on the device; picks, comparisons and the share text come from core's
// game/circuit-guess. The country tile adds the distance and a compass arrow towards the answer.

import { ArrowUp, Check } from "lucide-react-native";
import { circuitFile } from "@pitwall/core/game/circuit-guess-data";
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
	type Comparison,
	type CountryTile,
	type GuessCircuit,
} from "@pitwall/core/game/circuit-guess";
import { compassPoint } from "@pitwall/core/game/clue";
import { Flag } from "@/components/f1";
import { Text } from "@/components/ui";
import { num } from "@/lib/format";
import { href } from "@/lib/links";
import { ClueGame, numberTile, yearSpan, type ClueGameConfig } from "./ClueGame";
import { dbLoader, Figures, TileText, useDbData, type ClueTileData } from "./kit";
import { Detail, LinkList, RevealTitle } from "./shared";

const load = dbLoader((db) => {
	const f = circuitFile(db);
	const list = f.circuits.map(unpack);
	return {
		list,
		byId: new Map(list.map((c) => [c.id, c])),
		items: list.map((c) => ({ id: c.id, label: c.alias ? `${c.name} (${c.alias})` : c.name, sublabel: c.place, weight: circuitWeight(c) })),
		grandsPrix: f.grandsPrix,
		drivers: f.drivers,
	};
});
type Names = { grandsPrix: Record<string, string>; drivers: Record<string, string> };

const column = (key: string) => ATTRIBUTES.find((a) => a.key === key)!;
const km = (n: number) => `${n.toLocaleString("en-GB", { maximumFractionDigits: 3 })} km`;
/** 8,820 km as "8.8k" for the narrow tiles (the hint spells it out). */
const shortKm = (n: number) => (n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 9950 ? 1 : 0)}k`);

function tile(row: Comparison, index: number): ClueTileData {
	const t = row.tiles[index]!;
	const c = row.guess;
	if (t.key === "country") {
		const { km: d, bearing } = t as CountryTile;
		const where = row.correct ? "" : ` The mystery circuit is ${num(d)} km ${compassPoint(bearing)}.`;
		const same = t.verdict === "match" ? `Same country: ${c.country}.` : t.verdict === "close" ? `${c.country}: same continent.` : `Not ${c.country}, and another continent.`;
		return {
			key: t.key,
			verdict: t.verdict,
			icon: row.correct ? Check : ArrowUp,
			iconRotation: row.correct ? undefined : bearing,
			hint: `${same}${where}`,
			srText: `Country ${c.country}: ${t.verdict}.${where}`,
			content: (
				<>
					<Flag code={c.flag} className="text-[14px] leading-[18px]" />
					{row.correct ? null : <TileText className="text-[10px]">{shortKm(d)}</TileText>}
				</>
			),
		};
	}
	if (t.key === "type") {
		const type = TYPE_LABEL[c.type];
		return {
			key: t.key,
			verdict: t.verdict,
			hint: `${type.label}: ${type.description}. ${t.verdict === "match" ? "Same type as the mystery circuit." : "The mystery circuit is another type."}`,
			srText: `Type ${type.label}: ${t.verdict}`,
			content: <TileText>{type.label}</TileText>,
		};
	}
	const key = t.key as "length" | "turns" | "first" | "races" | "last";
	const v = c[key];
	const year = key === "first" || key === "last";
	return numberTile(
		t,
		column(key),
		"circuit",
		key === "length" ? km(v) : year ? String(v) : num(v),
		<TileText strong className={key === "length" ? "text-[12px]" : undefined}>
			{key === "length" ? v.toFixed(2) : year ? String(v) : num(v)}
		</TileText>,
		year ? ["later", "earlier"] : key === "length" ? ["longer", "shorter"] : ["more", "fewer"],
	);
}

function Reveal({ target: c, names }: { target: GuessCircuit; names: Names }) {
	const type = TYPE_LABEL[c.type];
	return (
		<>
			<RevealTitle flag={c.flag} title={c.fullName} subtitle={`${c.place}, ${c.country} · ${yearSpan(c.first, c.last)}`} href={href.circuit(c.id)} />
			<Text variant="muted">{`${type.label} (${type.description}) · ${c.clockwise ? "clockwise" : "anticlockwise"} · ${km(c.length)} · ${c.turns} turns`}</Text>
			<Detail label="Grands Prix">
				<LinkList
					items={c.grandsPrix.map((gp) => ({
						key: gp.id,
						href: href.grandPrix(gp.id),
						label: names.grandsPrix[gp.id] ?? gp.id,
						extra: `${yearSpan(gp.first, gp.last)}${gp.count > 1 ? ` (${gp.count})` : ""}`,
					}))}
				/>
			</Detail>
			<Detail label="Most wins">
				<LinkList items={c.winners.map((w) => ({ key: w.id, href: href.driver(w.id), label: names.drivers[w.id] ?? w.id, extra: String(w.wins) }))} />
			</Detail>
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

const makeConfig = (names: Names): ClueGameConfig<GuessCircuit, Comparison> => ({
	game: "circuit",
	title: "Guess the circuit",
	noun: "circuit",
	what: "the circuits",
	clues: "country (with the distance and direction to the mystery circuit), layout and Grand Prix history",
	difficulties: DIFFICULTIES,
	columns: ATTRIBUTES,
	dailyTarget,
	randomTarget,
	compare,
	shareText,
	href: (c) => href.circuit(c.id),
	tile,
	legend: {
		close: "Close: same continent, or within 0.5 km, 2 turns, 5 years or 5 Grands Prix",
		direction: "The mystery circuit's number is higher (double arrow: by a lot). The country tile points towards it",
	},
	reveal: (c) => <Reveal target={c} names={names} />,
});

const NO_NAMES: Names = { grandsPrix: {}, drivers: {} };
const configs = new WeakMap<Names, ClueGameConfig<GuessCircuit, Comparison>>();
const configFor = (names: Names) => {
	let c = configs.get(names);
	if (!c) configs.set(names, (c = makeConfig(names)));
	return c;
};

export function CircuitScreen() {
	const { data, error, retry } = useDbData(load);
	return <ClueGame config={configFor(data ?? NO_NAMES)} data={data} error={error} retry={retry} />;
}
