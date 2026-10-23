"use client";

// Shared by "Guess the race" and "Lap chart mystery": the race catalogue loader, the race
// search box (year tokens like "05" or "1988" plus Grand Prix / circuit / country words),
// the guess board comparing each guessed race with the answer, its legend, and the race
// title used in both reveals. Logic lives in lib/game/race-guess.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronsDown, ChevronsUp, Globe, MapPin, Search, Users, X, type LucideIcon } from "lucide-react";
import {
	RACE_TILES,
	searchRaces,
	unpackRaces,
	type RaceCatalog,
	type RaceColumn,
	type RaceComparison,
	type RaceGuessFile,
	type RaceTile,
	type RgRace,
} from "@pitwall/core/game/race-guess";
import { cn } from "@/lib/utils";
import { fmtDate, Flag, href } from "../f1";
import { ULink } from "../universe-link";
import { Input } from "../ui/input";
import { ClueTile, Legend, LegendItem, verdictIcon } from "./kit";

/** The race catalogue (public/data/race-guess.json), fetched once per page load. */
export const loadRaceCatalog = (() => {
	let promise: Promise<RaceCatalog> | undefined;
	return () =>
		(promise ??= fetch("/data/race-guess.json")
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json() as Promise<RaceGuessFile>;
			})
			.then(unpackRaces)
			.catch((e) => {
				promise = undefined;
				throw e;
			}));
})();

/** "Japanese Grand Prix" → "Japanese GP" for tight spots. */
export const shortGp = (name: string) => name.replace(/ Grand Prix$/, " GP");

/* --------------------------------------------------------------- picker --- */

/**
 * A search box over races with a keyboard-navigable list (↑/↓, Enter, Escape). Each option is
 * just "2005 Japanese Grand Prix": the circuit, its flag or the round would answer clues and
 * hints. `races` must be memoised.
 */
export function RacePicker({
	races,
	exclude,
	onPick,
	placeholder = "Type a year, Grand Prix or circuit…",
	autoFocus = true,
}: {
	races: RgRace[];
	exclude: number[];
	onPick: (race: RgRace) => void;
	placeholder?: string;
	autoFocus?: boolean;
}) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const input = useRef<HTMLInputElement>(null);
	const id = useId();
	const hits = useMemo(() => searchRaces(races, query, new Set(exclude)), [races, query, exclude]);
	const show = open && query.trim().length > 0;

	useEffect(() => {
		if (autoFocus) input.current?.focus();
	}, [autoFocus]);

	const pick = (r: RgRace | undefined) => {
		if (!r) return;
		onPick(r);
		setQuery("");
		setActive(0);
		input.current?.focus();
	};

	return (
		<div className="relative">
			<Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
			<Input
				ref={input}
				role="combobox"
				aria-expanded={show}
				aria-controls={`${id}-list`}
				aria-autocomplete="list"
				aria-activedescendant={show && hits[active] ? `${id}-${hits[active].id}` : undefined}
				aria-label="Guess a race"
				placeholder={placeholder}
				autoComplete="off"
				spellCheck={false}
				className="h-11 pl-9 text-base md:text-base"
				value={query}
				onChange={(e) => {
					setQuery(e.target.value);
					setActive(0);
					setOpen(true);
				}}
				onFocus={() => setOpen(true)}
				onBlur={() => setOpen(false)}
				onKeyDown={(e) => {
					if (e.key === "ArrowDown" || e.key === "ArrowUp") {
						e.preventDefault();
						setOpen(true);
						if (hits.length) setActive((a) => (a + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length);
					} else if (e.key === "Enter") {
						e.preventDefault();
						if (show) pick(hits[active]);
					} else if (e.key === "Escape") {
						if (show) e.preventDefault();
						setOpen(false);
					}
				}}
			/>
			{show && (
				<ul
					id={`${id}-list`}
					role="listbox"
					aria-label="Races"
					className="bg-popover text-popover-foreground ring-foreground/10 animate-in fade-in-0 zoom-in-95 absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-2xl p-1 shadow-lg ring-1"
				>
					{hits.length ? (
						hits.map((r, i) => (
							<li
								key={r.id}
								id={`${id}-${r.id}`}
								role="option"
								aria-selected={i === active}
								onMouseDown={(e) => e.preventDefault()}
								onMouseMove={() => setActive(i)}
								onClick={() => pick(r)}
								className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm pointer-coarse:min-h-11", i === active && "bg-muted")}
							>
								<span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
							</li>
						))
					) : (
						<li className="text-muted-foreground px-3 py-2 text-sm">No race matches &ldquo;{query.trim()}&rdquo;</li>
					)}
				</ul>
			)}
			{show && hits.length > 0 && (
				<p className="sr-only" aria-live="polite">
					{hits.length} races found. Use the arrow keys and Enter to guess.
				</p>
			)}
		</div>
	);
}

/* ---------------------------------------------------------------- board --- */

/** Grid and race-name span per column count (static class names for Tailwind). */
const GRIDS: Record<number, { grid: string; span: string }> = {
	3: { grid: "grid grid-cols-3 gap-1 sm:grid-cols-[minmax(12rem,2.2fr)_repeat(3,minmax(0,1fr))] sm:gap-1.5", span: "col-span-3" },
	5: { grid: "grid grid-cols-5 gap-1 sm:grid-cols-[minmax(10rem,1.7fr)_repeat(5,minmax(0,1fr))] sm:gap-1.5", span: "col-span-5" },
};

