"use client";

// Football Manager style preview cards: hover any driver, constructor, circuit, race,
// engine, tyre, Grand Prix, nation or season link (they carry `data-card="<kind>:<id>"`)
// to see a summary. One card for the whole page, positioned against whichever link is
// hovered, so tables with hundreds of links cost nothing extra. Real history reads
// public/data/cards.json (race-cards.json for races, more-cards.json for the rest);
// inside a universe the cards are computed from the universe's own results.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import { Timer, Trophy } from "lucide-react";
import type {
	CardKind,
	CardRef,
	CardsFile,
	CircuitCard,
	DriverCard,
	EntityCard,
	GrandPrixCard,
	MoreCardKind,
	MoreCardsFile,
	NationCard,
	PackedRace,
	RaceCard,
	RaceCardsFile,
	SeasonCard,
	SupplierCard,
	TeamCard,
} from "@pitwall/core/f1/cards";
import { expandRaceCard } from "@pitwall/core/f1/cards-expand";
import { diarySlug } from "@pitwall/core/f1/diary-dates";
import { Flag, Pos, fmtDate, num } from "./f1";
import { useActiveUniverse } from "./universe-link";
import { Spinner } from "./ui/spinner";

const OPEN_DELAY = 450;
/** Moving straight from one link to another while a card is open. */
const SWITCH_DELAY = 120;
const CLOSE_DELAY = 200;

function fileLoader<T>(url: string) {
	let promise: Promise<T> | undefined;
	return () =>
		(promise ??= fetch(url)
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json() as Promise<T>;
			})
			.catch((e) => {
				promise = undefined;
				throw e;
			}));
}
const loadFile = fileLoader<CardsFile>("/data/cards.json");
const loadRaces = fileLoader<RaceCardsFile>("/data/race-cards.json");
const loadMore = fileLoader<MoreCardsFile>("/data/more-cards.json");

/** A card from the static files (real history). */
async function staticCard(kind: CardKind, id: string): Promise<EntityCard | null> {
	if (kind in MORE_KEY) return ((await loadMore())[MORE_KEY[kind as MoreCardKind]] as Record<string, EntityCard>)[id] ?? null;
	const cards = await loadFile();
	if (kind !== "race") return (cards[KEY[kind as keyof typeof KEY]] as Record<string, EntityCard>)[id] ?? null;
	const packed: PackedRace | undefined = (await loadRaces())[id];
	return packed ? expandRaceCard(id, packed, cards) : null;
}
const preload = (kind: CardKind) => (kind in MORE_KEY ? loadMore() : kind === "race" ? loadRaces() : loadFile());

type Target = { el: Element; kind: CardKind; id: string };
const KEY = { driver: "d", team: "t", circuit: "c" } as const satisfies Record<string, keyof CardsFile>;
const MORE_KEY: Record<MoreCardKind, keyof MoreCardsFile> = { engine: "e", tyre: "y", grandPrix: "g", nation: "n", season: "s" };

