"use client";

// Build a points system: start from a preset, edit the points for each position,
// add bonuses (sprint, fastest lap, pole, finishing) and season rules (best N
// results, double points finale). Controlled: the parent keeps the system, and
// sanitises it (`sanitizePointsSystem`) before scoring with it.

import { useId, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_POSITIONS, POINTS_SYSTEMS, describeSystem, pointsSystemProblem, sanitizePointsSystem, type PointsSystem } from "@pitwall/core/f1/points";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";

const DEFAULT_SPRINT = [8, 7, 6, 5, 4, 3, 2, 1];

/** A starting point for the builder: a preset, copied as a custom system. */
export function customFrom(presetId = "2010", name = "My points"): PointsSystem {
	const preset = POINTS_SYSTEMS.find((s) => s.id === presetId) ?? POINTS_SYSTEMS[0];
	return sanitizePointsSystem({ ...preset, name })!;
}

const round = (n: number) => Math.round(n * 100) / 100;

const QUICK_FILLS: { label: string; hint: string; apply: (xs: number[]) => number[] }[] = [
	{ label: "Linear", hint: "Count down by one to 1 for the last scoring place", apply: (xs) => xs.map((_, i) => xs.length - i) },
	{ label: "Halve", hint: "Halve every value", apply: (xs) => xs.map((x) => round(x / 2)) },
	{ label: "Double", hint: "Double every value", apply: (xs) => xs.map((x) => round(x * 2)) },
	{ label: "Top 3 only", hint: "Keep the podium places only", apply: (xs) => xs.slice(0, 3) },
	{ label: "Top 10", hint: "Points down to tenth place", apply: (xs) => Array.from({ length: 10 }, (_, i) => xs[i] ?? 0) },
];