/** Every guess so far (newest first), each compared tile by tile with the answer. */
export function RaceBoard({ rows, columns = RACE_TILES }: { rows: RaceComparison[]; columns?: RaceColumn[] }) {
	if (!rows.length) return null;
	const { grid: GRID, span } = GRIDS[columns.length] ?? GRIDS[5];
	return (
		<div className="space-y-2" role="table" aria-label="Your guesses">
			<div className={cn(GRID, "text-muted-foreground text-[11px] font-medium sm:text-xs")} role="row">
				<div className="hidden sm:block" role="columnheader">
					Race
				</div>
				{columns.map((a) => (
					<div key={a.key} className="truncate text-center" role="columnheader">
						<span className="sm:hidden">{a.short}</span>
						<span className="hidden sm:inline">{a.label}</span>
					</div>
				))}
			</div>
			{[...rows].reverse().map((r, i) => (
				<div key={r.guess.id} className={GRID} role="row">
					<div className={cn(span, "flex min-w-0 items-center gap-2 px-0.5 text-sm sm:col-span-1")} role="rowheader">
						<span className="text-muted-foreground w-4 shrink-0 text-xs tabular-nums">{rows.length - i}</span>
						<Flag code={r.guess.circuit.flag} />
						<ULink
							href={href.race(r.guess)}
							data-card={`race:${r.guess.year}-${r.guess.round}`}
							className="truncate font-medium underline-offset-4 hover:underline"
						>
							{r.guess.label}
						</ULink>
					</div>
					{r.tiles.map((t, j) => (
						<RaceTileView key={t.key} tile={t} attr={columns.find((c) => c.key === t.key)!} race={r.guess} delay={j * 90} />
					))}
				</div>
			))}
		</div>
	);
}

/** Close-tile icons for tiles without a direction. */
const CLOSE_ICON: Partial<Record<RaceTile["key"], LucideIcon>> = { grandPrix: Globe, circuit: MapPin, winner: Users };

function tileIcon(t: RaceTile): LucideIcon {
	if (t.direction && t.verdict !== "match") return t.far ? (t.direction === "higher" ? ChevronsUp : ChevronsDown) : t.direction === "higher" ? ArrowUp : ArrowDown;
	return verdictIcon(t.verdict, null, CLOSE_ICON[t.key]);
}

function RaceTileView({ tile, attr, race: r, delay }: { tile: RaceTile; attr: RaceColumn; race: RgRace; delay: number }) {
	// coarse columns (no amber state) must not describe the answer beyond match / miss / direction
	const coarse = !attr.close;
	const winner = r.top[0];
	let value: React.ReactNode;
	let text: string;
	let hint: string;
	const small = "max-w-full truncate text-[11px] font-semibold leading-tight sm:text-xs";
	if (tile.key === "year" || tile.key === "round") {
		const v = tile.key === "year" ? r.year : r.round;
		value = <span className="text-sm font-semibold tabular-nums sm:text-base">{v}</span>;
		text = String(v);
		const way = tile.key === "year" ? (tile.direction === "higher" ? "later" : "earlier") : tile.direction === "higher" ? "a later round" : "an earlier round";
		hint =
			tile.verdict === "match"
				? `${attr.label} ${v}: a match`
				: `${attr.label} ${v}: the mystery race is ${tile.key === "year" ? `${way}${tile.far ? ", by more than 10 years" : ""}` : way}${tile.verdict === "close" ? ` (${attr.close})` : ""}`;
	} else if (tile.key === "grandPrix") {
		value = (
			<>
				<Flag code={r.grandPrix.flag} className="text-sm sm:text-base" />
				<span className={cn(small, "hidden sm:block")}>{shortGp(r.grandPrix.name)}</span>
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
		value = <span className={cn(small, "px-0.5")}>{r.circuit.name}</span>;
		text = r.circuit.name;
		hint = tile.verdict === "match" ? `Same circuit: ${text}` : tile.verdict === "close" ? `${text}: another circuit in ${r.circuit.countryName}` : `Not ${text}, and another country`;
	} else {
		value = <span className={cn(small, "px-0.5")}>{winner?.driver.lastName ?? "–"}</span>;
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
	return (
		<ClueTile verdict={tile.verdict} icon={tileIcon(tile)} hint={hint} srText={`${attr.label} ${text}: ${tile.verdict}${tile.direction ? `, mystery race's is ${tile.direction}` : ""}`} delay={delay}>
			{value}
		</ClueTile>
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

/** The key under a board of coarse (match / miss only) columns, e.g. the lap chart mystery's. */
export function CoarseLegend() {
	return (
		<div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2 text-xs">
			<LegendItem verdict="match" icon={Check}>
				Match
			</LegendItem>
			<LegendItem verdict="miss" icon={X}>
				Miss
			</LegendItem>
			<LegendItem verdict="miss" icon={ArrowUp}>
				Year: the mystery race is later
			</LegendItem>
		</div>
	);
}

/* --------------------------------------------------------------- reveal --- */

/** The answer's title: flag, race name linking to its page, date and circuit. */
export function RaceTitle({ race: r }: { race: RgRace }) {
	return (
		<div className="flex items-center gap-3">
			<Flag code={r.circuit.flag} className="text-3xl" />
			<div className="min-w-0">
				<ULink
					href={href.race(r)}
					data-card={`race:${r.year}-${r.round}`}
					className="block text-xl font-semibold tracking-tight text-balance underline-offset-4 hover:underline sm:text-2xl"
				>
					{r.label}
				</ULink>
				<div className="text-muted-foreground text-sm">
					{fmtDate(r.date)} · Round {r.round} ·{" "}
					<ULink href={href.circuit(r.circuit.id)} data-card={`circuit:${r.circuit.id}`} className="underline-offset-4 hover:underline">
						{r.circuit.name}
					</ULink>
					{r.circuit.place && r.circuit.place !== r.circuit.name ? `, ${r.circuit.place}` : ""}
				</div>
			</div>
		</div>
	);
}
