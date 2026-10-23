// /changes: a universe compared with real history (the website's /u/<id>/changes): titles that
// changed hands, career totals that moved, races with a new winner, and records with a new holder
// or figure. `?u=<id>` for a particular universe; otherwise the one the app is showing.

import { useLocalSearchParams } from "expo-router";
import { GitCompareArrows } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import type { Db } from "@pitwall/core/f1/dataset";
import { ENTITY_LABELS, type Cell } from "@pitwall/core/f1/records";
import { MOVER_LABELS, MOVER_METRICS, recordChange, recordDiffIds, universeDiff, type MoverMetric, type RecordChange, type RecordHolder, type TitleSwap, type UniverseDiff } from "@pitwall/core/universe/diff";
import { DetailScreen, Page, Stat, StatGrid } from "@/components/f1";
import { Button, Chip, ChipRow, EmptyState, LoadingState, Row, Section, Segmented, Text } from "@/components/ui";
import { useActiveUniverse, useRealDb } from "@/data/dataset";
import { num, plural } from "@/lib/format";
import { href, useOpen } from "@/lib/links";
import { ProgressBar, Working } from "./components/previews";
import { universeKey, useApplied } from "./engine/apply";
import { enteredStore, enterUniverse, useUniverse } from "./engine/store";
import { shortName } from "./helpers";

const signed = (n: number) => (n > 0 ? `+${num(n)}` : `−${num(-n)}`);

function cellText(c: Cell): string {
	switch (c.t) {
		case "season":
			return String(c.year);
		case "date":
			return c.iso;
		case "number":
			return `#${c.number}`;
		case "text":
			return c.text;
		case "race":
			return `${c.ref.year} ${c.ref.name}`;
		default:
			return c.ref.name;
	}
}
const holders = (hs: RecordHolder[]) => (hs.length ? hs.map((h) => `${h.subject.map(cellText).join(" & ")} ${h.display}`).join(", ") : "Nobody");

/** Links inside a universe that isn't the one showing enter it first. */
function useUniverseOpen(id: string | null) {
	const open = useOpen();
	const entered = enteredStore.use();
	return (path: string) => {
		if (id && entered !== id) enterUniverse(id);
		open(path);
	};
}

export function ChangesScreen() {
	const { u } = useLocalSearchParams<{ u?: string }>();
	const base = useRealDb();
	const active = useActiveUniverse();
	const enteredId = enteredStore.use();
	const id = u ?? enteredId ?? null;
	const universe = useUniverse(id ?? undefined);
	const applied = useApplied(base, universe ? universeKey(universe) : null, universe?.changes ?? null, { channel: `lab:${id}` });
	const db = active && active.id === id ? active.db : applied.db;
	if (!universe)
		return (
			<DetailScreen title="What changed">
				<EmptyState icon={GitCompareArrows} title="No universe" body="Enter a universe from the Lab to compare it with real history." />
			</DetailScreen>
		);
	return (
		<DetailScreen title="What changed" subtitle={universe.name}>
			{db ? (
				<Diff key={universe.id} db={db} base={base} id={universe.id} />
			) : (
				<View className="mt-6 gap-1">
					<Working pending progress={applied.progress} label="Building this universe" />
					<ProgressBar fraction={applied.progress?.fraction ?? null} />
				</View>
			)}
		</DetailScreen>
	);
}

function Diff({ db, base, id }: { db: Db; base: Db; id: string }) {
	// a few hundred ms on a phone: show the screen first
	const [view, setView] = useState<UniverseDiff | null>(null);
	useEffect(() => {
		const t = setTimeout(() => {
			const started = performance.now();
			const v = universeDiff(db, base);
			console.log(`[lab] what changed in ${Math.round(performance.now() - started)} ms`);
			setView(v);
		}, 30);
		return () => clearTimeout(t);
	}, [db, base]);
	const go = useUniverseOpen(id);
	if (!view) return <LoadingState label="Comparing with real history" />;
	const titles = view.driverTitles.length + view.constructorTitles.length;
	const stats: [string, number][] = [
		["Seasons affected", view.seasonsAffected],
		["Drivers’ titles changed", view.driverTitles.length],
		["Constructors’ titles changed", view.constructorTitles.length],
		...([
			["Races with a new winner", view.winners.total],
			["Races only in this universe", view.newRaces],
			["New drivers", view.newDrivers],
		] as [string, number][]).filter(([, n]) => n > 0),
	];
	return (
		<Page>
			<Text variant="muted" className="px-4 pt-1">
				This universe compared with real history: titles that changed hands, career totals, race winners and records.
			</Text>
			<StatGrid className="mt-3">
				{stats.map(([label, value]) => (
					<Stat key={label} label={label} value={num(value)} />
				))}
			</StatGrid>
			{view.seasonsAffected === 0 && !view.newRaces ? (
				<EmptyState title="Nothing has changed yet" body="This universe has no changes that alter any results, so it is still real history." />
			) : (
				<>
					<Titles view={view} go={go} count={titles} />
					<Movers view={view} go={go} />
					<Winners view={view} go={go} />
					<Records db={db} base={base} go={go} />
					{view.newDrivers > 0 ? (
						<Text variant="caption" className="px-4 pt-4">
							{`${num(view.newDrivers)} drivers in this universe were invented by the simulation.`}
						</Text>
					) : null}
				</>
			)}
		</Page>
	);
}

