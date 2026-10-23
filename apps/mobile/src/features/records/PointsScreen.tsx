// Points systems (/points): every championship re-scored under every points system, or one you
// build. The choice lives in the route's params (?system=<id>, or ?custom=<encoded> like the
// website), so a custom system can be shared as a link.

import { router, useLocalSearchParams } from "expo-router";
import { ArrowRight, Calculator, ChevronUp, Share2, SlidersHorizontal, Trophy } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Share, View } from "react-native";
import type { Db } from "@pitwall/core/f1/dataset";
import { CUSTOM_SYSTEM, ERA_SYSTEM, POINTS_SYSTEMS, decodePointsSystem, encodePointsSystem, pointsSystemProblem, sanitizePointsSystem, type PointsSystem } from "@pitwall/core/f1/points";
import { pointsCompareView, withCustomSystem, type Champion, type CompareSeason, type CompareSystem, type PointsCompareView, type TitleFlip, type TitleTotal } from "@pitwall/core/f1/points-compare";
import { DetailScreen, Flag, Page, Stat, StatGrid } from "@/components/f1";
import { Badge, Button, Chip, ChipRow, EmptyState, Icon, LoadingState, Row, Section, Text } from "@/components/ui";
import { useDb } from "@/data/dataset";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { num } from "@/lib/format";
import { href, useOpen } from "@/lib/links";
import { Callout, Choice, Note } from "./kit";
import { PointsBuilder, customFrom } from "./PointsBuilder";

type Kind = "driver" | "team";
const DEFAULT_SYSTEM = "2010";
const SITE = "https://pitwall.phaseo.app";

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
	const rules = [s.bestResults ? `Only the best ${s.bestResults} race weekends count` : "Every result counts: no dropped scores", s.doubleFinal ? "double points for the final race" : "no double points", "every car scores for its constructor."];
	return `${scoring.filter(Boolean).join(", ")}. ${rules.join(", ")}`;
}

/** Short names for the chips: "1950–59", "2025+", "Wins only". */
function shortName(s: CompareSystem) {
	if (s.id === ERA_SYSTEM) return "No drops";
	const short: Record<string, string> = { winner: "Wins only", indycar: "IndyCar", deep: "Top 15" };
	return short[s.id] ?? s.name.replace(/^(\d{4})–\d\d(\d\d)$/, "$1–$2").replace(/ onwards$/, "+");
}

// Re-scoring every season under every system takes a moment on a phone: built once per dataset, after
// the screen has appeared.
const cache = new WeakMap<Db, PointsCompareView>();

function useBaseView(db: Db) {
	const [, rebuilt] = useState(0);
	useEffect(() => {
		if (cache.has(db)) return;
		const t = setTimeout(() => {
			cache.set(db, pointsCompareView(db));
			rebuilt((n) => n + 1);
		}, 50);
		return () => clearTimeout(t);
	}, [db]);
	return cache.get(db) ?? null;
}

/** The custom column, scored a moment after the last edit. */
function useCustomView(view: PointsCompareView | null, db: Db, valid: PointsSystem | null) {
	const key = valid ? encodePointsSystem(valid) : null;
	const [out, setOut] = useState<{ key: string; view: PointsCompareView } | null>(null);
	useEffect(() => {
		if (!key || !view) return;
		const t = setTimeout(() => setOut({ key, view: withCustomSystem(view, db, decodePointsSystem(key)!) }), 250);
		return () => clearTimeout(t);
	}, [key, view, db]);
	// while an edit is being scored, the last result stays up (no jump to a spinner)
	return { view: key && out ? out.view : null, pending: !!key && out?.key !== key };
}

