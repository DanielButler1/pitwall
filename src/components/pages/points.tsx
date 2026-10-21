"use client";

// "What if the points were different?" (/points): every season's champions under
// every points system. Rendered the same way for reality and for any universe.
// A custom system (built on the page, kept in `?custom=`) is scored in the browser
// against the page's own Db: the universe's when there is one, else real history.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Calculator, ChevronUp, Orbit, SlidersHorizontal, Trophy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Db } from "@/lib/f1/dataset";
import type { Champion, CompareSeason, CompareSystem, PointsCompareView, TitleFlip, TitleTotal } from "@/lib/f1/points-compare";
import {
	CUSTOM_SYSTEM,
	ERA_SYSTEM,
	POINTS_SYSTEMS,
	decodePointsSystem,
	encodePointsSystem,
	pointsSystemProblem,
	sanitizePointsSystem,
	type PointsSystem,
} from "@/lib/f1/points";
import { createUniverse, getUniverse, newId } from "@/lib/universe/store";
import { DriverLink, Hint, Page, PageHeader, Section, SeasonLink, StatCard, TableCard, TeamLink, num } from "../f1";
import { PointsBuilder, customFrom } from "../points-builder";
import { useUniverse } from "../universe-link";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Spinner } from "../ui/spinner";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

type Kind = "driver" | "team";
const DEFAULT_SYSTEM = "2010";

/** How a system scores, in words. */
function scoringText(id: string, custom: PointsSystem | null) {
	if (id === ERA_SYSTEM) return "Each season keeps its own points (half points, shared drives and 2014's double points included), but every result counts: no dropped scores.";
	const s = id === CUSTOM_SYSTEM ? custom : POINTS_SYSTEMS.find((p) => p.id === id);
	if (!s) return "";
	const scoring = [
		`Races score ${s.race.join("-")}`,
		s.sprint ? `sprints ${s.sprint.join("-")}` : "sprints score nothing",
		s.fastestLap ? `+${s.fastestLap.points} for fastest lap${s.fastestLap.withinTop ? ` (top ${s.fastestLap.withinTop})` : ""}` : null,
		s.pole ? `+${s.pole} for pole` : null,
		s.finishing ? `+${s.finishing} for every classified finisher` : null,
	];
	const rules = [
		s.bestResults ? `Only the best ${s.bestResults} race weekends count` : "Every result counts: no dropped scores",
		s.doubleFinal ? "double points for the final race" : "no double points",
		"every car scores for its constructor.",
	];
	return `${scoring.filter(Boolean).join(", ")}. ${rules.join(", ")}`;
}

/** The custom system's column, computed in the browser (the scoring code and, outside universes, the dataset load on demand). */
function useCustomView(view: PointsCompareView, db: Db | undefined, custom: PointsSystem | null) {
	const valid = useMemo(() => (custom && !pointsSystemProblem(custom) ? sanitizePointsSystem(custom) : null), [custom]);
	const key = valid ? encodePointsSystem(valid) : null;
	const [out, setOut] = useState<{ key: string; view: PointsCompareView } | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		if (!key) return;
		let live = true;
		const t = setTimeout(async () => {
			try {
				const [{ withCustomSystem }, base] = await Promise.all([
					import("@/lib/f1/points-compare"),
					db ?? import("@/lib/universe/use-universe").then((m) => m.loadBaseDb()),
				]);
				if (!live) return;
				setOut({ key, view: withCustomSystem(view, base, decodePointsSystem(key)!) });
				setError(null);
			} catch (e) {
				if (live) setError(e instanceof Error ? e.message : String(e));
			}
		}, 150);
		return () => {
			live = false;
			clearTimeout(t);
		};
	}, [key, view, db]);
	return { valid, view: out?.view ?? null, pending: !!key && out?.key !== key, error };
}