export function EntityCards() {
	const pathname = usePathname();
	const universeId = pathname.match(/^\/u\/([^/]+)/)?.[1] ?? null;
	const prefix = universeId ? `/u/${universeId}` : "";
	const universe = useActiveUniverse(universeId);
	const [target, setTarget] = useState<Target | null>(null);
	const [card, setCard] = useState<EntityCard | null | undefined>(undefined);
	const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const current = useRef<Target | null>(null);
	current.current = target;

	const cancelClose = () => clearTimeout(closeTimer.current);
	const scheduleClose = useCallback(() => {
		clearTimeout(openTimer.current);
		clearTimeout(closeTimer.current);
		closeTimer.current = setTimeout(() => setTarget(null), CLOSE_DELAY);
	}, []);

	useEffect(() => {
		const over = (e: PointerEvent) => {
			if (e.pointerType !== "mouse") return;
			const el = (e.target as Element | null)?.closest?.("[data-card]");
			if (!el) return;
			const [kind, ...rest] = el.getAttribute("data-card")!.split(":");
			const next = { el, kind: kind as CardKind, id: rest.join(":") };
			if (current.current?.el === el) return cancelClose();
			if (!universeId) preload(next.kind).catch(() => {});
			clearTimeout(openTimer.current);
			cancelClose();
			openTimer.current = setTimeout(() => setTarget(next), current.current ? SWITCH_DELAY : OPEN_DELAY);
		};
		const out = (e: PointerEvent) => {
			const el = (e.target as Element | null)?.closest?.("[data-card]");
			if (!el || el.contains(e.relatedTarget as Node | null)) return;
			if (el === current.current?.el) scheduleClose();
			else clearTimeout(openTimer.current);
		};
		const hide = () => {
			clearTimeout(openTimer.current);
			setTarget(null);
		};
		document.addEventListener("pointerover", over);
		document.addEventListener("pointerout", out);
		document.addEventListener("pointerdown", hide, true);
		return () => {
			document.removeEventListener("pointerover", over);
			document.removeEventListener("pointerout", out);
			document.removeEventListener("pointerdown", hide, true);
		};
	}, [universeId, scheduleClose]);

	// close on navigation
	useEffect(() => setTarget(null), [pathname]);

	useEffect(() => {
		if (!target) return;
		let live = true;
		setCard(undefined);
		const { kind, id } = target;
		const found = universeId
			? universe
				? import("@pitwall/core/f1/cards").then((m) => m.entityCard(universe.db, kind, id))
				: Promise.resolve(undefined)
			: staticCard(kind, id);
		found.then((c) => live && setCard(c)).catch(() => live && setCard(null));
		return () => {
			live = false;
		};
	}, [target, universe, universeId]);

	const open = !!target && card !== null;
	return (
		<PreviewCardPrimitive.Root open={open} onOpenChange={(o) => !o && setTarget(null)}>
			<PreviewCardPrimitive.Portal>
				<PreviewCardPrimitive.Positioner anchor={target?.el} side="bottom" align="start" sideOffset={6} collisionPadding={12} className="isolate z-[100]">
					<PreviewCardPrimitive.Popup
						onPointerEnter={cancelClose}
						onPointerLeave={scheduleClose}
						className="bg-popover text-popover-foreground ring-foreground/5 dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 w-80 origin-(--transform-origin) rounded-2xl p-4 text-sm shadow-lg ring-1 outline-hidden duration-100"
					>
						{card === undefined ? (
							<div className="text-muted-foreground flex items-center gap-2 py-2">
								<Spinner /> Loading
							</div>
						) : card?.kind === "driver" ? (
							<DriverCardView card={card} prefix={prefix} />
						) : card?.kind === "team" ? (
							<TeamCardView card={card} prefix={prefix} />
						) : card?.kind === "circuit" ? (
							<CircuitCardView card={card} prefix={prefix} />
						) : card?.kind === "race" ? (
							<RaceCardView card={card} prefix={prefix} />
						) : card?.kind === "engine" || card?.kind === "tyre" ? (
							<SupplierCardView card={card} prefix={prefix} />
						) : card?.kind === "grandPrix" ? (
							<GrandPrixCardView card={card} prefix={prefix} />
						) : card?.kind === "nation" ? (
							<NationCardView card={card} prefix={prefix} />
						) : card?.kind === "season" ? (
							<SeasonCardView card={card} prefix={prefix} />
						) : null}
					</PreviewCardPrimitive.Popup>
				</PreviewCardPrimitive.Positioner>
			</PreviewCardPrimitive.Portal>
		</PreviewCardPrimitive.Root>
	);
}

/* ---------------------------------------------------------------- cards --- */

/** `flag` undefined leaves the flag out (seasons). */
function Header({ flag, title, subtitle, titles }: { flag?: string | null; title: string; subtitle?: React.ReactNode; titles?: number[] }) {
	return (
		<div className="flex items-start gap-3">
			{flag !== undefined && <Flag code={flag} className="mt-1 text-xl" />}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-base font-semibold">{title}</span>
					{!!titles?.length && (
						<span className="text-gold inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold">
							<Trophy className="size-3.5" />
							{titles.length > 1 && `×${titles.length}`}
						</span>
					)}
				</div>
				{subtitle && <div className="text-muted-foreground text-xs">{subtitle}</div>}
			</div>
		</div>
	);
}

function Stats({ items }: { items: [string, React.ReactNode][] }) {
	return (
		<dl className="bg-muted/50 grid grid-cols-4 gap-px overflow-hidden rounded-xl">
			{items.map(([label, value]) => (
				<div key={label} className="px-2 py-1.5 text-center">
					<dd className="font-semibold tabular-nums">{value}</dd>
					<dt className="text-muted-foreground text-[10px] tracking-wide uppercase">{label}</dt>
				</div>
			))}
		</dl>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex gap-3 text-xs">
			<span className="text-muted-foreground w-24 shrink-0">{label}</span>
			<span className="min-w-0 flex-1">{children}</span>
		</div>
	);
}