export function PointsScreen() {
	const params = useLocalSearchParams<{ system?: string; custom?: string }>();
	const db = useDb();
	const open = useOpen();
	const base = useBaseView(db);
	const shared = useMemo(() => (params.custom ? decodePointsSystem(params.custom) : null), [params.custom]);
	const system = shared ? CUSTOM_SYSTEM : (params.system ?? DEFAULT_SYSTEM);
	const isCustom = system === CUSTOM_SYSTEM;
	// The builder edits a local copy (half-typed values are fine); valid edits go to the params.
	const [custom, setCustom] = useState<PointsSystem | null>(shared);
	// open at first for a new system, closed for a shared one
	const [editingChoice, setEditing] = useState<boolean | null>(null);
	const editing = editingChoice ?? !shared;
	const draft = custom ?? (isCustom ? customFrom() : null);
	const valid = useMemo(() => (isCustom && draft && !pointsSystemProblem(draft) ? sanitizePointsSystem(draft) : null), [isCustom, draft]);
	const computed = useCustomView(base, db, valid);

	const sync = (id: string, c: PointsSystem | null) => {
		const ok = c && !pointsSystemProblem(c) ? sanitizePointsSystem(c) : null;
		if (id === CUSTOM_SYSTEM) router.setParams({ system: CUSTOM_SYSTEM, custom: ok ? encodePointsSystem(ok) : undefined });
		else router.setParams({ system: id === DEFAULT_SYSTEM ? undefined : id, custom: undefined });
	};
	const choose = (id: string) => {
		if (id === system) return;
		haptic("selection");
		let c = custom;
		if (id === CUSTOM_SYSTEM && !c) {
			setCustom((c = customFrom(POINTS_SYSTEMS.some((s) => s.id === system) ? system : DEFAULT_SYSTEM)));
			setEditing(true);
		}
		sync(id, c);
	};
	const edit = (c: PointsSystem) => {
		setCustom(c);
		sync(CUSTOM_SYSTEM, c);
	};
	const share = () => {
		if (!valid) return;
		void Share.share({ message: `${SITE}/points?custom=${encodePointsSystem(valid)}` });
	};

	if (!base)
		return (
			<DetailScreen title="Points systems">
				<LoadingState label="Re-scoring every season" />
			</DetailScreen>
		);

	const v = computed.view ?? base;
	const customName = draft?.name.trim() || "Custom";
	const sys: CompareSystem = isCustom ? { id: CUSTOM_SYSTEM, name: customName, description: "", explorable: true } : (v.systems.find((s) => s.id === system) ?? v.systems.find((s) => s.id === DEFAULT_SYSTEM)!);
	const summary = isCustom && (!valid || !computed.view) ? undefined : v.summaries[sys.id];
	const diffs = summary?.drivers.map((t) => ({ ...t, diff: t.titles - t.actual })) ?? [];
	const winner = [...diffs].sort((a, b) => b.diff - a.diff || b.titles - a.titles)[0];
	const loser = [...diffs].sort((a, b) => a.diff - b.diff || b.actual - a.actual)[0];
	const leader = summary?.drivers[0];
	const unchanged = !!summary && !summary.driverFlips.length && !summary.teamFlips.length;
	const driverShort = (id: string) => v.drivers[id]?.short ?? id;

	return (
		<DetailScreen title="Points systems" subtitle="What if the points were different?">
			<Page keyboardDismissMode="on-drag">
				<Text variant="muted" className="px-4 pt-1">
					{`Every championship from ${v.firstYear} to ${v.lastYear} re-scored under each points system, from the 1950s' 8-6-4-3-2 to today's 25-18-15, or one you build yourself. The same race results, a different table.`}
				</Text>
				<ChipRow className="mt-4">
					{base.systems.map((s) => (
						<Chip key={s.id} label={shortName(s)} selected={s.id === sys.id} onPress={() => choose(s.id)} />
					))}
					<Chip label="Custom…" icon={SlidersHorizontal} selected={isCustom} onPress={() => choose(CUSTOM_SYSTEM)} />
				</ChipRow>
				<Text variant="small" className="px-4 pt-3">
					<Text variant="small" className="font-semibold">{`${sys.name}: `}</Text>
					<Text variant="small" className="text-muted-foreground">{scoringText(sys.id, draft)}</Text>
				</Text>

				{isCustom && draft ? (
					<Section title="Your points system" description="Results update as you edit. Share it as a link to the website." action={valid ? <Button label="Share" icon={Share2} variant="outline" size="sm" onPress={share} /> : undefined}>
						<Button label={editing ? "Hide builder" : "Edit system"} icon={editing ? ChevronUp : SlidersHorizontal} variant="outline" size="sm" className="mx-4 mt-2 self-start" onPress={() => setEditing(!editing)} />
						{editing ? (
							<View className="mt-4">
								<PointsBuilder value={draft} onChange={edit} />
							</View>
						) : null}
					</Section>
				) : null}

				{!summary ? (
					isCustom && valid ? (
						<LoadingState label="Re-scoring every championship under your system" />
					) : (
						<EmptyState icon={Calculator} title="Finish your points system" body={(draft && pointsSystemProblem(draft)) || "Give some positions points."} />
					)
				) : (
					<>
						{unchanged ? (
							<Callout className="mt-5">{`Every drivers' and constructors' champion is the same under ${sys.name}.`}</Callout>
						) : (
							<StatGrid className="mt-5">
								<Stat label="Drivers' titles changing hands" value={num(summary.driverFlips.length)} />
								<Stat label="Constructors' titles changing hands" value={num(summary.teamFlips.length)} />
								<Stat label={`Most titles under ${sys.name}`} value={leader ? `${driverShort(leader.id)} ${leader.titles}` : "None"} onPress={leader ? () => open(href.driver(leader.id)) : undefined} />
								{winner && winner.diff > 0 ? <Stat label="Biggest winner" value={`${driverShort(winner.id)} +${winner.diff}`} onPress={() => open(href.driver(winner.id))} /> : null}
								{loser && loser.diff < 0 ? <Stat label="Biggest loser" value={`${driverShort(loser.id)} −${-loser.diff}`} onPress={() => open(href.driver(loser.id))} /> : null}
							</StatGrid>
						)}
						{!unchanged ? <Flips view={v} driverFlips={summary.driverFlips} teamFlips={summary.teamFlips} sysName={sys.name} onOpen={open} /> : null}
						<Totals view={v} drivers={summary.drivers} teams={summary.teams} sysName={sys.name} onOpen={open} />
					</>
				)}

				<Matrix view={v} system={sys.id} onOpen={open} />

				<Note className="pt-6">
					{"Re-scoring awards each system's points to the real finishing order and counts every result, matching a points change in the Lab. Races that originally paid half points still pay half. Official exclusions and deductions (1997, 2007 and others) still apply. Ties are broken on count-back."}
				</Note>
			</Page>
		</DetailScreen>
	);
}