export function PointsPage({ view, db }: { view: PointsCompareView; db?: Db }) {
	const [system, setSystem] = useState(DEFAULT_SYSTEM);
	const [custom, setCustom] = useState<PointsSystem | null>(null);
	const [editing, setEditing] = useState(false);
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const shared = params.get("custom");
		const fromUrl = shared ? decodePointsSystem(shared) : null;
		const id = params.get("system");
		if (fromUrl) {
			setCustom(fromUrl);
			setSystem(CUSTOM_SYSTEM);
		} else if (id === CUSTOM_SYSTEM) {
			setCustom(customFrom());
			setSystem(CUSTOM_SYSTEM);
			setEditing(true);
		} else if (id && view.systems.some((s) => s.id === id)) setSystem(id);
	}, [view.systems]);
	const sync = (id: string, c: PointsSystem | null) => {
		const url = new URL(window.location.href);
		url.searchParams.delete("system");
		url.searchParams.delete("custom");
		const valid = c && !pointsSystemProblem(c) ? sanitizePointsSystem(c) : null;
		if (id === CUSTOM_SYSTEM && valid) url.searchParams.set("custom", encodePointsSystem(valid));
		else if (id !== DEFAULT_SYSTEM) url.searchParams.set("system", id);
		window.history.replaceState(null, "", url);
	};
	const choose = (id: string) => {
		if (!id) return;
		let c = custom;
		if (id === CUSTOM_SYSTEM && !c) {
			setCustom((c = customFrom(POINTS_SYSTEMS.some((s) => s.id === system) ? system : DEFAULT_SYSTEM)));
			setEditing(true);
		}
		setSystem(id);
		sync(id, c);
	};
	const edit = (c: PointsSystem) => {
		setCustom(c);
		sync(CUSTOM_SYSTEM, c);
	};

	const computed = useCustomView(view, db, custom);
	const v = computed.view ?? view;
	const isCustom = system === CUSTOM_SYSTEM;
	const customName = custom?.name.trim() || "Custom";
	const sys: CompareSystem = isCustom ? { id: CUSTOM_SYSTEM, name: customName, description: "", explorable: true } : v.systems.find((s) => s.id === system)!;
	const summary = isCustom && (computed.pending || !computed.valid) ? undefined : v.summaries[system];
	const diffs = summary?.drivers.map((t) => ({ ...t, diff: t.titles - t.actual })) ?? [];
	const winner = [...diffs].sort((a, b) => b.diff - a.diff || b.titles - a.titles)[0];
	const loser = [...diffs].sort((a, b) => a.diff - b.diff || b.actual - a.actual)[0];
	const leader = summary?.drivers[0];

	return (
		<Page>
			<PageHeader
				eyebrow={
					<span className="inline-flex items-center gap-1.5">
						<Calculator className="size-4" /> Points systems
					</span>
				}
				title="What if the points were different?"
				actions={<ExploreButton view={view} system={system} custom={isCustom ? computed.valid : null} />}
			>
				Every championship from {view.firstYear} to {view.lastYear} re-scored under each points system, from the 1950s&apos; 8-6-4-3-2 to today&apos;s 25-18-15, or one
				you build yourself. The same race results, a different table: these are the champions the Lab produces for the same change.
			</PageHeader>

			<div className="space-y-3">
				<ToggleGroup variant="outline" size="sm" value={system} onValueChange={choose} className="flex-wrap">
					{view.systems.map((s) => (
						<ToggleGroupItem key={s.id} value={s.id}>
							{s.name}
						</ToggleGroupItem>
					))}
					<ToggleGroupItem value={CUSTOM_SYSTEM}>
						<SlidersHorizontal /> Custom…
					</ToggleGroupItem>
				</ToggleGroup>
				<p className="text-muted-foreground max-w-3xl text-sm">
					<span className="text-foreground font-medium">{sys.name}</span>: {scoringText(system, custom)}
				</p>
			</div>

			{isCustom && custom && (
				<Card className="gap-4">
					<CardHeader>
						<CardTitle>Your points system</CardTitle>
						<CardDescription>Results update as you edit. The address bar keeps your system, so the page can be bookmarked or shared.</CardDescription>
						<CardAction>
							<Button variant="outline" size="sm" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
								{editing ? <ChevronUp data-icon="inline-start" /> : <SlidersHorizontal data-icon="inline-start" />}
								{editing ? "Hide builder" : "Edit system"}
							</Button>
						</CardAction>
					</CardHeader>
					{editing && (
						<CardContent>
							<PointsBuilder value={custom} onChange={edit} />
						</CardContent>
					)}
				</Card>
			)}

			{!summary ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">{computed.error || !computed.valid ? <Calculator /> : <Spinner />}</EmptyMedia>
						<EmptyTitle>{computed.error ? "Couldn't score your system" : computed.valid ? "Scoring every season…" : "Finish your points system"}</EmptyTitle>
						<EmptyDescription>
							{computed.error ?? (computed.valid ? "Re-scoring every championship under your system." : (custom && pointsSystemProblem(custom)) || "Give some positions points.")}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<>
					<div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
						<StatCard label="Drivers' titles changing hands" value={num(summary.driverFlips.length)} />
						<StatCard label="Constructors' titles changing hands" value={num(summary.teamFlips.length)} />
						<StatCard label={`Most titles under ${sys.name}`} value={leader ? <ShortDriver view={v} id={leader.id} suffix={` ${leader.titles}`} /> : "None"} />
						<StatCard label="Biggest winner" value={winner && winner.diff > 0 ? <ShortDriver view={v} id={winner.id} suffix={` +${winner.diff}`} /> : "Nobody"} />
						<StatCard label="Biggest loser" value={loser && loser.diff < 0 ? <ShortDriver view={v} id={loser.id} suffix={` −${-loser.diff}`} /> : "Nobody"} />
					</div>

					<Section title="Titles that change hands" description={`Seasons whose champion would be different under ${sys.name} scoring.`}>
						<Tabs defaultValue="driver" className="gap-4">
							<TabsList variant="line">
								<TabsTrigger value="driver">Drivers ({summary.driverFlips.length})</TabsTrigger>
								<TabsTrigger value="team">Constructors ({summary.teamFlips.length})</TabsTrigger>
							</TabsList>
							<TabsContent value="driver">
								<FlipTable view={v} flips={summary.driverFlips} kind="driver" />
							</TabsContent>
							<TabsContent value="team">
								<FlipTable view={v} flips={summary.teamFlips} kind="team" />
							</TabsContent>
						</Tabs>
					</Section>

					<Section title="Title count" description={`Championships won under ${sys.name} scoring, against the actual count.`}>
						<div className="grid gap-6 lg:grid-cols-2">
							<TotalsTable view={v} totals={summary.drivers} kind="driver" />
							<TotalsTable view={v} totals={summary.teams} kind="team" />
						</div>
					</Section>
				</>
			)}

			<Section
				title="Every season, every system"
				description="The champion of each season under each system. Highlighted cells differ from the actual champion; the selected system's column is shaded."
			>
				<Tabs defaultValue="driver" className="gap-4">
					<TabsList variant="line">
						<TabsTrigger value="driver">Drivers</TabsTrigger>
						<TabsTrigger value="team">Constructors</TabsTrigger>
					</TabsList>
					<TabsContent value="driver">
						<Matrix view={v} system={system} kind="driver" />
					</TabsContent>
					<TabsContent value="team">
						<Matrix view={v} system={system} kind="team" />
					</TabsContent>
				</Tabs>
			</Section>

			<p className="text-muted-foreground max-w-3xl text-xs">
				Re-scoring awards each system&apos;s points to the real finishing order and counts every result, matching a points change in the Lab. Races that originally
				paid half points still pay half. Official exclusions and deductions (1997, 2007 and others) still apply. Ties are broken
				on count-back.
			</p>
		</Page>
	);
}

