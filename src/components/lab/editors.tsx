"use client";

// One editor per kind of change. Each builds a candidate Change, shows a live
// preview of its effect, and hands it to `onAdd`.

import { useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Check, ChevronsUpDown, CircleSlash, Dices, Plus, RotateCcw, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { completedRaces, type Db, type Result } from "@/lib/f1/dataset";
import { CUSTOM_SYSTEM, POINTS_SYSTEMS, pointsSystemProblem, sanitizePointsSystem, type PointsSystem } from "@/lib/f1/points";
import { PointsBuilder, customFrom } from "@/components/points-builder";
import type { Change, UniverseDb } from "@/lib/universe/apply";
import { newId } from "@/lib/universe/store";
import { changesKey, useAppliedUniverse } from "@/lib/universe/use-universe";
import { driverRef, teamRef } from "@/lib/f1/views";
import { DriverLink, TeamLink } from "@/components/f1";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_SIM, randomSeed } from "@/lib/sim/race";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type EditorProps = { base: Db; current: Db; changes: Change[]; onAdd: (c: Change) => void; initialRaceId?: number };

/* ------------------------------------------------------------ primitives --- */

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<Label className="text-muted-foreground text-xs">{label}</Label>
			{children}
		</div>
	);
}

export function Choice<T extends string | number>({
	value,
	onChange,
	options,
	className,
}: {
	value: T;
	onChange: (v: T) => void;
	options: { value: T; label: string }[];
	className?: string;
}) {
	return (
		<Select items={options} value={value} onValueChange={(v) => onChange(v as T)}>
			<SelectTrigger className={cn("w-full", className)}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{options.map((o) => (
					<SelectItem key={String(o.value)} value={o.value}>
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export const yearOptions = (db: Db) =>
	db.years
		.filter((y) => completedRaces(db, y).length)
		.reverse()
		.map((y) => ({ value: y, label: String(y) }));

function RacePicker({ db, raceId, onChange }: { db: Db; raceId: number; onChange: (id: number) => void }) {
	const year = db.raceById.get(raceId)?.year ?? db.meta.lastCompletedYear;
	const races = completedRaces(db, year);
	return (
		<div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
			<Field label="Season">
				<Choice value={year} onChange={(y) => onChange(completedRaces(db, y)[0].id)} options={yearOptions(db)} />
			</Field>
			<Field label="Race">
				<Choice
					value={raceId}
					onChange={onChange}
					options={races.map((r) => ({ value: r.id, label: `Round ${r.round} · ${db.grandsPrix.get(r.grandPrixId)?.name ?? r.officialName}` }))}
				/>
			</Field>
		</div>
	);
}

export function SimControls({ chaos, setChaos, reliability, setReliability }: { chaos: number; setChaos: (n: number) => void; reliability: number; setReliability: (n: number) => void }) {
	return (
		<div className="grid gap-6 sm:grid-cols-2">
			<Field label="Unpredictability">
				<Slider min={0.2} max={2} step={0.1} value={[chaos]} onValueChange={(v) => setChaos(v[0])} />
				<span className="text-muted-foreground text-xs">{chaos < 0.6 ? "Form book" : chaos > 1.4 ? "Chaos" : "Normal race day"}</span>
			</Field>
			<Field label="Reliability">
				<Slider min={0} max={2} step={0.1} value={[reliability]} onValueChange={(v) => setReliability(v[0])} />
				<span className="text-muted-foreground text-xs">
					{reliability === 0 ? "No retirements" : reliability < 0.7 ? "Better than it really was" : reliability > 1.3 ? "Fragile" : "As it really was"}
				</span>
			</Field>
		</div>
	);
}

export function Delta({ by }: { by: number }) {
	if (!by) return null;
	const Icon = by > 0 ? ArrowUp : ArrowDown;
	return (
		<span className={cn("inline-flex items-center text-xs", by > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
			<Icon className="size-3" />
			{Math.abs(by)}
		</span>
	);
}

export const name = (db: Db, id: string) => db.drivers.get(id)?.name ?? id;
const team = (db: Db, id: string) => db.constructors.get(id)?.name ?? id;

export function PreviewCard({
	title,
	description,
	children,
	className,
	contentClassName,
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
	className?: string;
	contentClassName?: string;
}) {
	return (
		<Card className={cn("gap-3 pb-0", className)}>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				{description && <CardDescription>{description}</CardDescription>}
			</CardHeader>
			<CardContent className={cn("px-0", contentClassName)}>{children}</CardContent>
		</Card>
	);
}

export const tableEdges = "[&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5";

/** Race classification with movement vs. the universe so far. */
function ResultPreview({ db, before, after }: { db: Db; before: Result[]; after: Result[] }) {
	const rows = Math.min(Math.max(after.filter((r) => r.position).length, 10), 20);
	const prev = new Map(before.map((r) => [r.driverId, r]));
	return (
		<Table className={tableEdges}>
			<TableHeader>
				<TableRow>
					<TableHead className="w-12">Pos</TableHead>
					<TableHead>Driver</TableHead>
					<TableHead className="text-right">Was</TableHead>
					<TableHead className="text-right">Pts</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{after.slice(0, rows).map((r) => {
					const was = prev.get(r.driverId);
					return (
						<TableRow key={r.driverId}>
							<TableCell className="font-semibold tabular-nums">{r.positionText}</TableCell>
							<TableCell>
								<DriverLink driver={driverRef(db, r.driverId)} className="font-medium" />
								<div className="text-muted-foreground text-xs">{r.reasonRetired ?? <TeamLink team={teamRef(db, r.constructorId)} />}</div>
							</TableCell>
							<TableCell className="text-right">
								<span className="text-muted-foreground inline-flex items-center gap-1.5 tabular-nums">
									{was?.positionText ?? "–"}
									<Delta by={was?.position && r.position ? was.position - r.position : 0} />
								</span>
							</TableCell>
							<TableCell className="text-right tabular-nums">{r.points || ""}</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}

/** Championship table with movement vs. the universe so far. */
export function StandingsPreview({ before, after, year }: { before: Db; after: Db; year: number }) {
	const prev = new Map((before.driverStandings.get(year) ?? []).map((s) => [s.id, s]));
	return (
		<Table className={tableEdges}>
			<TableHeader>
				<TableRow>
					<TableHead className="w-12">Pos</TableHead>
					<TableHead>Driver</TableHead>
					<TableHead className="text-right">Pts</TableHead>
					<TableHead className="text-right">Before</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{(after.driverStandings.get(year) ?? []).slice(0, 12).map((s) => {
					const p = prev.get(s.id);
					return (
						<TableRow key={s.id}>
							<TableCell className="font-semibold tabular-nums">{s.positionText}</TableCell>
							<TableCell>
								<DriverLink driver={driverRef(after, s.id)} className="font-medium" />
							</TableCell>
							<TableCell className="text-right font-semibold tabular-nums">{s.points}</TableCell>
							<TableCell className="text-right">
								<span className="text-muted-foreground inline-flex items-center gap-1.5 tabular-nums">
									{p ? `P${p.positionText} · ${p.points}` : "–"}
									<Delta by={p?.position && s.position ? p.position - s.position : 0} />
								</span>
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}

export type Flip = { year: number; before: string; after: string };

export function TitleFlips({ flips, db }: { flips: Flip[]; db: Db }) {
	if (!flips.length)
		return (
			<p className="text-muted-foreground flex items-center gap-2 text-sm">
				<CircleSlash className="size-4" /> No drivers&apos; titles change hands.
			</p>
		);
	return (
		<PreviewCard title={`${flips.length} title${flips.length > 1 ? "s" : ""} change hands`}>
			<Table className={tableEdges}>
				<TableBody>
					{flips.map((f) => (
						<TableRow key={f.year}>
							<TableCell className="w-16 font-semibold tabular-nums">{f.year}</TableCell>
							<TableCell className="text-muted-foreground line-through">
								<DriverLink driver={driverRef(db, f.before)} flag={false} />
							</TableCell>
							<TableCell className="w-6">
								<ArrowRight className="text-muted-foreground size-4" />
							</TableCell>
							<TableCell className="text-universe font-medium">
								<DriverLink driver={driverRef(db, f.after)} />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</PreviewCard>
	);
}

export function titleFlips(_base: Db, before: Db, after: Db | null, years: Iterable<number>) {
	if (!after) return [];
	const out: Flip[] = [];
	for (const y of [...years].sort((a, b) => a - b)) {
		const b = before.driverStandings.get(y)?.find((s) => s.champion)?.id;
		const a = after.driverStandings.get(y)?.find((s) => s.champion)?.id;
		if (a && b && a !== b) out.push({ year: y, before: b, after: a });
	}
	return out;
}

/** The universe with a candidate change (or several) added, computed in the worker. Keeps the last preview while updating. */
export function usePreview(base: Db, changes: Change[], candidate: Change | Change[] | null, channel = "preview"): [UniverseDb | null, boolean] {
	const list = useMemo(() => (candidate ? [...changes, ...(Array.isArray(candidate) ? candidate : [candidate])] : null), [changes, candidate]);
	const key = useMemo(() => (list ? changesKey(channel, list) : null), [list, channel]);
	const { db, pending } = useAppliedUniverse(base, key, list, { channel, debounce: 120 });
	return [candidate ? db : null, pending];
}

export function Updating({ pending, label = "Updating preview" }: { pending: boolean; label?: string }) {
	if (!pending) return null;
	return (
		<span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
			<Spinner /> {label}
		</span>
	);
}

export function Actions({ onAdd, disabled, children }: { onAdd: () => void; disabled?: boolean; children?: React.ReactNode }) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			{children}
			<Button onClick={onAdd} disabled={disabled} className="bg-universe hover:bg-universe/90 ml-auto text-white">
				<Plus data-icon="inline-start" />
				Add to universe
			</Button>
		</div>
	);
}

export function Reroll({ seed, onReroll }: { seed: number; onReroll: () => void }) {
	return (
		<>
			<Button variant="outline" onClick={onReroll}>
				<Dices data-icon="inline-start" />
				Re-roll
			</Button>
			<Badge variant="secondary" className="tabular-nums">
				Seed {seed}
			</Badge>
		</>
	);
}

const lastRaceId = (db: Db) => {
	const races = completedRaces(db, db.meta.lastCompletedYear);
	return races[races.length - 1].id;
};

/* --------------------------------------------------------------- editors --- */

export function RaceSimEditor({ base, current, changes, onAdd, initialRaceId }: EditorProps) {
	const [raceId, setRaceId] = useState(initialRaceId ?? lastRaceId(base));
	const [seed, setSeed] = useState(randomSeed);
	const [chaos, setChaos] = useState(DEFAULT_SIM.chaos);
	const [reliability, setReliability] = useState(DEFAULT_SIM.reliability);
	const candidate = useMemo<Change>(() => ({ id: newId(), kind: "race-sim", raceId, seed, chaos, reliability }), [raceId, seed, chaos, reliability]);
	const [preview, pending] = usePreview(base, changes, candidate);
	const year = base.raceById.get(raceId)!.year;
	return (
		<div className="space-y-6">
			<RacePicker db={base} raceId={raceId} onChange={setRaceId} />
			<SimControls chaos={chaos} setChaos={setChaos} reliability={reliability} setReliability={setReliability} />
			<Actions onAdd={() => onAdd(candidate)}>
				<Updating pending={pending} />
				<Reroll seed={seed} onReroll={() => setSeed(randomSeed())} />
			</Actions>
			{preview && (
				<div className="grid gap-6 xl:grid-cols-2">
					<PreviewCard title="Simulated result" description="Same entry list and grid; pace from each car's real season form.">
						<ResultPreview db={base} before={current.resultsByRace.get(raceId) ?? []} after={preview.resultsByRace.get(raceId) ?? []} />
					</PreviewCard>
					<PreviewCard title={`${year} championship`} description="Final standings with this result.">
						<StandingsPreview before={current} after={preview} year={year} />
					</PreviewCard>
				</div>
			)}
		</div>
	);
}

export function SeasonSimEditor({ base, current, changes, onAdd }: EditorProps) {
	const [year, setYear] = useState(base.meta.lastCompletedYear);
	const [fromRound, setFromRound] = useState(1);
	const [seed, setSeed] = useState(randomSeed);
	const [chaos, setChaos] = useState(DEFAULT_SIM.chaos);
	const [reliability, setReliability] = useState(DEFAULT_SIM.reliability);
	const races = completedRaces(base, year);
	const candidate = useMemo<Change>(() => ({ id: newId(), kind: "season-sim", year, fromRound, seed, chaos, reliability }), [year, fromRound, seed, chaos, reliability]);
	const [preview, pending] = usePreview(base, changes, candidate);
	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
				<Field label="Season">
					<Choice
						value={year}
						onChange={(y) => {
							setYear(y);
							setFromRound(1);
						}}
						options={yearOptions(base)}
					/>
				</Field>
				<Field label="Re-run from">
					<Choice
						value={fromRound}
						onChange={setFromRound}
						options={races.map((r) => ({ value: r.round, label: r.round === 1 ? "The whole season" : `Round ${r.round} · ${base.grandsPrix.get(r.grandPrixId)?.name}` }))}
					/>
				</Field>
			</div>
			<SimControls chaos={chaos} setChaos={setChaos} reliability={reliability} setReliability={setReliability} />
			<Actions onAdd={() => onAdd(candidate)}>
				<Updating pending={pending} />
				<Reroll seed={seed} onReroll={() => setSeed(randomSeed())} />
			</Actions>
			{preview && (
				<PreviewCard title={`${year} final standings`} description={fromRound > 1 ? `Rounds 1–${fromRound - 1} as they happened; the rest simulated.` : "Every round simulated."}>
					<StandingsPreview before={current} after={preview} year={year} />
				</PreviewCard>
			)}
		</div>
	);
}

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
			return { ...s, order };
		});
	const retire = (id: string) => setState((s) => ({ order: s.order.filter((x) => x !== id), out: [id, ...s.out] }));
	const reinstate = (id: string) => setState((s) => ({ order: [...s.order, id], out: s.out.filter((x) => x !== id) }));
	const candidate = useMemo<Change>(() => ({ id: newId(), kind: "race-edit", raceId, order: state.order, retired: state.out }), [raceId, state]);
	const [preview, pending] = usePreview(base, changes, candidate);
	const year = base.raceById.get(raceId)!.year;
	const teams = new Map((current.resultsByRace.get(raceId) ?? []).map((r) => [r.driverId, r.constructorId]));
	return (
		<div className="space-y-6">
			<RacePicker db={base} raceId={raceId} onChange={setRaceId} />
			<Actions onAdd={() => onAdd(candidate)}>
				<Updating pending={pending} />
				<Button variant="outline" onClick={() => setState(startState(raceId))}>
					<RotateCcw data-icon="inline-start" />
					Reset
				</Button>
			</Actions>
			<div className="grid gap-6 xl:grid-cols-2">
				<PreviewCard title="Classification" description="Move drivers up or down, or retire them.">
					<Table className={tableEdges}>
						<TableBody>
							{state.order.map((id, i) => (
								<TableRow key={id}>
									<TableCell className="w-10 font-semibold tabular-nums">{i + 1}</TableCell>
									<TableCell>
										<div className="font-medium">{name(base, id)}</div>
										<div className="text-muted-foreground text-xs">{team(base, teams.get(id) ?? "")}</div>
									</TableCell>
									<TableCell className="w-px whitespace-nowrap text-right">
										<Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
											<ArrowUp />
										</Button>
										<Button variant="ghost" size="icon-sm" disabled={i === state.order.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
											<ArrowDown />
										</Button>
										<Button variant="ghost" size="sm" onClick={() => retire(id)}>
											<CircleSlash data-icon="inline-start" />
											Retire
										</Button>
									</TableCell>
								</TableRow>
							))}
							{state.out.map((id) => (
								<TableRow key={id} className="text-muted-foreground">
									<TableCell className="w-10">
										<Badge variant="secondary">DNF</Badge>
									</TableCell>
									<TableCell>{name(base, id)}</TableCell>
									<TableCell className="w-px text-right">
										<Button variant="ghost" size="sm" onClick={() => reinstate(id)}>
											<Undo2 data-icon="inline-start" />
											Classify
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</PreviewCard>
				{preview && (
					<PreviewCard title={`${year} championship`} description="Final standings with this result.">
						<StandingsPreview before={current} after={preview} year={year} />
					</PreviewCard>
				)}
			</div>
		</div>
	);
}

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
	const [preview, pending] = usePreview(base, changes, candidate);
	const flips = useMemo(() => titleFlips(base, current, preview, Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)), [base, current, preview, lo, hi]);
	const sys = POINTS_SYSTEMS.find((s) => s.id === system);
	const choose = (id: string) => {
		if (id === CUSTOM_SYSTEM && !draft) setDraft(customFrom(system));
		setSystem(id);
	};
	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px_140px]">
				<Field label="Points system">
					<Choice
						value={system}
						onChange={choose}
						options={[...POINTS_SYSTEMS.map((s) => ({ value: s.id, label: `${s.name}: ${s.description}` })), { value: CUSTOM_SYSTEM, label: "Custom…" }]}
					/>
				</Field>
				<Field label="From">
					<Choice value={fromYear} onChange={setFromYear} options={yearOptions(base)} />
				</Field>
				<Field label="To">
					<Choice value={toYear} onChange={setToYear} options={yearOptions(base)} />
				</Field>
			</div>
			{isCustom && draft ? (
				<PointsBuilder value={draft} onChange={setDraft} className="bg-muted/20 rounded-xl border p-4" />
			) : (
				sys && (
					<p className="text-muted-foreground text-sm">
						Races score <span className="text-foreground font-medium tabular-nums">{sys.race.join("-")}</span>
						{sys.sprint ? `, sprints ${sys.sprint.join("-")}` : ", sprints score nothing"}
						{sys.fastestLap ? `, +${sys.fastestLap.points} for fastest lap` : ""}. Every result counts; no dropped scores.
					</p>
				)
			)}
			<Actions onAdd={() => candidate && onAdd(candidate)} disabled={!candidate}>
				<Updating pending={pending} />
			</Actions>
			<TitleFlips flips={flips} db={preview ?? current} />
		</div>
	);
}

export function DriverCombobox({ db, value, onChange }: { db: Db; value: string | null; onChange: (id: string) => void }) {
	const [open, setOpen] = useState(false);
	const drivers = useMemo(() => [...db.drivers.values()].filter((d) => db.resultsByDriver.has(d.id)).sort((a, b) => a.lastName.localeCompare(b.lastName)), [db]);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
					{value ? name(db, value) : <span className="text-muted-foreground">Choose a driver</span>}
					<ChevronsUpDown className="text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-72 p-0" align="start">
				<Command>
					<CommandInput placeholder="Search drivers" />
					<CommandList>
						<CommandEmpty>No driver found.</CommandEmpty>
						<CommandGroup>
							{drivers.map((d) => (
								<CommandItem
									key={d.id}
									value={`${d.name} ${d.id}`}
									onSelect={() => {
										onChange(d.id);
										setOpen(false);
									}}
								>
									<Check className={cn("size-4", value === d.id ? "opacity-100" : "opacity-0")} />
									{d.name}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

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
	const [preview, pending] = usePreview(base, changes, candidate);
	const flips = useMemo(() => titleFlips(base, current, preview, preview?.modifiedYears ?? []), [base, current, preview]);
	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px_140px]">
				<Field label="Driver">
					<DriverCombobox db={base} value={driverId} onChange={pick} />
				</Field>
				<Field label="From">
					<Choice value={fromYear} onChange={setFromYear} options={yearOptions(base)} />
				</Field>
				<Field label="To">
					<Choice value={toYear} onChange={setToYear} options={yearOptions(base)} />
				</Field>
			</div>
			<p className="text-muted-foreground text-sm">The driver never takes part, and everyone who finished behind them moves up a place.</p>
			<Actions onAdd={() => candidate && onAdd(candidate)} disabled={!candidate}>
				<Updating pending={pending} />
			</Actions>
			{candidate && <TitleFlips flips={flips} db={preview ?? current} />}
		</div>
	);
}

export function TeamCombobox({ db, value, onChange }: { db: Db; value: string | null; onChange: (id: string) => void }) {
	const [open, setOpen] = useState(false);
	const teams = useMemo(() => [...db.constructors.values()].filter((t) => db.resultsByConstructor.has(t.id)).sort((a, b) => a.name.localeCompare(b.name)), [db]);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
					{value ? team(db, value) : <span className="text-muted-foreground">Choose a team</span>}
					<ChevronsUpDown className="text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-72 p-0" align="start">
				<Command>
					<CommandInput placeholder="Search teams" />
					<CommandList>
						<CommandEmpty>No team found.</CommandEmpty>
						<CommandGroup>
							{teams.map((t) => (
								<CommandItem
									key={t.id}
									value={`${t.name} ${t.id}`}
									onSelect={() => {
										onChange(t.id);
										setOpen(false);
									}}
								>
									<Check className={cn("size-4", value === t.id ? "opacity-100" : "opacity-0")} />
									{t.name}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