function entityName(view: PointsCompareView, id: string, kind: Kind, short = false) {
	if (kind === "team") return view.teams[id]?.name ?? id;
	const d = view.drivers[id];
	return d ? (short ? d.short : d.name) : id;
}
const entityCountry = (view: PointsCompareView, id: string, kind: Kind) => (kind === "team" ? view.teams[id]?.country : view.drivers[id]?.country) ?? null;
const entityPath = (id: string, kind: Kind) => (kind === "team" ? href.team(id) : href.driver(id));
const champOf = (s: { driver: Champion | null; team: Champion | null }, kind: Kind) => (kind === "driver" ? s.driver : s.team);

function Flips({ view, driverFlips, teamFlips, sysName, onOpen }: { view: PointsCompareView; driverFlips: TitleFlip[]; teamFlips: TitleFlip[]; sysName: string; onOpen(path: string): void }) {
	const [kind, setKind] = useState<Kind>("driver");
	const flips = kind === "driver" ? driverFlips : teamFlips;
	const byYear = new Map(view.seasons.map((s) => [s.year, s]));
	return (
		<Section title="Titles that change hands" description={`Seasons whose champion would be different under ${sysName} scoring.`}>
			<Choice
				className="mt-2"
				value={kind}
				onChange={setKind}
				options={[
					{ value: "driver", label: `Drivers (${driverFlips.length})` },
					{ value: "team", label: `Constructors (${teamFlips.length})` },
				]}
			/>
			{flips.length ? (
				flips.map((f, i) => {
					const real = champOf(byYear.get(f.year)!, kind);
					return (
						<Row
							key={f.year}
							leading={<Text variant="label" className="w-12 tabular-nums" numberOfLines={1}>{f.year}</Text>}
							title={entityName(view, f.to.id, kind)}
							subtitle={`${num(f.to.points)} pts · actually ${entityName(view, f.from, kind)}${real ? `, ${num(real.points)} pts as scored then` : ""}`}
							trailing={<Margin c={f.to} />}
							onPress={() => onOpen(href.season(f.year))}
							last={i === flips.length - 1}
						/>
					);
				})
			) : (
				<EmptyState icon={Trophy} title="No titles change hands" body={`Every ${kind === "driver" ? "drivers'" : "constructors'"} champion is the same under this system.`} />
			)}
		</Section>
	);
}

