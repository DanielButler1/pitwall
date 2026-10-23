// Editors for the simulation layer: whole-history runs, performance tuning, and seats and careers
// (the website's sim-editors.tsx).

import { useMemo, useState } from "react";
import { View } from "react-native";
import type { Db } from "@pitwall/core/f1/dataset";
import { DEFAULT_ANCHOR } from "@pitwall/core/sim/history";
import { DEFAULT_SIM, randomSeed } from "@pitwall/core/sim/race";
import type { Change, UniverseDb } from "@pitwall/core/universe/apply";
import { Badge, LoadingState, Row, Section, Segmented, Text } from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import { num, plural } from "@/lib/format";
import { Picker } from "../components/Picker";
import { Note, Preview, SeasonCompare, StandingsPreview, TitleFlips, Working } from "../components/previews";
import { RatingChart, type CurvePoint } from "../components/RatingChart";
import { Slider } from "../components/Slider";
import { useRatingCurves } from "../engine/apply";
import { newId } from "../engine/store";
import { champion, driverName, driverOptions, FUTURE_LIMIT, lastReal, mainTeam, range, realCareer, shortName, simulatedYears, spanOptions, teamName, teamOptions, titleFlips, yearOptions } from "../helpers";
import { AddBar, SimControls, usePreview, type EditorProps } from "./common";

function Checks({ db }: { db: UniverseDb | null }) {
	if (!db?.sim) return null;
	const v = db.sim.violations.length;
	return v === 0 ? <Badge label="All race checks passed" tone="success" /> : <Badge label={`${v} race check${v === 1 ? "" : "s"} failed`} tone="destructive" />;
}