/* --------------------------------------------------------------- pieces --- */

function ShortDriver({ view, id, suffix }: { view: PointsCompareView; id: string; suffix?: string }) {
	const d = view.drivers[id];
	return (
		<span className="inline-flex min-w-0 flex-wrap items-center gap-x-2">
			{d ? <DriverLink driver={{ ...d, name: d.short }} /> : id}
			{suffix && <span className="text-muted-foreground shrink-0 tabular-nums">{suffix}</span>}
		</span>
	);
}

function Entity({ view, id, kind, short = false, className }: { view: PointsCompareView; id: string; kind: Kind; short?: boolean; className?: string }) {
	if (kind === "team") {
		const t = view.teams[id];
		return t ? <TeamLink team={t} flag className={className} /> : <span>{id}</span>;
	}
	const d = view.drivers[id];
	if (!d) return <span>{id}</span>;
	return <DriverLink driver={short ? { ...d, name: d.short } : d} className={className} />;
}

const champOf = (s: { driver: Champion | null; team: Champion | null }, kind: Kind) => (kind === "driver" ? s.driver : s.team);

function Margin({ c }: { c: Champion }) {
	if (c.margin === 0)
		return (
			<Hint label="Level on points, decided on count-back">
				<Badge variant="outline">count-back</Badge>
			</Hint>
		);
	return <span className="tabular-nums">+{num(c.margin)}</span>;
}