function Margin({ c }: { c: Champion }) {
	if (c.margin === 0) return <Badge label="count-back" />;
	return <Text variant="small" className="font-semibold tabular-nums">{`+${num(c.margin)}`}</Text>;
}

function Totals({ view, drivers, teams, sysName, onOpen }: { view: PointsCompareView; drivers: TitleTotal[]; teams: TitleTotal[]; sysName: string; onOpen(path: string): void }) {
	const [kind, setKind] = useState<Kind>("driver");
	const rows = (kind === "driver" ? drivers : teams).filter((t) => t.titles > 0 || t.actual > 0);
	return (
		<Section title="Title count" description={`Championships won under ${sysName} scoring, against the actual count.`}>
			<Choice
				className="mt-2"
				value={kind}
				onChange={setKind}
				options={[
					{ value: "driver", label: "Drivers" },
					{ value: "team", label: "Constructors" },
				]}
			/>
			<View className="mt-2 flex-row gap-3 border-b border-border pb-1.5 pl-4 pr-4">
				<Text variant="caption" className="flex-1">{kind === "driver" ? "Driver" : "Constructor"}</Text>
				<Text variant="caption" className="w-12 text-right">Titles</Text>
				<Text variant="caption" className="w-12 text-right">Actual</Text>
				<Text variant="caption" className="w-10 text-right">+/−</Text>
			</View>
			{rows.map((t) => {
				const diff = t.titles - t.actual;
				return (
					<Pressable key={t.id} accessibilityRole="button" onPress={() => onOpen(entityPath(t.id, kind))} className="flex-row items-center gap-3 border-b border-border py-2.5 pl-4 pr-4 active:bg-accent">
						<View className="flex-1 flex-row items-center gap-1.5">
							<Flag code={entityCountry(view, t.id, kind)} />
							<Text variant="body" className={cn("shrink", t.titles > 0 && "font-semibold")} numberOfLines={1}>{entityName(view, t.id, kind)}</Text>
						</View>
						<Text variant="label" className="w-12 text-right tabular-nums">{t.titles}</Text>
						<Text variant="muted" className="w-12 text-right tabular-nums">{t.actual}</Text>
						<Text variant="small" className={cn("w-10 text-right tabular-nums", diff > 0 ? "text-success" : diff < 0 ? "text-destructive" : "text-muted-foreground")}>{diff > 0 ? `+${diff}` : diff < 0 ? `−${-diff}` : "–"}</Text>
					</Pressable>
				);
			})}
		</Section>
	);
}

/**
 * "Every season, every system": on a phone, one row per season with the actual champion and the
 * selected system's; tap a season to see its champion under every system.
 */