const linkCls = "font-medium underline-offset-4 hover:underline";
const subtle = "underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 hover:text-foreground hover:decoration-solid";

/** A date, linking to that day in the diary. */
function Day({ iso, prefix, className }: { iso: string; prefix: string; className?: string }) {
	const d = new Date(iso + "T00:00:00Z");
	return (
		<Link href={`${prefix}/diary/${diarySlug(d.getUTCMonth() + 1, d.getUTCDate())}`} className={className ?? subtle}>
			{fmtDate(iso)}
		</Link>
	);
}

function NationRef({ id, name, prefix }: { id: string | null; name: string | null; prefix: string }) {
	if (!name) return null;
	return id ? (
		<Link href={`${prefix}/nations/${id}`} className={subtle}>
			{name}
		</Link>
	) : (
		<>{name}</>
	);
}

function SeasonRef({ year, prefix }: { year: number; prefix: string }) {
	return (
		<Link href={`${prefix}/seasons/${year}`} className={subtle}>
			{year}
		</Link>
	);
}

/** "2007–2026" with each end linking to its season. */
function Years({ years, prefix }: { years: [number, number] | null; prefix: string }) {
	if (!years) return null;
	if (years[0] === years[1]) return <SeasonRef year={years[0]} prefix={prefix} />;
	return (
		<>
			<SeasonRef year={years[0]} prefix={prefix} />–<SeasonRef year={years[1]} prefix={prefix} />
		</>
	);
}

/** Parts of a subtitle joined with " · ", skipping empty ones. */
function Dotted({ parts }: { parts: React.ReactNode[] }) {
	const shown = parts.filter((p) => p != null && p !== false && p !== "");
	return (
		<>
			{shown.map((p, i) => (
				<span key={i}>
					{i > 0 && " · "}
					{p}
				</span>
			))}
		</>
	);
}

function Refs({ items, path, prefix }: { items: (CardRef & { n?: number })[]; path: string; prefix: string }) {
	return (
		<>
			{items.map((r, i) => (
				<span key={r.id}>
					{i > 0 && ", "}
					<Link href={`${prefix}${path}${r.id}`} className={linkCls}>
						{r.name}
					</Link>
					{r.n != null && <span className="text-muted-foreground"> ({r.n})</span>}
				</span>
			))}
		</>
	);
}

/** "+3 more" after a shortened list. */
function More({ shown, total }: { shown: number; total: number }) {
	return total > shown ? <span className="text-muted-foreground"> +{total - shown} more</span> : null;
}

/** "2010–13, 2015" style list of title years. */
function yearList(years: number[]) {
	const runs: [number, number][] = [];
	for (const y of years) {
		const last = runs[runs.length - 1];
		if (last && last[1] === y - 1) last[1] = y;
		else runs.push([y, y]);
	}
	return runs.map(([a, b]) => (a === b ? String(a) : `${a}–${String(b).slice(-2)}`)).join(", ");
}
const ageNow = (born: string) => ageAt(born, new Date().toISOString().slice(0, 10));
function ageAt(born: string, on: string) {
	const b = new Date(born + "T00:00:00Z");
	const now = new Date(on + "T00:00:00Z");
	let age = now.getUTCFullYear() - b.getUTCFullYear();
	if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) age--;
	return age;
}

function DriverCardView({ card: d, prefix }: { card: DriverCard; prefix: string }) {
	return (
		<div className="space-y-3">
			<Header
				flag={d.flag}
				title={d.name}
				subtitle={
					<Dotted parts={[d.nation && <NationRef id={d.nationId} name={d.nation} prefix={prefix} />, d.years && <Years years={d.years} prefix={prefix} />]} />
				}
				titles={d.titleYears}
			/>
			<Stats
				items={[
					["Starts", d.starts],
					["Wins", d.wins],
					["Podiums", d.podiums],
					["Poles", d.poles],
				]}
			/>
			<div className="space-y-1.5">
				{d.titleYears.length > 0 && <Row label="Champion">{yearList(d.titleYears)}</Row>}
				{d.teams.length > 0 && (
					<Row label={d.years && d.years[1] >= new Date().getFullYear() ? "Drives for" : "Last drove for"}>
						<Refs items={d.teams} path="/constructors/" prefix={prefix} />
					</Row>
				)}
				{!d.wins && d.bestFinish != null && <Row label="Best finish">{ordinal(d.bestFinish)}</Row>}
				<Row label="Points">{num(d.points)}</Row>
				{d.born && (
					<Row label="Born">
						<Day iso={d.born} prefix={prefix} />
						{!d.died && new Date(d.born) <= new Date() && <span className="text-muted-foreground"> (age {ageNow(d.born)})</span>}
					</Row>
				)}
				{d.died && (
					<Row label="Died">
						<Day iso={d.died} prefix={prefix} />
						{d.born && <span className="text-muted-foreground"> (aged {ageAt(d.born, d.died)})</span>}
					</Row>
				)}
				{d.placeOfBirth && <Row label="From">{d.placeOfBirth}</Row>}
			</div>
		</div>
	);
}

