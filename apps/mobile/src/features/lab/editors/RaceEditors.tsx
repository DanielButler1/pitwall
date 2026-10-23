// Editors for single races and seasons, results and points (the website's editors.tsx).

import { ArrowDown, ArrowUp, CircleSlash, RotateCcw, Undo2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { completedRaces, type Db } from "@pitwall/core/f1/dataset";
import { CUSTOM_SYSTEM, POINTS_SYSTEMS, pointsSystemProblem, sanitizePointsSystem, type PointsSystem } from "@pitwall/core/f1/points";
import { DEFAULT_SIM, randomSeed } from "@pitwall/core/sim/race";
import type { Change } from "@pitwall/core/universe/apply";
import { Badge, Button, IconButton, Row, Section, Text } from "@/components/ui";
import { customFrom, PointsBuilder } from "@/features/records/PointsBuilder";
import { haptic } from "@/lib/haptics";
import { Picker } from "../components/Picker";
import { Note, Preview, ResultPreview, StandingsPreview, TitleFlips, Working } from "../components/previews";
import { newId } from "../engine/store";
import { driverName, driverOptions, lastRaceId, raceOptions, range, teamName, titleFlips, yearOptions } from "../helpers";
import { AddBar, SimControls, usePreview, type EditorProps } from "./common";

function RacePicker({ db, raceId, onChange }: { db: Db; raceId: number; onChange: (id: number) => void }) {
	const year = db.raceById.get(raceId)?.year ?? db.meta.lastCompletedYear;
	return (
		<>
			<Picker label="Season" value={year} options={yearOptions(db)} onChange={(y) => onChange(completedRaces(db, y)[0].id)} />
			<Picker label="Race" value={raceId} options={raceOptions(db, year)} onChange={onChange} last />
		</>
	);
}

/* -------------------------------------------------------------- race sim --- */

export function RaceSimEditor({ base, current, changes, onAdd, initialRaceId }: EditorProps) {
	const [raceId, setRaceId] = useState(initialRaceId ?? lastRaceId(base));
	const [seed, setSeed] = useState(randomSeed);
	const [chaos, setChaos] = useState(DEFAULT_SIM.chaos);
	const [reliability, setReliability] = useState(DEFAULT_SIM.reliability);
	const candidate = useMemo<Change>(() => ({ id: newId(), kind: "race-sim", raceId, seed, chaos, reliability }), [raceId, seed, chaos, reliability]);
	const { preview, pending, progress } = usePreview(base, changes, candidate);
	const year = base.raceById.get(raceId)!.year;
	return (
		<>
			<Section>
				<RacePicker db={base} raceId={raceId} onChange={setRaceId} />
				<SimControls chaos={chaos} setChaos={setChaos} reliability={reliability} setReliability={setReliability} />
			</Section>
			<AddBar onAdd={() => onAdd([candidate])} seed={seed} onReroll={() => setSeed(randomSeed())} />
			<Working pending={pending} progress={progress} />
			{preview ? (
				<>
					<Preview title="Simulated result" description="Same entry list and grid; pace from each car’s real season form.">
						<ResultPreview db={base} before={current.resultsByRace.get(raceId) ?? []} after={preview.resultsByRace.get(raceId) ?? []} />
					</Preview>
					<Preview title={`${year} championship`} description="Final standings with this result.">
						<StandingsPreview before={current} after={preview} year={year} />
					</Preview>
				</>
			) : null}
		</>
	);
}

/* ------------------------------------------------------------ season sim --- */

export function SeasonSimEditor({ base, current, changes, onAdd }: EditorProps) {
	const [year, setYear] = useState(base.meta.lastCompletedYear);
	const [fromRound, setFromRound] = useState(1);
	const [seed, setSeed] = useState(randomSeed);
	const [chaos, setChaos] = useState(DEFAULT_SIM.chaos);
	const [reliability, setReliability] = useState(DEFAULT_SIM.reliability);
	const races = completedRaces(base, year);
	const candidate = useMemo<Change>(() => ({ id: newId(), kind: "season-sim", year, fromRound, seed, chaos, reliability }), [year, fromRound, seed, chaos, reliability]);
	const { preview, pending, progress } = usePreview(base, changes, candidate);
	return (
		<>
			<Section>
				<Picker
					label="Season"
					value={year}
					options={yearOptions(base)}
					onChange={(y) => {
						setYear(y);
						setFromRound(1);
					}}
				/>
				<Picker
					label="Re-run from"
					value={fromRound}
					options={races.map((r) => ({ value: r.round, label: r.round === 1 ? "The whole season" : `Round ${r.round} · ${base.grandsPrix.get(r.grandPrixId)?.name}` }))}
					onChange={setFromRound}
				/>
				<SimControls chaos={chaos} setChaos={setChaos} reliability={reliability} setReliability={setReliability} />
			</Section>
			<AddBar onAdd={() => onAdd([candidate])} seed={seed} onReroll={() => setSeed(randomSeed())} />
			<Working pending={pending} progress={progress} />
			{preview ? (
				<Preview title={`${year} final standings`} description={fromRound > 1 ? `Rounds 1–${fromRound - 1} as they happened; the rest simulated.` : "Every round simulated."}>
					<StandingsPreview before={current} after={preview} year={year} />
				</Preview>
			) : null}
		</>
	);
}

/* ------------------------------------------------------------- race edit --- */

const NON_STARTS = ["DNQ", "DNPQ", "DNP", "DNS"];

export function RaceEditEditor({ base, current, changes, onAdd, initialRaceId }: EditorProps) {
	const startState = (id: number) => {
		const list = current.resultsByRace.get(id) ?? [];
		return {
			order: list.filter((r) => r.position != null).map((r) => r.driverId),
			out: list.filter((r) => r.position == null && !NON_STARTS.includes(r.positionText)).map((r) => r.driverId),
		};
	};
	const [raceId, setRaceIdRaw] = useState(initialRaceId ?? lastRaceId(base));
	const [state, setState] = useState(() => startState(raceId));
	const setRaceId = (id: number) => {
		setRaceIdRaw(id);
		setState(startState(id));
	};
	const move = (i: number, d: number) =>
		setState((s) => {
			const order = [...s.order];
			const j = i + d;
			if (j < 0 || j >= order.length) return s;
			[order[i], order[j]] = [order[j], order[i]];
			haptic("selection");
			return { ...s, order };
		});
	const retire = (id: string) => setState((s) => ({ order: s.order.filter((x) => x !== id), out: [id, ...s.out] }));
	const reinstate = (id: string) => setState((s) => ({ order: [...s.order, id], out: s.out.filter((x) => x !== id) }));
	const candidate = useMemo<Change>(() => ({ id: newId(), kind: "race-edit", raceId, order: state.order, retired: state.out }), [raceId, state]);
	const { preview, pending, progress } = usePreview(base, changes, candidate);
	const year = base.raceById.get(raceId)!.year;
	const teams = new Map((current.resultsByRace.get(raceId) ?? []).map((r) => [r.driverId, r.constructorId]));
	return (
		<>
			<Section>
				<RacePicker db={base} raceId={raceId} onChange={setRaceId} />
			</Section>
			<AddBar onAdd={() => onAdd([candidate])} />
			<Section
				title="Classification"
				description="Move drivers up or down, or retire them."
				action={<Button label="Reset" icon={RotateCcw} variant="ghost" size="sm" onPress={() => setState(startState(raceId))} />}
			>
				{state.order.map((id, i) => (
					<Row
						key={id}
						leading={<Text variant="label" className="w-6 text-center tabular-nums">{i + 1}</Text>}
						title={driverName(base, id)}
						subtitle={teamName(base, teams.get(id) ?? "")}
						trailing={
							<View className="flex-row items-center">
								<IconButton icon={ArrowUp} label={`Move ${driverName(base, id)} up`} onPress={() => move(i, -1)} className={i === 0 ? "opacity-30" : undefined} />
								<IconButton icon={ArrowDown} label={`Move ${driverName(base, id)} down`} onPress={() => move(i, 1)} className={i === state.order.length - 1 ? "opacity-30" : undefined} />
								<IconButton icon={CircleSlash} label={`Retire ${driverName(base, id)}`} tone="muted" onPress={() => retire(id)} />
							</View>
						}
						last={i === state.order.length - 1 && !state.out.length}
					/>
				))}
				{state.out.map((id, i) => (
					<Row
						key={id}
						leading={<Badge label="DNF" />}
						title={driverName(base, id)}
						trailing={<Button label="Classify" icon={Undo2} variant="ghost" size="sm" onPress={() => reinstate(id)} />}
						last={i === state.out.length - 1}
					/>
				))}
			</Section>
			<Working pending={pending} progress={progress} />
			{preview ? (
				<Preview title={`${year} championship`} description="Final standings with this result.">
					<StandingsPreview before={current} after={preview} year={year} />
				</Preview>
			) : null}
		</>
	);
}

/* ---------------------------------------------------------------- points --- */

export function PointsEditor({ base, current, changes, onAdd }: EditorProps) {
	const [system, setSystem] = useState("2010");
	const [draft, setDraft] = useState<PointsSystem | null>(null);
	const [fromYear, setFromYear] = useState(1950);
	const [toYear, setToYear] = useState(base.meta.lastCompletedYear);
	const lo = Math.min(fromYear, toYear);
	const hi = Math.max(fromYear, toYear);
	const isCustom = system === CUSTOM_SYSTEM;
	const custom = useMemo(() => (isCustom && draft && !pointsSystemProblem(draft) ? sanitizePointsSystem(draft) : null), [isCustom, draft]);
	const candidate = useMemo<Change | null>(() => {
		if (!isCustom) return { id: newId(), kind: "points", system, fromYear: lo, toYear: hi };
		return custom && { id: newId(), kind: "points", system: CUSTOM_SYSTEM, custom, fromYear: lo, toYear: hi };
	}, [isCustom, system, custom, lo, hi]);
	const { preview, pending, progress } = usePreview(base, changes, candidate);
	const flips = useMemo(() => titleFlips(current, preview, range(lo, hi)), [current, preview, lo, hi]);
	const sys = POINTS_SYSTEMS.find((s) => s.id === system);
	const choose = (id: string) => {
		if (id === CUSTOM_SYSTEM && !draft) setDraft(customFrom(system));
		setSystem(id);
	};
	return (
		<>
			<Section>
				<Picker
					label="Points system"
					value={system}
					options={[...POINTS_SYSTEMS.map((s) => ({ value: s.id, label: s.name, detail: s.description })), { value: CUSTOM_SYSTEM, label: "Custom", detail: "Build your own" }]}
					onChange={choose}
				/>
				<Picker label="From" value={fromYear} options={yearOptions(base)} onChange={setFromYear} />
				<Picker label="To" value={toYear} options={yearOptions(base)} onChange={setToYear} last />
			</Section>
			{isCustom && draft ? (
				<Section title="Your system">
					<PointsBuilder value={draft} onChange={setDraft} />
				</Section>
			) : sys ? (
				<Note>{`Races score ${sys.race.join("-")}${sys.sprint ? `, sprints ${sys.sprint.join("-")}` : ", sprints score nothing"}${sys.fastestLap ? `, +${sys.fastestLap.points} for fastest lap` : ""}. Every result counts; no dropped scores.`}</Note>
			) : null}
			<AddBar onAdd={() => candidate && onAdd([candidate])} disabled={!candidate} />
			<Working pending={pending} progress={progress} />
			{preview ? <TitleFlips flips={flips} before={current} after={preview} /> : null}
		</>
	);
}

/* --------------------------------------------------------- remove driver --- */

export function RemoveDriverEditor({ base, current, changes, onAdd }: EditorProps) {
	const [driverId, setDriverId] = useState<string | null>(null);
	const [fromYear, setFromYear] = useState(1950);
	const [toYear, setToYear] = useState(base.meta.lastCompletedYear);
	const pick = (id: string) => {
		setDriverId(id);
		const rs = base.resultsByDriver.get(id)!;
		setFromYear(base.raceById.get(rs[0].raceId)!.year);
		setToYear(base.raceById.get(rs[rs.length - 1].raceId)!.year);
	};
	const candidate = useMemo<Change | null>(
		() => (driverId ? { id: newId(), kind: "remove-driver", driverId, fromYear: Math.min(fromYear, toYear), toYear: Math.max(fromYear, toYear) } : null),
		[driverId, fromYear, toYear],
	);
	const { preview, pending, progress } = usePreview(base, changes, candidate);
	const flips = useMemo(() => titleFlips(current, preview, preview?.modifiedYears ?? []), [current, preview]);
	return (
		<>
			<Section>
				<Picker label="Driver" value={driverId} options={driverOptions(base)} onChange={pick} placeholder="Choose a driver" searchable />
				<Picker label="From" value={fromYear} options={yearOptions(base)} onChange={setFromYear} />
				<Picker label="To" value={toYear} options={yearOptions(base)} onChange={setToYear} last />
			</Section>
			<Note>The driver never takes part, and everyone who finished behind them moves up a place.</Note>
			<AddBar onAdd={() => candidate && onAdd([candidate])} disabled={!candidate} />
			<Working pending={pending} progress={progress} />
			{candidate && preview ? <TitleFlips flips={flips} before={current} after={preview} /> : null}
		</>
	);
}
