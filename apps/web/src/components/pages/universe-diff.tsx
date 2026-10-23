"use client";

// /u/<id>/changes: a universe compared with real history.

import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronsDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Db } from "@pitwall/core/f1/dataset";
import { ENTITY_LABELS, type Cell } from "@pitwall/core/f1/records";
import { MOVER_LABELS, MOVER_METRICS, recordChange, recordDiffIds, type Mover, type MoverMetric, type Movers, type RecordChange, type RecordHolder, type TitleSwap, type UniverseDiff } from "@pitwall/core/universe/diff";
import type { DriverRef, TeamRef } from "@pitwall/core/f1/views";
import { DriverLink, EngineLink, GrandPrixLink, Hint, NationLink, num, Page, PageHeader, RaceLink, SeasonLink, Section, StatCard, TableCard, TeamLink } from "../f1";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { Spinner } from "../ui/spinner";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { ULink } from "../universe-link";

const Was = ({ children }: { children: React.ReactNode }) => <span className="text-muted-foreground line-through decoration-1">{children}</span>;
/** "M. Schumacher": struck-out names stay on one line on phones. */
const shortRef = <R extends { name: string }>(r: R): R => {
	const [first, ...rest] = r.name.split(" ");
	return rest.length ? { ...r, name: `${first[0]}. ${rest.join(" ")}` } : r;
};
const Arrow = () => <ArrowRight className="text-muted-foreground size-3.5 shrink-0" />;
const None = ({ children }: { children: React.ReactNode }) => <span className="text-muted-foreground text-xs">{children}</span>;

/* ---------------------------------------------------------------- titles --- */