function TeamCardView({ card: t, prefix }: { card: TeamCard; prefix: string }) {
	return (
		<div className="space-y-3">
			<Header
				flag={t.flag}
				title={t.name}
				subtitle={
					<Dotted
						parts={[
							t.fullName ?? (t.nation && <NationRef id={t.nationId} name={t.nation} prefix={prefix} />),
							t.years && <Years years={t.years} prefix={prefix} />,
						]}
					/>
				}
				titles={t.titleYears}
			/>
			<Stats
				items={[
					["Races", t.starts],
					["Wins", t.wins],
					["Podiums", t.podiums],
					["Poles", t.poles],
				]}
			/>
			<div className="space-y-1.5">
				{t.titleYears.length > 0 && <Row label="Champions">{yearList(t.titleYears)}</Row>}
				{t.driverTitles > 0 && <Row label="Drivers' titles">{t.driverTitles}</Row>}
				{t.drivers.length > 0 && (
					<Row label={t.years && t.years[1] >= new Date().getFullYear() ? "Drivers" : "Last drivers"}>
						<Refs items={t.drivers} path="/drivers/" prefix={prefix} />
					</Row>
				)}
				{t.engine && <Row label="Engine">{t.engine}</Row>}
				{t.fullName && t.nation && (
					<Row label="Nationality">
						<NationRef id={t.nationId} name={t.nation} prefix={prefix} />
					</Row>
				)}
			</div>
		</div>
	);
}

function CircuitCardView({ card: c, prefix }: { card: CircuitCard; prefix: string }) {
	return (
		<div className="space-y-3">
			<Header
				flag={c.flag}
				title={c.name}
				subtitle={
					<>
						{c.place}
						{c.place && c.nation && ", "}
						<NationRef id={c.nationId} name={c.nation} prefix={prefix} />
					</>
				}
			/>
			<Stats
				items={[
					["Races", c.races],
					["Km", c.length ? c.length.toFixed(2) : "–"],
					["Turns", c.turns || "–"],
					["Since", c.years ? <SeasonRef year={c.years[0]} prefix={prefix} /> : "–"],
				]}
			/>
			<div className="space-y-1.5">
				<Row label="Layout">{c.type === "STREET" ? "Street circuit" : c.type === "ROAD" ? "Road course" : "Race circuit"}</Row>
				{c.topWinner && (
					<Row label="Most wins">
						<Refs items={[c.topWinner]} path="/drivers/" prefix={prefix} /> <span className="text-muted-foreground">({c.topWinner.wins})</span>
					</Row>
				)}
				{c.lastWinner && (
					<Row label="Last winner">
						<Refs items={[c.lastWinner]} path="/drivers/" prefix={prefix} />{" "}
						<span className="text-muted-foreground">
							(<SeasonRef year={c.lastWinner.year} prefix={prefix} />)
						</span>
					</Row>
				)}
			</div>
		</div>
	);
}

