// "Guess the constructor" (/play/constructor): the clue board over every team. The list is
// core's constructorFile built on the device; picks, comparisons and the share text come from
// core's game/constructor-guess.

import { Cog, Globe } from "lucide-react-native";
import { constructorFile } from "@pitwall/core/game/constructor-guess-data";
import {
	ATTRIBUTES,
	compare,
	constructorWeight,
	dailyTarget,
	DIFFICULTIES,
	randomTarget,
	shareText,
	unpack,
	type Comparison,
	type GuessConstructor,
} from "@pitwall/core/game/constructor-guess";
import { Flag } from "@/components/f1";
import { num } from "@/lib/format";
import { href } from "@/lib/links";
import { ClueGame, numberTile, yearSpan, type ClueGameConfig } from "./ClueGame";
import { dbLoader, Figures, TileText, useDbData, verdictIcon, type ClueTileData } from "./kit";
import { Detail, LinkList, RevealTitle } from "./shared";

const load = dbLoader((db) => {
	const f = constructorFile(db);
	const list = f.constructors.map(unpack);
	return {
		list,
		byId: new Map(list.map((c) => [c.id, c])),
		items: list.map((c) => ({ id: c.id, label: c.name, sublabel: yearSpan(c.first, c.last), weight: constructorWeight(c) })),
		engines: f.engines,
		drivers: f.drivers,
	};
});
type Names = { engines: Record<string, string>; drivers: Record<string, string> };

const column = (key: string) => ATTRIBUTES.find((a) => a.key === key)!;

function tile(row: Comparison, index: number, names: Names): ClueTileData {
	const engineName = (id: string) => names.engines[id] ?? id;
	const t = row.tiles[index]!;
	const c = row.guess;
	if (t.key === "nation") {
		return {
			key: t.key,
			verdict: t.verdict,
			icon: verdictIcon(t.verdict, null, Globe),
			hint: t.verdict === "match" ? `Same nationality: ${c.nation}` : t.verdict === "close" ? `${c.nation}: same continent` : `Not ${c.nation}, and another continent`,
			srText: `Nationality ${c.nation}: ${t.verdict}`,
			content: <Flag code={c.flag} className="text-[16px] leading-5" />,
		};
	}
	if (t.key === "engines") {
		const shared = "shared" in t ? t.shared : [];
		const main = c.engines[0]!;
		const more = c.engines.length - 1;
		const list = c.engines.map(engineName).join(", ");
		return {
			key: t.key,
			verdict: t.verdict,
			icon: verdictIcon(t.verdict, null, Cog),
			hint: `Main engine: ${engineName(main)}${more > 0 ? `. Also ${c.engines.slice(1).map(engineName).join(", ")}` : ""}. ${
				t.verdict === "match" ? "Same main engine as the mystery constructor." : shared.length ? `In common: ${shared.map(engineName).join(", ")}.` : "No engine maker in common."
			}`,
			srText: `Engines ${list}: ${t.verdict}`,
			content: (
				<>
					<TileText>{engineName(main)}</TileText>
					{more > 0 ? <TileText className="text-[10px] font-normal">{`+${more}`}</TileText> : null}
				</>
			),
		};
	}
	const key = t.key as "first" | "last" | "starts" | "wins" | "titles";
	const v = c[key];
	const year = key === "first" || key === "last";
	const text = year ? String(v) : num(v);
	return numberTile(t, column(key), "constructor", text, <TileText strong>{text}</TileText>, year ? ["later", "earlier"] : ["more", "fewer"]);
}

function Reveal({ target: c, names }: { target: GuessConstructor; names: Names }) {
	return (
		<>
			<RevealTitle flag={c.flag} title={c.name} subtitle={`${c.nation} · ${yearSpan(c.first, c.last)}`} href={href.team(c.id)} />
			<Detail label="Engines">
				<LinkList items={c.engines.map((e) => ({ key: e, href: href.engine(e), label: names.engines[e] ?? e }))} />
			</Detail>
			<Detail label="Notable drivers">
				<LinkList items={c.drivers.map((d) => ({ key: d, href: href.driver(d), label: names.drivers[d] ?? d }))} />
			</Detail>
			<Figures
				items={[
					["Races", c.starts],
					["Wins", c.wins],
					["Podiums", c.podiums],
					["Poles", c.poles],
					["Titles", c.titles],
				]}
			/>
		</>
	);
}

const makeConfig = (names: Names): ClueGameConfig<GuessConstructor, Comparison> => ({
	game: "constructor",
	title: "Guess the constructor",
	noun: "constructor",
	what: "the constructors",
	clues: "nationality, years, engines and results",
	difficulties: DIFFICULTIES,
	columns: ATTRIBUTES,
	dailyTarget,
	randomTarget,
	compare,
	shareText,
	href: (c) => href.team(c.id),
	tile: (row, i) => tile(row, i, names),
	legend: {
		close: "Close: same continent, an engine maker in common, or within 5 seasons, 50 races or 5 wins",
		direction: "The mystery constructor's number is higher (double arrow: by a lot)",
	},
	reveal: (c) => <Reveal target={c} names={names} />,
});

const NO_NAMES: Names = { engines: {}, drivers: {} };
const configs = new WeakMap<Names, ClueGameConfig<GuessConstructor, Comparison>>();
const configFor = (names: Names) => {
	let c = configs.get(names);
	if (!c) configs.set(names, (c = makeConfig(names)));
	return c;
};

export function ConstructorScreen() {
	const { data, error, retry } = useDbData(load);
	return <ClueGame config={configFor(data ?? NO_NAMES)} data={data} error={error} retry={retry} />;
}