export function PointsBuilder({ value, onChange, className }: { value: PointsSystem; onChange: (s: PointsSystem) => void; className?: string }) {
	const id = useId();
	const [from, setFrom] = useState<string | null>(null);
	const set = (patch: Partial<PointsSystem>) => {
		const next = { ...value, ...patch };
		onChange({ ...next, description: describeSystem(next) });
	};
	const startFrom = (presetId: string) => {
		setFrom(presetId);
		const s = customFrom(presetId, value.name);
		// keep the season rules the user already chose
		onChange(sanitizePointsSystem({ ...s, bestResults: value.bestResults, doubleFinal: value.doubleFinal, pole: value.pole, finishing: value.finishing })!);
	};
	const problem = pointsSystemProblem(value);
	const presets = POINTS_SYSTEMS.map((s) => ({ value: s.id, label: `${s.name}: ${s.description}` }));

	return (
		<div className={cn("space-y-5", className)}>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-2">
					<Label htmlFor={`${id}-name`} className="text-muted-foreground text-xs">
						Name
					</Label>
					<Input id={`${id}-name`} value={value.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} placeholder="My points" />
				</div>
				<div className="flex flex-col gap-2">
					<Label className="text-muted-foreground text-xs">Start from</Label>
					<Select items={presets} value={from} onValueChange={(v) => startFrom(v as string)}>
						<SelectTrigger className="w-full" aria-label="Start from a preset">
							<SelectValue placeholder="Copy a preset…" />
						</SelectTrigger>
						<SelectContent>
							{presets.map((o) => (
								<SelectItem key={o.value} value={o.value}>
									{o.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<PositionGrid label="Race points" name="race" values={value.race} onChange={(race) => set({ race })} quickFills />

			<div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
				<Toggle label="Sprint points" checked={!!value.sprint} onChange={(on) => set({ sprint: on ? DEFAULT_SPRINT : undefined })} className="lg:col-span-2">
					{value.sprint && <PositionGrid label="Sprint points" name="sprint" values={value.sprint} onChange={(sprint) => set({ sprint })} hideLabel />}
				</Toggle>
				<Toggle label="Fastest lap bonus" checked={!!value.fastestLap} onChange={(on) => set({ fastestLap: on ? { points: 1, withinTop: 10 } : undefined })}>
					{value.fastestLap && (
						<div className="flex flex-wrap items-center gap-2 text-sm">
							<NumberField label="Fastest lap points" value={value.fastestLap.points} onChange={(points) => set({ fastestLap: { ...value.fastestLap!, points } })} />
							<span className="text-muted-foreground">points, only within the top</span>
							<NumberField
								label="Fastest lap only counts within the top N (0 for anyone)"
								value={value.fastestLap.withinTop ?? 0}
								integer
								max={MAX_POSITIONS}
								onChange={(n) => set({ fastestLap: { points: value.fastestLap!.points, ...(n ? { withinTop: n } : {}) } })}
							/>
							<span className="text-muted-foreground text-xs">(0: anyone)</span>
						</div>
					)}
				</Toggle>
				<Toggle label="Pole position bonus" checked={value.pole != null} onChange={(on) => set({ pole: on ? 1 : undefined })}>
					{value.pole != null && <Bonus label="Pole position points" value={value.pole} onChange={(pole) => set({ pole })} suffix="points for the polesitter" />}
				</Toggle>
				<Toggle label="Points for finishing" checked={value.finishing != null} onChange={(on) => set({ finishing: on ? 1 : undefined })}>
					{value.finishing != null && (
						<Bonus label="Points for every classified finisher" value={value.finishing} onChange={(finishing) => set({ finishing })} suffix="for every classified finisher" />
					)}
				</Toggle>
				<Toggle label="Count best results only" checked={value.bestResults != null} onChange={(on) => set({ bestResults: on ? 10 : undefined })}>
					{value.bestResults != null && (
						<div className="flex flex-wrap items-center gap-2 text-sm">
							<span className="text-muted-foreground">Best</span>
							<NumberField label="Number of results that count" value={value.bestResults} integer min={1} max={MAX_POSITIONS} onChange={(bestResults) => set({ bestResults })} />
							<span className="text-muted-foreground">race weekends count</span>
						</div>
					)}
				</Toggle>
				<Toggle label="Double points for the final race" checked={!!value.doubleFinal} onChange={(on) => set({ doubleFinal: on || undefined })} />
			</div>

			<div className="bg-muted/50 rounded-lg px-3 py-2 text-sm" aria-live="polite">
				<span className="text-muted-foreground">Summary: </span>
				<span className="font-medium tabular-nums">{describeSystem(value)}</span>
				{problem && <p className="text-destructive mt-1 text-xs">{problem}</p>}
			</div>
		</div>
	);
}

/* --------------------------------------------------------------- pieces --- */

function Toggle({
	label,
	checked,
	onChange,
	children,
	className,
}: {
	label: string;
	checked: boolean;
	onChange: (on: boolean) => void;
	children?: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("space-y-2", className)}>
			<Label className="w-fit cursor-pointer">
				<Switch checked={checked} onCheckedChange={onChange} />
				{label}
			</Label>
			{checked && children}
		</div>
	);
}

function Bonus({ label, value, onChange, suffix }: { label: string; value: number; onChange: (n: number) => void; suffix: string }) {
	return (
		<div className="flex flex-wrap items-center gap-2 text-sm">
			<span className="text-muted-foreground">+</span>
			<NumberField label={label} value={value} onChange={onChange} />
			<span className="text-muted-foreground">{suffix}</span>
		</div>
	);
}

/** A number input that lets you type freely ("", "0.") and only reports valid values. */
function NumberField({
	label,
	value,
	onChange,
	integer = false,
	min = 0,
	max = 1000,
	className,
}: {
	label: string;
	value: number;
	onChange: (n: number) => void;
	integer?: boolean;
	min?: number;
	max?: number;
	className?: string;
}) {
	const [text, setText] = useState(String(value));
	const [prev, setPrev] = useState(value);
	if (value !== prev) {
		setPrev(value);
		if (Number(text) !== value) setText(String(value));
	}
	const valid = (n: number) => Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n));
	const invalid = text.trim() === "" || !valid(Number(text));
	return (
		<Input
			type="number"
			inputMode={integer ? "numeric" : "decimal"}
			min={min}
			max={max}
			step={integer ? 1 : "any"}
			aria-label={label}
			aria-invalid={invalid || undefined}
			value={text}
			onChange={(e) => {
				setText(e.target.value);
				const n = Number(e.target.value);
				if (e.target.value.trim() !== "" && valid(n)) onChange(integer ? n : round(n));
			}}
			onBlur={() => setText(String(value))}
			className={cn("h-8 w-16 px-2 text-right tabular-nums", className)}
		/>
	);
}

function PositionGrid({
	label,
	name,
	values,
	onChange,
	quickFills = false,
	hideLabel = false,
}: {
	label: string;
	name: string;
	values: number[];
	onChange: (xs: number[]) => void;
	quickFills?: boolean;
	hideLabel?: boolean;
}) {
	const setAt = (i: number, n: number) => onChange(values.map((x, j) => (j === i ? n : x)));
	return (
		<fieldset className="space-y-2">
			<legend className={cn("text-muted-foreground mb-2 text-xs font-medium", hideLabel && "sr-only")}>{label}</legend>
			<ol className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-2">
				{values.map((v, i) => (
					<li key={i} className="flex flex-col gap-1">
						<span className="text-muted-foreground text-[11px] tabular-nums" aria-hidden>
							P{i + 1}
						</span>
						<NumberField label={`${label}: P${i + 1}`} value={v} onChange={(n) => setAt(i, n)} className="w-full" />
					</li>
				))}
			</ol>
			<div className="flex flex-wrap items-center gap-1.5">
				<Button
					variant="outline"
					size="xs"
					onClick={() => onChange([...values, 0])}
					disabled={values.length >= MAX_POSITIONS}
					aria-label={`Add a scoring position to ${name} points`}
				>
					<Plus data-icon="inline-start" /> Position
				</Button>
				<Button variant="outline" size="xs" onClick={() => onChange(values.slice(0, -1))} disabled={values.length <= 1} aria-label={`Remove the last ${name} scoring position`}>
					<Minus data-icon="inline-start" /> Position
				</Button>
				{quickFills && (
					<>
						<span className="text-muted-foreground ml-2 text-xs">Quick fill:</span>
						{QUICK_FILLS.map((q) => (
							<Button key={q.label} variant="ghost" size="xs" onClick={() => onChange(q.apply(values))} aria-label={`${q.label}: ${q.hint}`}>
								{q.label === "Linear" ? `Linear ${values.length}→1` : q.label}
							</Button>
						))}
					</>
				)}
			</div>
		</fieldset>
	);
}