function RaceCardView({ card: r, prefix }: { card: RaceCard; prefix: string }) {
	return (
		<div className="space-y-3">
			<Header
				flag={r.flag}
				title={`${r.year} ${r.name}`}
				subtitle={
					<Dotted
						parts={[
							<span key="r">
								Round {r.round} of {r.rounds}, <SeasonRef year={r.year} prefix={prefix} />
							</span>,
							<Day key="d" iso={r.date} prefix={prefix} className={subtle} />,
						]}
					/>
				}
			/>
			{r.upcoming ? (
				<p className="text-muted-foreground bg-muted/50 rounded-xl px-3 py-2 text-xs">Not run yet.</p>
			) : (
				<ol className="bg-muted/50 space-y-1.5 rounded-xl px-3 py-2.5">
					{r.podium.map((p, i) => (
						<li key={p.driver.id} className="flex items-center gap-2.5">
							<Pos text={String(i + 1)} className="min-w-6" />
							<div className="min-w-0 flex-1 leading-tight">
								<Refs items={[p.driver]} path="/drivers/" prefix={prefix} />
								<div className="text-muted-foreground truncate text-[11px]">
									<Refs items={[p.team]} path="/constructors/" prefix={prefix} />
								</div>
							</div>
							{p.time && <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{p.time}</span>}
						</li>
					))}
				</ol>
			)}
			<div className="space-y-1.5">
				<Row label="Circuit">
					<Refs items={[r.circuit]} path="/circuits/" prefix={prefix} />
					{r.circuit.place && r.circuit.place !== r.circuit.name && <span className="text-muted-foreground">, {r.circuit.place}</span>}
				</Row>
				{r.pole && (
					<Row label="Pole">
						<Refs items={[r.pole]} path="/drivers/" prefix={prefix} />
					</Row>
				)}
				{r.fastestLap && (
					<Row label="Fastest lap">
						<Refs items={[r.fastestLap]} path="/drivers/" prefix={prefix} />
						{r.fastestLap.time && (
							<span className="text-muted-foreground ml-1.5 inline-flex items-center gap-1 tabular-nums">
								<Timer className="size-3" />
								{r.fastestLap.time}
							</span>
						)}
					</Row>
				)}
				{r.sprintWinner && (
					<Row label="Sprint winner">
						<Refs items={[r.sprintWinner]} path="/drivers/" prefix={prefix} />
					</Row>
				)}
				{r.laps > 0 && (
					<Row label="Distance">
						{r.laps} laps · {num(Math.round(r.distance * 10) / 10)} km
					</Row>
				)}
			</div>
		</div>
	);
}

function SupplierCardView({ card: e, prefix }: { card: SupplierCard; prefix: string }) {
	const won = e.wins > 0;
	return (
		<div className="space-y-3">
			<Header
				flag={e.flag}
				title={e.name}
				subtitle={<Dotted parts={[e.kind === "tyre" ? "Tyres" : "Engines", e.nation && <NationRef id={e.nationId} name={e.nation} prefix={prefix} />, e.years && <Years years={e.years} prefix={prefix} />]} />}
				titles={e.titleYears}
			/>
			<Stats
				items={[
					["Races", e.races],
					["Wins", e.wins],
					["Podiums", e.podiums],
					["Poles", e.poles],
				]}
			/>
			<div className="space-y-1.5">
				{e.titleYears.length > 0 && <Row label="Drivers' titles">{yearList(e.titleYears)}</Row>}
				{e.constructorsTitles > 0 && <Row label="Constructors'">{e.constructorsTitles}</Row>}
				{e.topDriver && (
					<Row label="Most wins">
						<Refs items={[e.topDriver]} path="/drivers/" prefix={prefix} />
					</Row>
				)}
				{e.teams.length > 0 && (
					<Row label={won ? "Winning teams" : "Teams"}>
						<Refs items={won ? e.teams : e.teams.map(({ id, name }) => ({ id, name }))} path="/constructors/" prefix={prefix} />
						<More shown={e.teams.length} total={won ? e.teams.length : e.teamCount} />
					</Row>
				)}
				{won && e.teamCount > 1 && <Row label="Teams supplied">{e.teamCount}</Row>}
			</div>
		</div>
	);
}

function GrandPrixCardView({ card: g, prefix }: { card: GrandPrixCard; prefix: string }) {
	return (
		<div className="space-y-3">
			<Header
				flag={g.flag}
				title={g.name}
				subtitle={<Dotted parts={[g.nation && <NationRef id={g.nationId} name={g.nation} prefix={prefix} />, g.years && <Years years={g.years} prefix={prefix} />]} />}
			/>
			<Stats
				items={[
					["Held", g.races],
					["Winners", g.winners],
					["Circuits", g.circuitCount],
					["Since", g.years ? <SeasonRef year={g.years[0]} prefix={prefix} /> : "–"],
				]}
			/>
			<div className="space-y-1.5">
				{g.circuits.length > 0 && (
					<Row label={g.circuitCount > 1 ? "Circuits" : "Circuit"}>
						<Refs items={g.circuitCount > 1 ? g.circuits : g.circuits.map(({ id, name }) => ({ id, name }))} path="/circuits/" prefix={prefix} />
						<More shown={g.circuits.length} total={g.circuitCount} />
					</Row>
				)}
				{g.topDriver && (
					<Row label="Most wins">
						<Refs items={[g.topDriver]} path="/drivers/" prefix={prefix} />
					</Row>
				)}
				{g.topTeam && (
					<Row label="Top team">
						<Refs items={[g.topTeam]} path="/constructors/" prefix={prefix} />
					</Row>
				)}
				{g.lastWinner && (
					<Row label="Last winner">
						<Refs items={[g.lastWinner]} path="/drivers/" prefix={prefix} />{" "}
						<span className="text-muted-foreground">
							({g.lastWinner.team && (
								<>
									<Refs items={[g.lastWinner.team]} path="/constructors/" prefix={prefix} />,{" "}
								</>
							)}
							<SeasonRef year={g.lastWinner.year} prefix={prefix} />)
						</span>
					</Row>
				)}
			</div>
		</div>
	);
}