function FlipTable({ view, flips, kind }: { view: PointsCompareView; flips: TitleFlip[]; kind: Kind }) {
	if (!flips.length)
		return (
			<Empty className="border">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Trophy />
					</EmptyMedia>
					<EmptyTitle>No titles change hands</EmptyTitle>
					<EmptyDescription>Every {kind === "driver" ? "drivers'" : "constructors'"} champion is the same under this system.</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	const byYear = new Map(view.seasons.map((s) => [s.year, s]));
	return (
		<TableCard>
			<TableHeader>
				<TableRow>
					<TableHead className="w-16">Season</TableHead>
					<TableHead>Actual champion</TableHead>
					<TableHead className="text-right">Points</TableHead>
					<TableHead className="w-8" />
					<TableHead>New champion</TableHead>
					<TableHead className="text-right">Points</TableHead>
					<TableHead className="text-right">Margin</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{flips.map((f) => {
					const real = champOf(byYear.get(f.year)!, kind)!;
					return (
						<TableRow key={f.year}>
							<TableCell className="font-semibold">
								<SeasonLink year={f.year} />
							</TableCell>
							<TableCell className="text-muted-foreground">
								<Entity view={view} id={f.from} kind={kind} />
							</TableCell>
							<TableCell className="text-muted-foreground text-right tabular-nums">{num(real.points)}</TableCell>
							<TableCell className="text-muted-foreground">
								<ArrowRight className="size-4" />
							</TableCell>
							<TableCell>
								<Entity view={view} id={f.to.id} kind={kind} className="font-medium" />
							</TableCell>
							<TableCell className="text-right font-medium tabular-nums">{num(f.to.points)}</TableCell>
							<TableCell className="text-right">
								<Margin c={f.to} />
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</TableCard>
	);
}

function TotalsTable({ view, totals, kind }: { view: PointsCompareView; totals: TitleTotal[]; kind: Kind }) {
	const rows = totals.filter((t) => t.titles > 0 || t.actual > 0);
	return (
		<div className="min-w-0 space-y-3">
			<h3 className="font-medium">{kind === "driver" ? "Drivers" : "Constructors"}</h3>
			<TableCard>
				<TableHeader>
					<TableRow>
						<TableHead>{kind === "driver" ? "Driver" : "Constructor"}</TableHead>
						<TableHead className="text-right">Titles</TableHead>
						<TableHead className="text-right">Actual</TableHead>
						<TableHead className="text-right">Change</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((t) => {
						const diff = t.titles - t.actual;
						return (
							<TableRow key={t.id}>
								<TableCell>
									<Entity view={view} id={t.id} kind={kind} className={cn(t.titles > 0 && "font-medium")} />
								</TableCell>
								<TableCell className="text-right font-semibold tabular-nums">{t.titles}</TableCell>
								<TableCell className="text-muted-foreground text-right tabular-nums">{t.actual}</TableCell>
								<TableCell className={cn("text-right tabular-nums", diff > 0 && "text-emerald-600 dark:text-emerald-400", diff < 0 && "text-destructive", !diff && "text-muted-foreground")}>
									{diff > 0 ? `+${diff}` : diff < 0 ? diff : "–"}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</TableCard>
		</div>
	);
}

function Matrix({ view, system, kind }: { view: PointsCompareView; system: string; kind: Kind }) {
	const seasons = kind === "team" ? view.seasons.filter((s) => s.team) : view.seasons;
	return (
		<TableCard tableClassName="text-xs">
			<TableHeader>
				<TableRow>
					<TableHead className="bg-card sticky left-0 z-10 w-14">Season</TableHead>
					<TableHead>
						<span className="inline-flex items-center gap-1">
							<Trophy className="text-gold size-3.5" /> Actual
						</span>
					</TableHead>
					{view.systems.map((s) => (
						<TableHead key={s.id} className={cn(s.id === system && "bg-muted text-foreground")}>
							<Hint label={s.id === ERA_SYSTEM ? "Each season's own points, no dropped scores" : s.description}>
								<span className="cursor-default">{s.name}</span>
							</Hint>
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{seasons.map((s) => (
					<MatrixRow key={s.year} view={view} season={s} system={system} kind={kind} />
				))}
			</TableBody>
		</TableCard>
	);
}

function MatrixRow({ view, season, system, kind }: { view: PointsCompareView; season: CompareSeason; system: string; kind: Kind }) {
	const real = champOf(season, kind);
	const reality = kind === "driver" ? season.realityDriver : season.realityTeam;
	return (
		<TableRow>
			<TableCell className="bg-card sticky left-0 z-10 font-semibold">
				<SeasonLink year={season.year} />
			</TableCell>
			<TableCell className="bg-gold/10 font-medium">
				{real ? <Entity view={view} id={real.id} kind={kind} short /> : "–"}
				{reality && (
					<Hint label="Champion in reality" className="ml-1.5">
						<Badge variant="outline" className="border-universe/30 text-universe h-4 px-1 text-[10px]">
							<Orbit /> {kind === "driver" ? view.drivers[reality]?.short : view.teams[reality]?.name}
						</Badge>
					</Hint>
				)}
			</TableCell>
			{view.systems.map((sys) => {
				const c = champOf(season.bySystem[sys.id], kind);
				const differs = !!c && !!real && c.id !== real.id;
				return (
					<TableCell
						key={sys.id}
						className={cn(
							sys.id === system && "bg-muted/60",
							differs ? "bg-universe/10 text-universe font-medium" : "text-muted-foreground",
							differs && sys.id === system && "bg-universe/20",
						)}
					>
						{c ? <Entity view={view} id={c.id} kind={kind} short /> : "–"}
					</TableCell>
				);
			})}
		</TableRow>
	);
}

/* ------------------------------------------------------------- universe --- */

function ExploreButton({ view, system, custom }: { view: PointsCompareView; system: string; custom: PointsSystem | null }) {
	const router = useRouter();
	const current = useUniverse();
	const [busy, setBusy] = useState(false);
	const sys: Pick<CompareSystem, "name" | "explorable"> =
		system === CUSTOM_SYSTEM ? { name: custom?.name ?? "Custom", explorable: !!custom } : view.systems.find((s) => s.id === system)!;
	const explore = async () => {
		setBusy(true);
		try {
			const span = { fromYear: view.firstYear, toYear: view.universeToYear };
			const change = custom ? { id: newId(), kind: "points" as const, ...span, system: CUSTOM_SYSTEM, custom } : { id: newId(), kind: "points" as const, ...span, system };
			const parent = current ? await getUniverse(current.id) : undefined;
			const label = /points$/i.test(sys.name) ? sys.name : `${sys.name} points`;
			const u = await createUniverse(parent ? `${parent.name}, ${label}` : label, [...(parent?.changes ?? []), change]);
			router.push(`/u/${u.id}`);
		} catch (e) {
			toast.error("Couldn't create the universe", { description: e instanceof Error ? e.message : String(e) });
			setBusy(false);
		}
	};
	const button = (
		<Button onClick={explore} disabled={busy || !sys.explorable}>
			<Orbit data-icon="inline-start" />
			Explore this as a universe
		</Button>
	);
	if (sys.explorable) return button;
	return <Hint label={system === CUSTOM_SYSTEM ? "Finish your points system to open it as a universe" : "Pick a single points system to open it as a universe"}>{button}</Hint>;
}