function TitlesTable<R extends DriverRef | TeamRef>({
	rows,
	render,
	empty,
	short = false,
}: {
	rows: TitleSwap<R>[];
	render: (r: R, now: boolean) => React.ReactNode;
	empty: string;
	short?: boolean;
}) {
	if (!rows.length) return <p className="text-muted-foreground text-sm">{empty}</p>;
	return (
		<TableCard>
			<TableHeader>
				<TableRow>
					<TableHead className="w-16">Season</TableHead>
					<TableHead className="hidden sm:table-cell">Reality</TableHead>
					<TableHead className="hidden w-6 sm:table-cell" />
					<TableHead>
						<span className="sm:hidden">Reality → this universe</span>
						<span className="hidden sm:inline">This universe</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((t) => (
					<TableRow key={t.year}>
						<TableCell className="font-semibold">
							<SeasonLink year={t.year} />
						</TableCell>
						<TableCell className="hidden sm:table-cell">{t.real ? <Was>{render(t.real, false)}</Was> : <None>{t.newSeason ? "Not raced yet" : "No champion"}</None>}</TableCell>
						<TableCell className="hidden sm:table-cell">
							<Arrow />
						</TableCell>
						<TableCell className="max-sm:max-w-0">
							<div className="flex min-w-0 sm:hidden">
								{t.real ? <Was>{render(short ? shortRef(t.real) : t.real, false)}</Was> : <None>{t.newSeason ? "Not raced yet" : "No champion"}</None>}
							</div>
							<div className="flex min-w-0">{t.now ? render(t.now, true) : <None>In progress</None>}</div>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</TableCard>
	);
}

/* ---------------------------------------------------------------- movers --- */

const signed = (n: number) => (n > 0 ? `+${num(n)}` : num(n).replace("-", "−"));

function Rank({ real, now }: { real: number | null; now: number | null }) {
	if (real === now || now == null) return now ? <span className="text-muted-foreground">#{now}</span> : null;
	return (
		<Hint label={real ? `All-time #${real} in reality` : "Not ranked in reality"}>
			<span className="text-muted-foreground inline-flex items-center gap-1 tabular-nums">
				{real ? `#${real}` : "–"} <ArrowRight className="size-3" /> <span className="text-foreground">#{now}</span>
			</span>
		</Hint>
	);
}

function MoverTable<R>({ title, rows, render }: { title: string; rows: Mover<R>[]; render: (r: R) => React.ReactNode }) {
	return (
		<TableCard>
			<TableHeader>
				<TableRow>
					<TableHead>{title}</TableHead>
					<TableHead className="hidden text-right sm:table-cell">Reality</TableHead>
					<TableHead className="text-right">Universe</TableHead>
					<TableHead className="text-right">Change</TableHead>
					<TableHead className="hidden text-right sm:table-cell">All-time</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.length === 0 ? (
					<TableRow>
						<TableCell colSpan={5} className="text-muted-foreground">
							Nobody
						</TableCell>
					</TableRow>
				) : (
					rows.map((m, i) => (
						<TableRow key={i}>
							<TableCell className="max-w-44 sm:max-w-56">{render(m.ref)}</TableCell>
							<TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">{num(m.real)}</TableCell>
							<TableCell className="text-right font-medium tabular-nums">{num(m.now)}</TableCell>
							<TableCell className={cn("text-right font-medium tabular-nums", m.delta > 0 ? "text-universe" : "text-destructive")}>{signed(m.delta)}</TableCell>
							<TableCell className="hidden text-right sm:table-cell">
								<Rank real={m.realRank} now={m.nowRank} />
							</TableCell>
						</TableRow>
					))
				)}
			</TableBody>
		</TableCard>
	);
}

function MoversPanel<R>({ movers, render }: { movers: Movers<R>; render: (r: R) => React.ReactNode }) {
	const first = MOVER_METRICS.find((m) => movers[m].changed) ?? "wins";
	const [metric, setMetric] = useState<MoverMetric>(first);
	const m = movers[metric];
	return (
		<div className="space-y-4">
			<div className="relative max-sm:-mx-4">
				<ToggleGroup variant="outline" size="sm" value={metric} onValueChange={(v: string) => v && setMetric(v as MoverMetric)} className="flex-wrap max-sm:w-auto max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-4 max-sm:[scrollbar-width:none]">
					{MOVER_METRICS.map((k) => (
						<ToggleGroupItem key={k} value={k}>
							{MOVER_LABELS[k]}
							{movers[k].changed > 0 && <span className="text-muted-foreground tabular-nums">{movers[k].changed}</span>}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				<div aria-hidden className="from-background via-background/70 pointer-events-none absolute inset-y-0 right-0 z-10 w-14 bg-linear-to-l sm:hidden" />
			</div>
			{m.changed === 0 ? (
				<p className="text-muted-foreground text-sm">No career {MOVER_LABELS[metric].toLowerCase()} totals changed.</p>
			) : (
				<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
					<MoverTable title="Biggest gains" rows={m.gains} render={render} />
					<MoverTable title="Biggest losses" rows={m.losses} render={render} />
				</div>
			)}
		</div>
	);
}

/* --------------------------------------------------------------- winners --- */

const RACES = 25;

function WinnersTable({ winners }: { winners: UniverseDiff["winners"] }) {
	const [shown, setShown] = useState(RACES);
	if (!winners.total) return <p className="text-muted-foreground text-sm">Every real race has its real winner.</p>;
	return (
		<div className="space-y-3">
			<TableCard>
				<TableHeader>
					<TableRow>
						<TableHead>Race</TableHead>
						<TableHead>Reality</TableHead>
						<TableHead className="w-6" />
						<TableHead>This universe</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{winners.races.slice(0, shown).map((w) => (
						<TableRow key={`${w.race.year}-${w.race.round}`}>
							<TableCell className="max-w-64">
								<RaceLink race={w.race} year />
							</TableCell>
							<TableCell className="max-w-56">
								{w.real ? (
									<Was>
										<DriverLink driver={w.real} flag={false} className="max-sm:hidden" />
										<DriverLink driver={shortRef(w.real)} flag={false} className="sm:hidden" />
									</Was>
								) : (
									<None>No winner</None>
								)}
							</TableCell>
							<TableCell>
								<Arrow />
							</TableCell>
							<TableCell className="max-w-64">
								{w.now ? (
									<span className="inline-flex min-w-0 items-center gap-2">
										<DriverLink driver={w.now} className="text-universe font-medium" />
										{w.nowTeam && <TeamLink team={w.nowTeam} className="text-muted-foreground hidden text-xs md:inline-flex" />}
									</span>
								) : (
									<None>No winner</None>
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</TableCard>
			<div className="text-muted-foreground flex items-center gap-3 text-sm">
				{shown < winners.races.length && (
					<Button variant="outline" size="sm" onClick={() => setShown((n) => n + 100)}>
						<ChevronsDown data-icon="inline-start" />
						Show more
					</Button>
				)}
				{winners.total > winners.races.length && shown >= winners.races.length && <span>Showing the first {num(winners.races.length)} of {num(winners.total)}.</span>}
			</div>
		</div>
	);
}

/* --------------------------------------------------------------- records --- */

function SubjectCell({ cell }: { cell: Cell }) {
	switch (cell.t) {
		case "driver":
			return <DriverLink driver={cell.ref} />;
		case "team":
			return <TeamLink team={cell.ref} flag />;
		case "engine":
			return <EngineLink engine={cell.ref} flag />;
		case "nation":
			return <NationLink nation={cell.ref} />;
		case "gp":
			return <GrandPrixLink gp={cell.ref} />;
		case "race":
			return <RaceLink race={cell.ref} year />;
		case "season":
			return <SeasonLink year={cell.year} />;
		case "number":
			return <span className="tabular-nums">#{cell.number}</span>;
		case "tyre":
			return <span>{cell.ref.name}</span>;
		case "circuit":
			return <span>{cell.ref.name}</span>;
		case "date":
			return <span>{cell.iso}</span>;
		case "text":
			return <span>{cell.text}</span>;
	}
}

function Holders({ holders, now }: { holders: RecordHolder[]; now?: boolean }) {
	if (!holders.length) return <None>Nobody</None>;
	return (
		<div className={cn("flex min-w-0 flex-col gap-0.5", now ? "[&_a]:font-medium" : "text-muted-foreground")}>
			{holders.map((h, i) => (
				<span key={i} className="inline-flex min-w-0 items-center gap-2">
					<span className="inline-flex min-w-0 items-center gap-1.5">
						{h.subject.map((c, j) => (
							<Fragment key={j}>
								{j > 0 && <span className="text-muted-foreground">&amp;</span>}
								<SubjectCell cell={c} />
							</Fragment>
						))}
					</span>
					<span className={cn("shrink-0 tabular-nums", now ? "text-universe font-medium" : "")}>{h.display}</span>
				</span>
			))}
		</div>
	);
}

type RecordScan = { done: number; total: number; changes: RecordChange[] };

/** Compares record categories a few at a time, yielding between them so the page stays responsive. */
function useRecordScan(db: Db, base: Db, all: boolean): RecordScan {
	const ids = useMemo(() => recordDiffIds(all), [all]);
	const [scan, setScan] = useState<RecordScan>({ done: 0, total: ids.length, changes: [] });
	useEffect(() => {
		let i = 0;
		let changes: RecordChange[] = [];
		let timer: ReturnType<typeof setTimeout>;
		setScan({ done: 0, total: ids.length, changes });
		const step = () => {
			const until = performance.now() + 40;
			while (i < ids.length && performance.now() < until) {
				const c = recordChange(db, base, ids[i++]);
				if (c) changes = [...changes, c];
			}
			setScan({ done: i, total: ids.length, changes });
			if (i < ids.length) timer = setTimeout(step, 0);
		};
		timer = setTimeout(step, 50);
		return () => clearTimeout(timer);
	}, [db, base, ids]);
	return scan;
}

function RecordsSection({ db, base }: { db: Db; base: Db }) {
	const [all, setAll] = useState(false);
	const scan = useRecordScan(db, base, all);
	const running = scan.done < scan.total;
	const holders = scan.changes.filter((c) => c.kind === "holder");
	const values = scan.changes.filter((c) => c.kind === "value");
	return (
		<Section
			title="Records"
			description={
				all
					? `Every record category (${num(scan.total)}), compared with reality.`
					: `The ${num(scan.total)} headline categories: totals, youngest and oldest, streaks and single-season bests.`
			}
			action={
				!all && (
					<Button variant="outline" size="sm" onClick={() => setAll(true)} disabled={running}>
						Check all {num(recordDiffIds(true).length)} categories
					</Button>
				)
			}
		>
			{running && (
				<p className="text-muted-foreground flex items-center gap-2 text-sm">
					<Spinner /> Comparing records · {num(scan.done)} of {num(scan.total)}
				</p>
			)}
			{!running && !scan.changes.length ? (
				<p className="text-muted-foreground text-sm">Every record is held by the same {all ? "" : "headline "}holder, with the same figure, as in reality.</p>
			) : (
				<Tabs defaultValue="holder" className="gap-4">
					<TabsList variant="line">
						<TabsTrigger value="holder">New holder ({holders.length})</TabsTrigger>
						<TabsTrigger value="value">Same holder, new figure ({values.length})</TabsTrigger>
					</TabsList>
					{(["holder", "value"] as const).map((kind) => (
						<TabsContent key={kind} value={kind}>
							<RecordsTable changes={kind === "holder" ? holders : values} />
						</TabsContent>
					))}
				</Tabs>
			)}
		</Section>
	);
}

function RecordsTable({ changes }: { changes: RecordChange[] }) {
	if (!changes.length) return <p className="text-muted-foreground text-sm">None.</p>;
	return (
		<>
			<Card className="gap-0 divide-y py-0 sm:hidden">
				{changes.map((c) => (
					<div key={c.meta.id} className="space-y-2 px-4 py-3 text-sm">
						<ULink href={`/records/${c.meta.id}`} className="block font-medium underline-offset-4 hover:underline">
							{ENTITY_LABELS[c.meta.entity]} · {c.meta.family} · {c.meta.title}
						</ULink>
						<div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
							<span className="text-muted-foreground text-xs leading-5">Reality</span>
							<Holders holders={c.real} />
							<span className="text-universe text-xs leading-5">Universe</span>
							<Holders holders={c.now} now />
						</div>
					</div>
				))}
			</Card>
			<TableCard className="max-sm:hidden">
			<TableHeader>
				<TableRow>
					<TableHead>Record</TableHead>
					<TableHead>Reality</TableHead>
					<TableHead>This universe</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{changes.map((c) => (
					<TableRow key={c.meta.id} className="align-top">
						<TableCell className="max-w-72 whitespace-normal">
							<ULink href={`/records/${c.meta.id}`} className="font-medium underline-offset-4 hover:underline">
								{ENTITY_LABELS[c.meta.entity]} · {c.meta.family} · {c.meta.title}
							</ULink>
							<div className="text-muted-foreground text-xs">{c.meta.description}</div>
						</TableCell>
						<TableCell className="max-w-72">
							<Holders holders={c.real} />
						</TableCell>
						<TableCell className="max-w-72">
							<Holders holders={c.now} now />
						</TableCell>
					</TableRow>
				))}
				</TableBody>
			</TableCard>
		</>
	);
}

/* ------------------------------------------------------------------ page --- */

const STAT_COLS: Record<number, string> = { 3: "md:grid-cols-3", 4: "md:grid-cols-4", 5: "md:grid-cols-3 xl:grid-cols-5", 6: "md:grid-cols-3 xl:grid-cols-6" };

export function UniverseDiffPage({ view, db, base, name }: { view: UniverseDiff; db: Db; base: Db; name: string }) {
	const driver = (r: DriverRef, now = true) => <DriverLink driver={r} flag={now} className={now ? "text-universe font-medium" : undefined} />;
	const team = (r: TeamRef, now = true) => <TeamLink team={r} flag={now} className={now ? "text-universe font-medium" : undefined} />;
	const titles = view.driverTitles.length + view.constructorTitles.length;
	const extra: [string, number][] = [
		["Races with a new winner", view.winners.total],
		["Races only in this universe", view.newRaces],
		["New drivers", view.newDrivers],
	];
	const stats: [string, number][] = [
		["Seasons affected", view.seasonsAffected],
		["Drivers' titles changed", view.driverTitles.length],
		["Constructors' titles changed", view.constructorTitles.length],
		...extra.filter(([, n]) => n > 0),
	];
	return (
		<Page>
			<PageHeader
				title="What changed"
				eyebrow={
					<>
						<Sparkles className="text-universe size-4" /> {name}
					</>
				}
			>
				This universe compared with real history: titles that changed hands, career totals, race winners and records.
			</PageHeader>

			<div className={cn("grid grid-cols-2 gap-4 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2", STAT_COLS[stats.length])}>
				{stats.map(([label, value]) => (
					<StatCard key={label} label={label} value={num(value)} />
				))}
			</div>

			{view.seasonsAffected === 0 && !view.newRaces ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nothing has changed yet</EmptyTitle>
						<EmptyDescription>This universe has no changes that alter any results, so it is still real history.</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<>
					<Section
						title="Championships"
						description={titles ? `${titles} title${titles === 1 ? "" : "s"} went to someone else.` : "Every champion is the real one."}
					>
						<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
							<div className="space-y-2">
								<h3 className="text-sm font-medium">Drivers&apos; champions</h3>
								<TitlesTable rows={view.driverTitles} render={driver} empty="No drivers' title changed hands." short />
							</div>
							<div className="space-y-2">
								<h3 className="text-sm font-medium">Constructors&apos; champions</h3>
								<TitlesTable rows={view.constructorTitles} render={team} empty="No constructors' title changed hands." />
							</div>
						</div>
					</Section>

					<Section title="Career movers" description="Whose career totals moved the most, and where that leaves them all-time.">
						<Tabs defaultValue="drivers" className="gap-4">
							<TabsList variant="line">
								<TabsTrigger value="drivers">Drivers</TabsTrigger>
								<TabsTrigger value="constructors">Constructors</TabsTrigger>
							</TabsList>
							<TabsContent value="drivers">
								<MoversPanel
									movers={view.drivers}
									render={(r) => (
										<>
											<DriverLink driver={r} className="text-universe font-medium max-sm:hidden" />
											<DriverLink driver={r.name.length > 15 ? shortRef(r) : r} className="text-universe font-medium sm:hidden" />
										</>
									)}
								/>
							</TabsContent>
							<TabsContent value="constructors">
								<MoversPanel movers={view.constructors} render={(r) => team(r)} />
							</TabsContent>
						</Tabs>
					</Section>

					<Section
						title="Race winners"
						description={
							<>
								{num(view.winners.total)} real race{view.winners.total === 1 ? "" : "s"} won by someone else
								{view.newRaces > 0 && <>, plus {num(view.newRaces)} that never happened in reality</>}
								{view.removedRaces > 0 && <>; {num(view.removedRaces)} real races are gone</>}.
							</>
						}
					>
						<WinnersTable winners={view.winners} />
					</Section>

					<RecordsSection db={db} base={base} />
				</>
			)}
			{view.newDrivers > 0 && (
				<p className="text-muted-foreground text-xs">
					<Badge variant="outline" className="border-universe/30 text-universe mr-2">
						<Sparkles /> Simulated
					</Badge>
					{num(view.newDrivers)} drivers in this universe were invented by the simulation.
				</p>
			)}
		</Page>
	);
}