type Go = (path: string) => void;

function Titles({ view, go, count }: { view: UniverseDiff; go: Go; count: number }) {
	const [kind, setKind] = useState<"drivers" | "constructors">(view.driverTitles.length || !view.constructorTitles.length ? "drivers" : "constructors");
	const rows: TitleSwap<{ id: string; name: string }>[] = kind === "drivers" ? view.driverTitles : view.constructorTitles;
	const [all, setAll] = useState(false);
	const shown = all ? rows : rows.slice(0, 15);
	return (
		<Section title="Championships" description={count ? `${plural(count, "title")} went to someone else.` : "Every champion is the real one."}>
			<Segmented
				className="mx-4 mb-1 mt-2"
				value={kind}
				onChange={(v) => setKind(v as typeof kind)}
				options={[
					{ value: "drivers", label: `Drivers (${view.driverTitles.length})` },
					{ value: "constructors", label: `Constructors (${view.constructorTitles.length})` },
				]}
			/>
			{rows.length === 0 ? (
				<Text variant="muted" className="px-4 py-3">
					{kind === "drivers" ? "No drivers’ title changed hands." : "No constructors’ title changed hands."}
				</Text>
			) : (
				shown.map((t, i) => (
					<Row
						key={t.year}
						leading={<Text variant="label" className="w-11 tabular-nums">{t.year}</Text>}
						title={t.now?.name ?? "In progress"}
						subtitle={t.real ? `In place of ${kind === "drivers" ? shortName(t.real.name) : t.real.name}` : t.newSeason ? "Not raced yet in reality" : "No champion in reality"}
						onPress={() => go(href.season(t.year))}
						last={i === shown.length - 1 && rows.length <= shown.length}
					/>
				))
			)}
			{rows.length > shown.length ? <Row title={`Show all ${rows.length}`} onPress={() => setAll(true)} last /> : null}
		</Section>
	);
}

