"use client";

// Daily "Guess the constructor" game (/play/constructor). The team list is a static file
// (public/data/constructor-guess.json); the day's mystery team, the comparisons and the share
// text come from lib/game/constructor-guess. The page shell is the shared clue board.

import { useMemo } from "react";
import { Cog, Globe } from "lucide-react";
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
	type ConstructorFile,
	type GuessConstructor,
} from "@pitwall/core/game/constructor-guess";
import { Flag, href, num } from "../f1";
import { ULink } from "../universe-link";
import { ClueGame, NumberTile, yearSpan, type ClueData, type ClueGameConfig } from "./clue-board";
import { ClueTile, Figures, jsonLoader, useGameData, verdictIcon } from "./kit";

type Data = ClueData<GuessConstructor> & { engines: Record<string, string>; drivers: Record<string, string> };

const loadData = jsonLoader("/data/constructor-guess.json", (f: ConstructorFile): Data => {
	const list = f.constructors.map(unpack);
	return { list, byId: new Map(list.map((c) => [c.id, c])), engines: f.engines, drivers: f.drivers };
});

type Names = Pick<Data, "engines" | "drivers">;
const NO_NAMES: Names = { engines: {}, drivers: {} };
const span = (c: GuessConstructor) => yearSpan(c.first, c.last);
const column = (key: string) => ATTRIBUTES.find((a) => a.key === key)!;

const makeConfig = (names: Names): ClueGameConfig<GuessConstructor, Comparison> => ({
	game: "constructor",
	title: "Guess the constructor",
	noun: "constructor",
	what: "the constructors",
	clues: "nationality, years, engines and results",
	difficulties: DIFFICULTIES,
	columns: ATTRIBUTES,
	nameHeader: "Constructor",
	dailyTarget,
	randomTarget,
	compare,
	shareText,
	rowName: (c) => (
		<ULink href={href.team(c.id)} data-card={`team:${c.id}`} className="truncate font-medium underline-offset-4 hover:underline">
			{c.name}
		</ULink>
	),
	tile: (row, i, delay) => <ConstructorTile row={row} index={i} delay={delay} names={names} />,
	legend: {
		close: "Close: same continent, an engine maker in common, or within 5 seasons, 50 races or 5 wins",
		direction: "The mystery constructor's number is higher (double arrow: by a lot)",
	},
	reveal: (c) => <Reveal target={c} names={names} />,
});

export function ConstructorGame() {
	const { data, error, retry } = useGameData(loadData);
	const config = useMemo(() => makeConfig(data ?? NO_NAMES), [data]);
	const items = useMemo(
		() => data?.list.map((c) => ({ id: c.id, label: c.name, sublabel: span(c), weight: constructorWeight(c) })) ?? [],
		[data],
	);
	return <ClueGame config={config} data={data} error={error} retry={retry} items={items} />;
}

function ConstructorTile({ row, index, delay, names }: { row: Comparison; index: number; delay: number; names: Names }) {
	const engineName = (id: string) => names.engines[id] ?? id;
	const tile = row.tiles[index];
	const c = row.guess;
	const col = column(tile.key);
	if (tile.key === "nation") {
		return (
			<ClueTile
				verdict={tile.verdict}
				icon={verdictIcon(tile.verdict, null, Globe)}
				hint={tile.verdict === "match" ? `Same nationality: ${c.nation}` : tile.verdict === "close" ? `${c.nation}: same continent` : `Not ${c.nation}, and another continent`}
				srText={`Nationality ${c.nation}: ${tile.verdict}`}
				delay={delay}
			>
				<Flag code={c.flag} className="text-base sm:text-lg" />
				<span className="hidden max-w-full truncate text-[11px] font-medium sm:block">{c.nation}</span>
			</ClueTile>
		);
	}
	if (tile.key === "engines") {
		const shared = "shared" in tile ? tile.shared : [];
		const main = c.engines[0];
		const more = c.engines.length - 1;
		const list = c.engines.map(engineName).join(", ");
		return (
			<ClueTile
				verdict={tile.verdict}
				icon={verdictIcon(tile.verdict, null, Cog)}
				hint={
					<div className="max-w-64 space-y-1">
						<div>
							Main engine: {engineName(main)}
							{more > 0 && `. Also ${c.engines.slice(1).map(engineName).join(", ")}`}.
						</div>
						<div>
							{tile.verdict === "match"
								? "Same main engine as the mystery constructor."
								: shared.length
									? `In common: ${shared.map(engineName).join(", ")}.`
									: "No engine maker in common."}
						</div>
					</div>
				}
				srText={`Engines ${list}: ${tile.verdict}`}
				delay={delay}
			>
				<span className="flex max-w-full min-w-0 flex-col items-center leading-tight">
					<span className="max-w-full truncate text-[11px] font-semibold sm:text-xs">{engineName(main)}</span>
					{more > 0 && <span className="text-[10px] opacity-80">+{more}</span>}
				</span>
			</ClueTile>
		);
	}
	const key = tile.key as "first" | "last" | "starts" | "wins" | "titles";
	const v = c[key];
	const year = key === "first" || key === "last";
	return (
		<NumberTile
			tile={tile}
			column={col}
			noun="constructor"
			value={year ? v : num(v)}
			text={year ? String(v) : num(v)}
			words={year ? ["later", "earlier"] : ["more", "fewer"]}
			delay={delay}
		/>
	);
}

function Reveal({ target: c, names }: { target: GuessConstructor; names: Names }) {
	const engineName = (id: string) => names.engines[id] ?? id;
	return (
		<>
			<div className="flex items-center gap-3">
				<Flag code={c.flag} className="text-3xl" />
				<div className="min-w-0">
					<ULink href={href.team(c.id)} data-card={`team:${c.id}`} className="block truncate text-2xl font-semibold tracking-tight underline-offset-4 hover:underline">
						{c.name}
					</ULink>
					<div className="text-muted-foreground text-sm">
						{c.nation} · {span(c)}
					</div>
				</div>
			</div>
			<dl className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
				<dt className="text-muted-foreground">Engines</dt>
				<dd className="flex flex-wrap gap-x-1">
					{c.engines.map((e, i) => (
						<span key={e}>
							<ULink href={href.engine(e)} data-card={`engine:${e}`} className="underline-offset-4 hover:underline">
								{engineName(e)}
							</ULink>
							{i < c.engines.length - 1 && ","}
						</span>
					))}
				</dd>
				<dt className="text-muted-foreground max-sm:mt-1">Notable drivers</dt>
				<dd className="flex flex-wrap gap-x-1">
					{c.drivers.map((d, i) => (
						<span key={d}>
							<ULink href={href.driver(d)} data-card={`driver:${d}`} className="underline-offset-4 hover:underline">
								{names.drivers[d] ?? d}
							</ULink>
							{i < c.drivers.length - 1 && ","}
						</span>
					))}
				</dd>
			</dl>
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