function NationCardView({ card: n, prefix }: { card: NationCard; prefix: string }) {
	const shown = n.champions.slice(0, 4);
	return (
		<div className="space-y-3">
			<Header
				flag={n.flag}
				title={n.name}
				subtitle={
					<Dotted
						parts={[
							n.drivers > 0 && `${num(n.drivers)} ${n.demonym ?? ""} driver${n.drivers === 1 ? "" : "s"}`.replace("  ", " "),
							n.racesHosted > 0 && `${num(n.racesHosted)} race${n.racesHosted === 1 ? "" : "s"} hosted`,
						]}
					/>
				}
				titles={n.champions.flatMap((c) => c.years)}
			/>
			<Stats
				items={[
					["Drivers", n.drivers],
					["Winners", n.winners],
					["Wins", n.wins],
					["Titles", n.titles],
				]}
			/>
			<div className="space-y-1.5">
				{shown.length > 0 && (
					<Row label="Champions">
						<div className="space-y-0.5">
							{shown.map((c) => (
								<div key={c.id}>
									<Refs items={[c]} path="/drivers/" prefix={prefix} /> <span className="text-muted-foreground">{yearList(c.years)}</span>
								</div>
							))}
							{n.champions.length > shown.length && <More shown={shown.length} total={n.champions.length} />}
						</div>
					</Row>
				)}
				{n.topDriver && (
					<Row label="Most wins">
						<Refs items={[n.topDriver]} path="/drivers/" prefix={prefix} />
					</Row>
				)}
				{n.constructorTitles > 0 && <Row label="Constructors'">{n.constructorTitles} titles by its teams</Row>}
				{n.racesHosted > 0 && (
					<Row label="Hosted">
						{n.grandsPrix} Grand{n.grandsPrix === 1 ? "" : "s"} Prix · {n.circuits} circuit{n.circuits === 1 ? "" : "s"}
					</Row>
				)}
			</div>
		</div>
	);
}

function SeasonCardView({ card: s, prefix }: { card: SeasonCard; prefix: string }) {
	const leader = s.inProgress;
	return (
		<div className="space-y-3">
			<Header
				title={`${s.year} season`}
				subtitle={
					s.start &&
					s.end && (
						<>
							<Day iso={s.start} prefix={prefix} /> – <Day iso={s.end} prefix={prefix} />
						</>
					)
				}
			/>
			<Stats
				items={[
					["Rounds", s.rounds],
					leader ? ["Run", s.completed] : ["Winners", s.winners],
					leader ? ["Winners", s.winners] : ["Top wins", s.mostWins?.n ?? "–"],
					[leader ? "Lead pts" : "Champ pts", s.champion ? num(s.champion.points) : "–"],
				]}
			/>
			{!s.completed ? (
				<p className="text-muted-foreground bg-muted/50 rounded-xl px-3 py-2 text-xs">Not started yet.</p>
			) : (
				<div className="space-y-1.5">
					{s.champion && (
						<Row label={leader ? "Leader" : "Champion"}>
							<Refs items={[s.champion]} path="/drivers/" prefix={prefix} />
							{s.championTeam && (
								<span className="text-muted-foreground">
									{" "}
									(<Refs items={[s.championTeam]} path="/constructors/" prefix={prefix} />)
								</span>
							)}
						</Row>
					)}
					{s.constructorsChampion && (
						<Row label={leader ? "Leading team" : "Constructors'"}>
							<Refs items={[s.constructorsChampion]} path="/constructors/" prefix={prefix} />
						</Row>
					)}
					{s.mostWins && (
						<Row label="Most wins">
							<Refs items={[s.mostWins]} path="/drivers/" prefix={prefix} />
						</Row>
					)}
					{leader && (
						<Row label="Progress">
							{s.completed} of {s.rounds} rounds run
						</Row>
					)}
				</div>
			)}
		</div>
	);
}

const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th"));