function Movers({ view, go }: { view: UniverseDiff; go: Go }) {
	const [who, setWho] = useState<"drivers" | "constructors">("drivers");
	const movers = who === "drivers" ? view.drivers : view.constructors;
	const [metric, setMetric] = useState<MoverMetric>(() => MOVER_METRICS.find((m) => view.drivers[m].changed) ?? "wins");
	const [side, setSide] = useState<"gains" | "losses">("gains");
	const m = movers[metric];
	const rows = m[side];
	return (
		<Section title="Career movers" description="Whose career totals moved the most, and where that leaves them all-time.">
			<Segmented
				className="mx-4 mt-2"
				value={who}
				onChange={(v) => setWho(v as typeof who)}
				options={[
					{ value: "drivers", label: "Drivers" },
					{ value: "constructors", label: "Constructors" },
				]}
			/>
			<ChipRow className="mt-2">
				{MOVER_METRICS.map((k) => (
					<Chip key={k} label={movers[k].changed ? `${MOVER_LABELS[k]} ${movers[k].changed}` : MOVER_LABELS[k]} selected={k === metric} onPress={() => setMetric(k)} />
				))}
			</ChipRow>
			{m.changed === 0 ? (
				<Text variant="muted" className="px-4 py-3">{`No career ${MOVER_LABELS[metric].toLowerCase()} totals changed.`}</Text>
			) : (
				<>
					<Segmented
						className="mx-4 mb-1 mt-2"
						value={side}
						onChange={(v) => setSide(v as typeof side)}
						options={[
							{ value: "gains", label: "Biggest gains" },
							{ value: "losses", label: "Biggest losses" },
						]}
					/>
					{rows.length === 0 ? (
						<Text variant="muted" className="px-4 py-3">
							Nobody
						</Text>
					) : (
						rows.map((r, i) => (
							<Row
								key={r.ref.id}
								title={r.ref.name}
								subtitle={`${num(r.real)} in reality, ${num(r.now)} here${r.nowRank ? ` · all-time ${r.realRank && r.realRank !== r.nowRank ? `#${r.realRank} → ` : ""}#${r.nowRank}` : ""}`}
								trailing={<Text variant="label" className={r.delta > 0 ? "text-universe tabular-nums" : "text-destructive tabular-nums"}>{signed(r.delta)}</Text>}
								onPress={() => go(who === "drivers" ? href.driver(r.ref.id) : href.team(r.ref.id))}
								last={i === rows.length - 1}
							/>
						))
					)}
				</>
			)}
		</Section>
	);
}

const PAGE = 25;

function Winners({ view, go }: { view: UniverseDiff; go: Go }) {
	const [shown, setShown] = useState(PAGE);
	const w = view.winners;
	const description = `${plural(w.total, "real race")} won by someone else${view.newRaces ? `, plus ${num(view.newRaces)} that never happened in reality` : ""}${view.removedRaces ? `; ${num(view.removedRaces)} real races are gone` : ""}.`;
	const list = w.races.slice(0, shown);
	return (
		<Section title="Race winners" description={description}>
			{!w.total ? (
				<Text variant="muted" className="px-4 py-3">
					Every real race has its real winner.
				</Text>
			) : (
				list.map((r, i) => (
					<Row
						key={`${r.race.year}-${r.race.round}`}
						title={r.now?.name ?? "No winner"}
						subtitle={`${r.race.year} ${r.race.name}${r.real ? ` · in place of ${shortName(r.real.name)}` : ""}`}
						onPress={() => go(href.race(r.race))}
						last={i === list.length - 1 && shown >= w.races.length}
					/>
				))
			)}
			{shown < w.races.length ? <Row title="Show more" onPress={() => setShown((n) => n + 100)} last /> : null}
			{w.total > w.races.length && shown >= w.races.length ? <Text variant="caption" className="px-4 pt-2">{`Showing the first ${num(w.races.length)} of ${num(w.total)}.`}</Text> : null}
		</Section>
	);
}

type Scan = { done: number; total: number; changes: RecordChange[] };

/** Compares record categories a few at a time, yielding between them so the screen stays responsive. */
function useRecordScan(db: Db, base: Db, all: boolean): Scan {
	const ids = useMemo(() => recordDiffIds(all), [all]);
	const [scan, setScan] = useState<Scan & { ids: string[] }>({ ids, done: 0, total: ids.length, changes: [] });
	useEffect(() => {
		let i = 0;
		let changes: RecordChange[] = [];
		let timer: ReturnType<typeof setTimeout>;
		const started = performance.now();
		const step = () => {
			const until = performance.now() + 16;
			while (i < ids.length && performance.now() < until) {
				const c = recordChange(db, base, ids[i++]);
				if (c) changes = [...changes, c];
			}
			setScan({ ids, done: i, total: ids.length, changes });
			if (i < ids.length) timer = setTimeout(step, 0);
			else console.log(`[lab] ${ids.length} record categories compared in ${Math.round(performance.now() - started)} ms`);
		};
		timer = setTimeout(step, 80);
		return () => clearTimeout(timer);
	}, [db, base, ids]);
	return scan.ids === ids ? scan : { done: 0, total: ids.length, changes: [] };
}

function Records({ db, base, go }: { db: Db; base: Db; go: Go }) {
	const [all, setAll] = useState(false);
	const scan = useRecordScan(db, base, all);
	const [kind, setKind] = useState<"holder" | "value">("holder");
	const running = scan.done < scan.total;
	const holder = scan.changes.filter((c) => c.kind === "holder");
	const value = scan.changes.filter((c) => c.kind === "value");
	const list = kind === "holder" ? holder : value;
	return (
		<Section
			title="Records"
			description={all ? `Every record category (${num(scan.total)}), compared with reality.` : `The ${num(scan.total)} headline categories: totals, youngest and oldest, streaks and single-season bests.`}
		>
			{running ? (
				<View className="gap-1">
					<Working pending label={`Comparing records · ${num(scan.done)} of ${num(scan.total)}`} />
					<ProgressBar fraction={scan.done / scan.total} />
				</View>
			) : null}
			{!running && !scan.changes.length ? (
				<Text variant="muted" className="px-4 py-3">{`Every record is held by the same ${all ? "" : "headline "}holder, with the same figure, as in reality.`}</Text>
			) : scan.changes.length ? (
				<>
					<Segmented
						className="mx-4 mb-1 mt-2"
						value={kind}
						onChange={(v) => setKind(v as typeof kind)}
						options={[
							{ value: "holder", label: `New holder (${holder.length})` },
							{ value: "value", label: `New figure (${value.length})` },
						]}
					/>
					{list.length === 0 ? (
						<Text variant="muted" className="px-4 py-3">
							None.
						</Text>
					) : (
						list.map((c, i) => (
							<Row
								key={c.meta.id}
								title={`${ENTITY_LABELS[c.meta.entity]} · ${c.meta.family} · ${c.meta.title}`}
								subtitle={`Here: ${holders(c.now)}\nReality: ${holders(c.real)}`}
								numberOfLines={2}
								onPress={() => go(href.record(c.meta.id))}
								last={i === list.length - 1}
							/>
						))
					)}
				</>
			) : null}
			{!all && !running ? <Button label={`Check all ${num(recordDiffIds(true).length)} categories`} variant="outline" size="sm" className="mx-4 mt-3 self-start" onPress={() => setAll(true)} /> : null}
		</Section>
	);
}