function ToggleRow({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
	return (
		<View className="flex-row items-center gap-3 px-4 py-3">
			<Text variant="body" className="flex-1">
				{label}
			</Text>
			<Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
		</View>
	);
}

/* ----------------------------------------------------------- history sim --- */

export function HistorySimEditor({ base, current, changes, onAdd }: EditorProps) {
	const real = lastReal(base);
	const [mode, setMode] = useState<"dynamic" | "real-grids">("dynamic");
	const [fromYear, setFromYear] = useState(1990);
	const [toYear, setToYear] = useState(2050);
	const [seed, setSeed] = useState(randomSeed);
	const [chaos, setChaos] = useState(DEFAULT_SIM.chaos);
	const [reliability, setReliability] = useState(DEFAULT_SIM.reliability);
	const [anchor, setAnchor] = useState(DEFAULT_ANCHOR);
	const maxTo = mode === "dynamic" ? FUTURE_LIMIT : real;
	const from = Math.min(fromYear, mode === "dynamic" ? real + 1 : real);
	const to = Math.max(from, Math.min(toYear, maxTo));
	const candidate = useMemo<Change>(
		() => ({ id: newId(), kind: "history-sim", mode, fromYear: from, toYear: to, seed, chaos, reliability, ...(mode === "dynamic" ? { anchor } : {}) }),
		[mode, from, to, seed, chaos, reliability, anchor],
	);
	const { preview, pending, progress } = usePreview(base, changes, candidate, "preview:history");

	const rows = useMemo(() => {
		if (!preview) return [];
		return range(from, to)
			.filter((y) => preview.driverStandings.get(y)?.length)
			.map((y) => {
				const now = champion(preview, y);
				return { year: y, now, team: now ? mainTeam(preview, now, y) : null, constructor: preview.constructorStandings.get(y)?.find((r) => r.champion)?.id ?? null, real: champion(base, y) };
			});
	}, [preview, base, from, to]);
	const titles = useMemo(() => {
		const count = (ids: (string | null)[]) => {
			const m = new Map<string, number>();
			for (const id of ids) if (id) m.set(id, (m.get(id) ?? 0) + 1);
			return m;
		};
		const now = count(rows.map((r) => r.now));
		const was = count(rows.map((r) => r.real));
		const teams = count(rows.map((r) => r.constructor));
		return {
			drivers: [...now.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([id, n]) => ({ id, n, real: was.get(id) ?? 0 })),
			teams: [...teams.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8),
		};
	}, [rows]);
	const [showAll, setShowAll] = useState(false);
	const differs = rows.filter((r) => r.real && r.now !== r.real).length;
	const future = rows.filter((r) => r.year > real).length;
	const shown = showAll ? rows : rows.slice(0, 15);

	return (
		<>
			<Segmented
				className="mx-4 mt-3"
				value={mode}
				onChange={(v) => setMode(v as typeof mode)}
				options={[
					{ value: "dynamic", label: "Simulate careers" },
					{ value: "real-grids", label: "Real grids" },
				]}
			/>
			<Note>
				{mode === "dynamic"
					? `Real history up to ${from - 1}, then a living world: teams sign drivers every winter on 1–3 year deals, drivers age and retire (never past 45), real drivers who debuted later arrive as prospects around their real debut, invented rookies fill the gaps, and car form develops and resets with new regulations.${to > real ? ` Seasons after ${real} use the ${real} calendar and points.` : ""}`
					: "Every race in range is run again with its real entry list and grid. Performance changes and seat swaps in this universe apply."}
			</Note>
			<Section>
				<Picker label="From" value={from} options={spanOptions(base.meta.firstYear, mode === "dynamic" ? real + 1 : real)} onChange={setFromYear} />
				<Picker label="To" value={to} options={spanOptions(from, maxTo)} onChange={setToYear} />
				<SimControls chaos={chaos} setChaos={setChaos} reliability={reliability} setReliability={setReliability} />
				{mode === "dynamic" ? (
					<Slider
						label="Team form follows reality"
						value={anchor}
						min={0}
						max={1}
						step={0.05}
						onChange={setAnchor}
						format={(v) => v.toFixed(2)}
						hint={`${anchor < 0.15 ? "Teams develop freely from day one" : anchor > 0.75 ? "Cars stay close to how they really were" : "Recognisable eras, with room to diverge"}${from <= real ? ` (until ${real})` : ""}`}
						last
					/>
				) : null}
			</Section>
			<AddBar onAdd={() => onAdd([candidate])} seed={seed} onReroll={() => setSeed(randomSeed())} />
			<Working pending={pending} progress={progress} label="Simulating" />
			{preview && rows.length > 0 ? (
				<>
					<View className="mt-4 flex-row flex-wrap gap-2 px-4">
						<Badge label={`${rows.length} season${rows.length === 1 ? "" : "s"}`} />
						{differs > 0 ? <Badge label={`${differs} with a different champion`} tone="primary" /> : null}
						{future > 0 ? <Badge label={`${future} beyond ${real}`} /> : null}
						{(preview.sim?.generatedDrivers ?? 0) > 0 ? <Badge label={`${num(preview.sim!.generatedDrivers)} new drivers, ${plural(preview.sim!.generatedTeams, "new team")}`} /> : null}
						<Checks db={preview} />
					</View>
					<Preview title="Champions" description="Each season’s drivers’ champion, against reality.">
						{shown.map((r, i) => (
							<Row
								key={r.year}
								leading={<Text variant="label" className="w-11 tabular-nums">{r.year}</Text>}
								title={r.now ? driverName(preview, r.now) : "Season in progress"}
								subtitle={[r.team ? teamName(preview, r.team) : null, r.real ? (r.real === r.now ? "Same as reality" : `In reality: ${shortName(driverName(base, r.real))}`) : r.year > real ? "Not raced yet in reality" : null].filter(Boolean).join(" · ")}
								last={i === shown.length - 1 && rows.length <= shown.length}
							/>
						))}
						{rows.length > shown.length ? <Row title={`Show all ${rows.length} seasons`} onPress={() => setShowAll(true)} last /> : null}
					</Preview>
					<Preview title="Most titles" description={`Drivers’ championships ${from}–${to}.`}>
						{titles.drivers.map((t, i) => (
							<Row key={t.id} title={driverName(preview, t.id)} subtitle={`In reality: ${t.real}`} value={String(t.n)} last={i === titles.drivers.length - 1} />
						))}
					</Preview>
					{titles.teams.length ? (
						<Preview title="Constructors’ titles">
							{titles.teams.map(([id, n], i) => (
								<Row key={id} title={teamName(preview, id)} value={String(n)} last={i === titles.teams.length - 1} />
							))}
						</Preview>
					) : null}
				</>
			) : null}
		</>
	);
}

/* ----------------------------------------------------------- performance --- */

function useCoverage(changes: Change[], from: number, to: number) {
	const sims = useMemo(() => simulatedYears(changes), [changes]);
	const uncovered = range(from, to).filter((y) => !sims.has(y));
	return { covered: uncovered.length === 0, partly: uncovered.length > 0 && uncovered.length < to - from + 1 };
}

function PerformanceEditor({ base, current, changes, onAdd, target }: EditorProps & { target: "driver" | "team" }) {
	const { curves, error } = useRatingCurves(base);
	const [id, setId] = useState<string | null>(target === "driver" ? "fernando-alonso" : "williams");
	const curve = useMemo(
		() =>
			!curves || !id
				? []
				: target === "driver"
					? (curves.drivers[id] ?? []).map(([year, v, team]) => ({ year, v, note: base.constructors.get(team)?.name }))
					: (curves.teams[id] ?? []).map(([year, v]) => ({ year, v, note: undefined as string | undefined })),
		[curves, id, target, base],
	);
	const first = curve[0]?.year ?? base.meta.firstYear;
	const last = curve[curve.length - 1]?.year ?? lastReal(base);
	const [span, setSpan] = useState<[number, number] | null>(null);
	const [fromYear, toYear] = span ?? [first, last];
	const lo = Math.min(fromYear, toYear);
	const hi = Math.max(fromYear, toYear);
	const [delta, setDelta] = useState(10);
	const { covered, partly } = useCoverage(changes, lo, Math.min(hi, lastReal(base)));
	const [resim, setResim] = useState(true);
	const [seed] = useState(randomSeed);
	const pick = (next: string) => {
		setId(next);
		setSpan(null);
	};
	const candidate = useMemo<Change[] | null>(() => {
		// the default span comes from the curve: wait for it rather than preview 75 seasons
		if (!id || (!span && !curves)) return null;
		const c: Change =
			target === "driver"
				? { id: newId(), kind: "driver-performance", driverId: id, fromYear: lo, toYear: hi, delta }
				: { id: newId(), kind: "team-performance", constructorId: id, fromYear: lo, toYear: hi, delta };
		const sim: Change = { id: newId(), kind: "history-sim", mode: "real-grids", fromYear: lo, toYear: Math.min(hi, lastReal(base)), seed, chaos: 1, reliability: 1 };
		return !covered && resim ? [sim, c] : [c];
	}, [id, target, lo, hi, delta, covered, resim, seed, base, span, curves]);
	const { preview, pending, progress } = usePreview(base, changes, candidate, `preview:${target}`);
	const data: CurvePoint[] = curve.map((p) => ({ year: p.year, real: p.v, changed: p.year >= lo && p.year <= hi ? p.v + delta : null, note: p.note }));
	const flips = useMemo(() => titleFlips(current, preview, range(lo, hi)), [current, preview, lo, hi]);
	const unit = target === "driver" ? "skill" : "car pace";
	const realTo = Math.min(hi, lastReal(base));

	return (
		<>
			<Section>
				{target === "driver" ? (
					<Picker label="Driver" value={id} options={driverOptions(base)} onChange={pick} searchable />
				) : (
					<Picker label="Team" value={id} options={teamOptions(base)} onChange={pick} searchable />
				)}
				<Picker label="From" value={fromYear} options={yearOptions(base)} onChange={(y) => setSpan([y, toYear])} />
				<Picker label="To" value={toYear} options={yearOptions(base)} onChange={(y) => setSpan([fromYear, y])} />
				<Slider
					label={target === "driver" ? "Skill change" : "Car pace change"}
					value={delta}
					min={target === "driver" ? -30 : -50}
					max={target === "driver" ? 30 : 50}
					step={1}
					onChange={setDelta}
					format={(v) => `${v > 0 ? "+" : ""}${v}`}
					hint={
						target === "driver"
							? "Points of the grid: +10 means qualifying about 10% of the field higher in the same car. Teammate gaps are typically 5–15."
							: "Points of the grid: +10 means the car qualifies about 10% of the field higher with the same drivers. The best and worst cars are usually 40–60 apart."
					}
					last
				/>
			</Section>
			{id ? (
				<Section
					title={target === "driver" ? `${driverName(base, id)}: skill by season` : `${teamName(base, id)}: car pace by season`}
					description={
						target === "driver"
							? "Derived from qualifying and race results against teammates, carried across teams and adjusted for age."
							: "Derived from where its cars qualified and finished, with the drivers’ own skill taken out."
					}
				>
					{curves ? <RatingChart data={data} unit={unit} /> : error ? <Note>{`Couldn’t derive the ratings: ${error}`}</Note> : <LoadingState label="Deriving ratings from 75 years of results" />}
				</Section>
			) : null}
			{!covered ? (
				<>
					<Note tone="universe">{`Performance changes reshape simulated races only. ${partly ? "Some of these seasons aren’t" : "These seasons aren’t"} simulated in this universe yet.`}</Note>
					<ToggleRow value={resim} onChange={setResim} label={`Also re-race ${lo === realTo ? lo : `${lo}–${realTo}`} with real grids`} />
				</>
			) : null}
			<AddBar onAdd={() => candidate && onAdd(candidate)} disabled={!candidate} />
			<Working pending={pending} progress={progress} />
			{preview && id ? (
				<>
					<SeasonCompare title={target === "driver" ? "Their seasons" : "The team’s seasons"} before={current} after={preview} id={id} from={lo} to={hi} constructors={target === "team"} />
					<TitleFlips flips={flips} before={current} after={preview} />
				</>
			) : null}
		</>
	);
}

export const DriverPerformanceEditor = (p: EditorProps) => <PerformanceEditor {...p} target="driver" />;
export const TeamPerformanceEditor = (p: EditorProps) => <PerformanceEditor {...p} target="team" />;

/* ------------------------------------------------------- seats & careers --- */

/** Seat moves and career changes act on simulated careers: offer a simulation if there isn't one. */
function useDynamicCoverage(base: Db, changes: Change[], from: number, to: number) {
	const sims = useMemo(() => simulatedYears(changes, "dynamic"), [changes]);
	const covered = range(from, to).every((y) => sims.has(y));
	const [resim, setResim] = useState(true);
	const [seed] = useState(randomSeed);
	const simFrom = Math.min(from, lastReal(base) + 1);
	const simTo = Math.max(to, from);
	const sim: Change | null = covered || !resim ? null : { id: newId(), kind: "history-sim", mode: "dynamic", fromYear: simFrom, toYear: simTo, seed, chaos: 1, reliability: 1, anchor: DEFAULT_ANCHOR };
	const notice = covered ? null : (
		<>
			<Note tone="universe">Seat moves and career changes shape simulated careers, so the seasons around them need simulating.</Note>
			<ToggleRow value={resim} onChange={setResim} label={`Also simulate careers ${simFrom}–${simTo}`} />
		</>
	);
	return { sim, notice };
}

export function SwapEditor({ base, current, changes, onAdd }: EditorProps) {
	const [year, setYear] = useState(2007);
	const [a, setA] = useState<string | null>("fernando-alonso");
	const [b, setB] = useState<string | null>("kimi-raikkonen");
	const candidate = useMemo<Change | null>(() => (a && b && a !== b ? { id: newId(), kind: "driver-swap", year, driverA: a, driverB: b } : null), [year, a, b]);
	const { preview, pending, progress } = usePreview(base, changes, candidate, "preview:swap");
	const teamOf = (id: string | null) => (id ? mainTeam(current, id, year) : null);
	const ta = teamOf(a);
	const tb = teamOf(b);
	return (
		<>
			<Section>
				<Picker label="Season" value={year} options={yearOptions(base)} onChange={setYear} />
				<Picker label="Driver" value={a} options={driverOptions(base)} onChange={setA} searchable />
				<Picker label="Swaps seats with" value={b} options={driverOptions(base)} onChange={setB} searchable last />
			</Section>
			<Note>
				{a && b
					? `${driverName(base, a)} takes the ${tb ? teamName(base, tb) : "other"} seat and ${driverName(base, b)} the ${ta ? teamName(base, ta) : "other"} one for the whole season, which is then re-raced. A driver who wasn’t racing that year simply takes the other’s car, if they were 17–45 and alive.`
					: "Choose two drivers."}
			</Note>
			<AddBar onAdd={() => candidate && onAdd([candidate])} disabled={!candidate} />
			<Working pending={pending} progress={progress} />
			{preview && candidate ? (
				<Preview title={`${year} final standings`} description="With the swap, re-raced with real grids otherwise.">
					<StandingsPreview before={current} after={preview} year={year} />
				</Preview>
			) : null}
		</>
	);
}

export function MoveEditor({ base, current, changes, onAdd }: EditorProps) {
	const [driverId, setDriverId] = useState<string | null>("charles-leclerc");
	const [teamId, setTeamId] = useState<string | null>("red-bull");
	const [fromYear, setFromYear] = useState(2021);
	const [toYear, setToYear] = useState(2024);
	const lo = Math.min(fromYear, toYear);
	const hi = Math.max(fromYear, toYear);
	const { sim, notice } = useDynamicCoverage(base, changes, lo, hi);
	const candidate = useMemo<Change[] | null>(
		() => (driverId && teamId ? [...(sim ? [sim] : []), { id: newId(), kind: "driver-move", driverId, constructorId: teamId, fromYear: lo, toYear: hi }] : null),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[driverId, teamId, lo, hi, sim?.fromYear, sim?.toYear, sim?.seed],
	);
	const { preview, pending, progress } = usePreview(base, changes, candidate, "preview:move");
	const years = spanOptions(base.meta.firstYear, FUTURE_LIMIT);
	return (
		<>
			<Section>
				<Picker label="Driver" value={driverId} options={driverOptions(base)} onChange={setDriverId} searchable />
				<Picker label="Drives for" value={teamId} options={teamOptions(base)} onChange={setTeamId} searchable />
				<Picker label="From" value={fromYear} options={years} onChange={setFromYear} />
				<Picker label="To" value={toYear} options={years} onChange={setToYear} last />
			</Section>
			<Note>The team signs them for these seasons whatever the market says, bumping whoever they’d have had. Ignored for any season the team isn’t on the grid, or the driver is outside 17–45 or no longer alive.</Note>
			{notice}
			<AddBar onAdd={() => candidate && onAdd(candidate)} disabled={!candidate} />
			<Working pending={pending} progress={progress} label="Simulating" />
			{preview && driverId ? <SeasonCompare title="Their seasons" before={current} after={preview} id={driverId} from={lo} to={hi} /> : null}
		</>
	);
}

export function CareerEditor({ base, current, changes, onAdd }: EditorProps) {
	const [driverId, setDriverId] = useState<string | null>("ayrton-senna");
	const [debut, setDebut] = useState<number | "real">("real");
	const [retire, setRetire] = useState<number | "real">("real");
	const career = useMemo(() => (driverId ? realCareer(base, driverId) : null), [base, driverId]);
	const realFirst = career?.[0] ?? 1990;
	const realLast = career?.[1] ?? 2000;
	const from = debut === "real" ? realFirst : debut;
	const to = Math.max(from, retire === "real" ? realLast : retire) + 2;
	const { sim, notice } = useDynamicCoverage(base, changes, debut === "real" ? Math.max(realFirst, (retire === "real" ? realLast : retire) - 1) : from - 1, to);
	const candidate = useMemo<Change[] | null>(
		() =>
			driverId && (debut !== "real" || retire !== "real")
				? [...(sim ? [sim] : []), { id: newId(), kind: "career", driverId, ...(debut !== "real" ? { debutYear: debut } : {}), ...(retire !== "real" ? { retireAfter: retire } : {}) }]
				: null,
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[driverId, debut, retire, sim?.fromYear, sim?.toYear, sim?.seed],
	);
	const { preview, pending, progress } = usePreview(base, changes, candidate, "preview:career");
	const dob = driverId ? base.drivers.get(driverId)?.dateOfBirth : null;
	const born = dob ? Number(dob.slice(0, 4)) : 1960;
	const pick = (id: string) => {
		setDriverId(id);
		setDebut("real");
		setRetire("real");
	};
	const ageOpts = (a: number, b: number, label: string) => [
		{ value: "real" as const, label },
		...range(Math.max(base.meta.firstYear, a), Math.min(FUTURE_LIMIT, b)).map((y) => ({ value: y, label: `${y} (aged ${y - born})` })),
	];
	return (
		<>
			<Section>
				<Picker label="Driver" value={driverId} options={driverOptions(base)} onChange={pick} searchable />
				<Picker<number | "real"> label="Debut" value={debut} options={ageOpts(born + 17, born + 40, `As simulated (really ${realFirst})`)} onChange={setDebut} />
				<Picker<number | "real"> label="Retire after" value={retire} options={ageOpts(born + 18, born + 45, `As simulated (really ${realLast})`)} onChange={setRetire} last />
			</Section>
			<Note>A set debut puts them on the grid that season (usually with a smaller team). A set retirement keeps them racing until then if a team will have them, and stops them after. Nobody races past 45.</Note>
			{notice}
			<AddBar onAdd={() => candidate && onAdd(candidate)} disabled={!candidate} />
			<Working pending={pending} progress={progress} label="Simulating" />
			{preview && driverId && candidate ? <SeasonCompare title="Their seasons" before={current} after={preview} id={driverId} from={Math.min(from, realFirst)} to={Math.min(to, FUTURE_LIMIT)} /> : null}
		</>
	);
}