function Matrix({ view, system, onOpen }: { view: PointsCompareView; system: string; onOpen(path: string): void }) {
	const [kind, setKind] = useState<Kind>("driver");
	const [openYear, setOpenYear] = useState<number | null>(null);
	const seasons = (kind === "team" ? view.seasons.filter((s) => s.team) : view.seasons).slice().reverse();
	const differs = seasons.filter((s) => {
		const c = s.bySystem[system] && champOf(s.bySystem[system], kind);
		const real = champOf(s, kind);
		return c && real && c.id !== real.id;
	}).length;
	return (
		<Section title="Every season, every system" description="The champion of each season, actual and under the selected system; a different one is highlighted. Tap a season for every system.">
			<Choice
				className="mt-2"
				value={kind}
				onChange={(k) => {
					setKind(k);
					setOpenYear(null);
				}}
				options={[
					{ value: "driver", label: "Drivers" },
					{ value: "team", label: "Constructors" },
				]}
			/>
			<Text variant="caption" className="px-4 pt-2">{`${differs} of ${seasons.length} seasons differ`}</Text>
			<View className="mt-1 flex-row gap-3 border-b border-border pb-1.5 pl-4 pr-4">
				<Text variant="caption" className="w-12">Year</Text>
				<Text variant="caption" className="flex-1">Actual</Text>
				<Text variant="caption" className="flex-1">Selected</Text>
			</View>
			{seasons.map((s) => (
				<SeasonRow key={s.year} view={view} season={s} system={system} kind={kind} expanded={openYear === s.year} onToggle={() => setOpenYear((y) => (y === s.year ? null : s.year))} onOpen={onOpen} />
			))}
		</Section>
	);
}

function SeasonRow({ view, season, system, kind, expanded, onToggle, onOpen }: { view: PointsCompareView; season: CompareSeason; system: string; kind: Kind; expanded: boolean; onToggle(): void; onOpen(path: string): void }) {
	const real = champOf(season, kind);
	const sel = season.bySystem[system] ? champOf(season.bySystem[system], kind) : null;
	const differs = !!sel && !!real && sel.id !== real.id;
	return (
		<View className="border-b border-border">
			<Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggle} className="flex-row items-center gap-3 py-2.5 pl-4 pr-4 active:bg-accent">
				<Text variant="label" className="w-12 tabular-nums" numberOfLines={1}>{season.year}</Text>
				<Text variant="small" className="flex-1" numberOfLines={1}>{real ? entityName(view, real.id, kind, true) : "–"}</Text>
				<View className={cn("flex-1 rounded-md px-1.5 py-0.5", differs && "bg-universe/15")}>
					<Text variant="small" className={cn(differs ? "font-semibold text-universe" : "text-muted-foreground")} numberOfLines={1}>{sel ? entityName(view, sel.id, kind, true) : "–"}</Text>
				</View>
			</Pressable>
			{expanded ? (
				<View className="pb-2">
					{view.systems.map((s) => {
						const c = season.bySystem[s.id] ? champOf(season.bySystem[s.id], kind) : null;
						const d = !!c && !!real && c.id !== real.id;
						return (
							<Pressable key={s.id} accessibilityRole="button" onPress={() => c && onOpen(entityPath(c.id, kind))} className={cn("flex-row items-center gap-2 py-1.5 pl-[76px] pr-4 active:bg-accent", s.id === system && "bg-muted/60")}>
								<Text variant="caption" className="w-24" numberOfLines={1}>{shortName(s)}</Text>
								<Text variant="small" className={cn("flex-1", d ? "font-semibold text-universe" : "text-muted-foreground")} numberOfLines={1}>{c ? entityName(view, c.id, kind) : "–"}</Text>
								{c ? <Icon icon={ArrowRight} tone="muted" size={14} /> : null}
							</Pressable>
						);
					})}
					<Pressable accessibilityRole="button" onPress={() => onOpen(href.season(season.year))} className="py-2 pl-[76px] pr-4 active:bg-accent">
						<Text variant="small" className="text-link">{`Open the ${season.year} season`}</Text>
					</Pressable>
				</View>
			) : null}
		</View>
	);
}
