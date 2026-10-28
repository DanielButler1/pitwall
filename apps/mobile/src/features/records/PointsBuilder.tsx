// Build a points system (the website's PointsBuilder): start from a preset, edit the points for each
// position, add bonuses (sprint, fastest lap, pole, finishing) and season rules (best N results,
// double points finale). Controlled: the parent keeps the system and sanitises it before scoring.

import { Minus, Plus } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { TextInput, View } from "react-native";
import { MAX_POSITIONS, POINTS_SYSTEMS, describeSystem, pointsSystemProblem, sanitizePointsSystem, type PointsSystem } from "@pitwall/core/f1/points";
import { Button, Chip, ChipRow, Text, TextField } from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";

const DEFAULT_SPRINT = [8, 7, 6, 5, 4, 3, 2, 1];

/** A starting point for the builder: a preset, copied as a custom system. */
export function customFrom(presetId = "2010", name = "My points"): PointsSystem {
	const preset = POINTS_SYSTEMS.find((s) => s.id === presetId) ?? POINTS_SYSTEMS[0]!;
	return sanitizePointsSystem({ ...preset, name })!;
}

const round = (n: number) => Math.round(n * 100) / 100;

const QUICK_FILLS: { label: string; apply: (xs: number[]) => number[] }[] = [
	{ label: "Linear", apply: (xs) => xs.map((_, i) => xs.length - i) },
	{ label: "Halve", apply: (xs) => xs.map((x) => round(x / 2)) },
	{ label: "Double", apply: (xs) => xs.map((x) => round(x * 2)) },
	{ label: "Top 3 only", apply: (xs) => xs.slice(0, 3) },
	{ label: "Top 10", apply: (xs) => Array.from({ length: 10 }, (_, i) => xs[i] ?? 0) },
];

const CELL = { width: "20%", padding: 3 } as const;

export function PointsBuilder({ value, onChange }: { value: PointsSystem; onChange(s: PointsSystem): void }) {
	const [from, setFrom] = useState<string | null>(null);
	const set = (patch: Partial<PointsSystem>) => {
		const next = { ...value, ...patch };
		onChange({ ...next, description: describeSystem(next) });
	};
	const startFrom = (presetId: string) => {
		haptic("selection");
		setFrom(presetId);
		const s = customFrom(presetId, value.name);
		// keep the season rules already chosen
		onChange(sanitizePointsSystem({ ...s, bestResults: value.bestResults, doubleFinal: value.doubleFinal, pole: value.pole, finishing: value.finishing })!);
	};
	const problem = pointsSystemProblem(value);

	return (
		<View className="gap-5">
			<View className="gap-1.5 px-4">
				<Text variant="caption">Name</Text>
				<TextField value={value.name} maxLength={60} onChangeText={(name) => set({ name })} placeholder="My points" />
			</View>
			<View className="gap-1.5">
				<Text variant="caption" className="px-4">Start from a preset</Text>
				<ChipRow>
					{POINTS_SYSTEMS.map((s) => (
						<Chip key={s.id} label={s.name} selected={from === s.id} onPress={() => startFrom(s.id)} />
					))}
				</ChipRow>
			</View>

			<PositionGrid label="Race points" values={value.race} onChange={(race) => set({ race })} quickFills />

			<Toggle label="Sprint points" checked={!!value.sprint} onChange={(on) => set({ sprint: on ? DEFAULT_SPRINT : undefined })}>
				{value.sprint ? <PositionGrid label="Sprint points" values={value.sprint} onChange={(sprint) => set({ sprint })} hideLabel /> : null}
			</Toggle>
			<Toggle label="Fastest lap bonus" checked={!!value.fastestLap} onChange={(on) => set({ fastestLap: on ? { points: 1, withinTop: 10 } : undefined })}>
				{value.fastestLap ? (
					<Line>
						<NumberField label="Fastest lap points" value={value.fastestLap.points} onChange={(points) => set({ fastestLap: { ...value.fastestLap!, points } })} />
						<Text variant="muted">points, only within the top</Text>
						<NumberField
							label="Fastest lap only counts within the top N (0 for anyone)"
							value={value.fastestLap.withinTop ?? 0}
							integer
							max={MAX_POSITIONS}
							onChange={(n) => set({ fastestLap: { points: value.fastestLap!.points, ...(n ? { withinTop: n } : {}) } })}
						/>
						<Text variant="caption">(0: anyone)</Text>
					</Line>
				) : null}
			</Toggle>
			<Toggle label="Pole position bonus" checked={value.pole != null} onChange={(on) => set({ pole: on ? 1 : undefined })}>
				{value.pole != null ? (
					<Line>
						<Text variant="muted">+</Text>
						<NumberField label="Pole position points" value={value.pole} onChange={(pole) => set({ pole })} />
						<Text variant="muted">points for the polesitter</Text>
					</Line>
				) : null}
			</Toggle>
			<Toggle label="Points for finishing" checked={value.finishing != null} onChange={(on) => set({ finishing: on ? 1 : undefined })}>
				{value.finishing != null ? (
					<Line>
						<Text variant="muted">+</Text>
						<NumberField label="Points for every classified finisher" value={value.finishing} onChange={(finishing) => set({ finishing })} />
						<Text variant="muted">for every classified finisher</Text>
					</Line>
				) : null}
			</Toggle>
			<Toggle label="Count best results only" checked={value.bestResults != null} onChange={(on) => set({ bestResults: on ? 10 : undefined })}>
				{value.bestResults != null ? (
					<Line>
						<Text variant="muted">Best</Text>
						<NumberField label="Number of results that count" value={value.bestResults} integer min={1} max={MAX_POSITIONS} onChange={(bestResults) => set({ bestResults })} />
						<Text variant="muted">race weekends count</Text>
					</Line>
				) : null}
			</Toggle>
			<Toggle label="Double points for the final race" checked={!!value.doubleFinal} onChange={(on) => set({ doubleFinal: on || undefined })} />

			<View className="mx-4 rounded-md bg-muted/60 px-3 py-2.5" accessibilityLiveRegion="polite">
				<Text variant="small">
					<Text variant="small" className="text-muted-foreground">Summary: </Text>
					<Text variant="small" className="font-semibold">{describeSystem(value)}</Text>
				</Text>
				{problem ? <Text variant="caption" className="mt-1 text-destructive">{problem}</Text> : null}
			</View>
		</View>
	);
}

function Line({ children }: { children: ReactNode }) {
	return <View className="flex-row flex-wrap items-center gap-2 px-4 pt-2">{children}</View>;
}

function Toggle({ label, checked, onChange, children }: { label: string; checked: boolean; onChange(on: boolean): void; children?: ReactNode }) {
	return (
		<View>
			<View className="flex-row items-center justify-between gap-3 px-4">
				<Text variant="body" className="flex-1">{label}</Text>
				<Switch value={checked} onValueChange={onChange} accessibilityLabel={label} />
			</View>
			{checked ? children : null}
		</View>
	);
}

/** A number box that lets you type freely ("", "0.") and only reports valid values. */
function NumberField({ label, value, onChange, integer = false, min = 0, max = 1000, className }: { label: string; value: number; onChange(n: number): void; integer?: boolean; min?: number; max?: number; className?: string }) {
	const [text, setText] = useState(String(value));
	const [prev, setPrev] = useState(value);
	if (value !== prev) {
		setPrev(value);
		if (Number(text) !== value) setText(String(value));
	}
	const valid = (n: number) => Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n));
	const invalid = text.trim() === "" || !valid(Number(text.replace(",", ".")));
	return (
		<TextInput
			accessibilityLabel={label}
			value={text}
			keyboardType={integer ? "number-pad" : "decimal-pad"}
			selectTextOnFocus
			onChangeText={(t) => {
				setText(t);
				const n = Number(t.replace(",", "."));
				if (t.trim() !== "" && valid(n)) onChange(integer ? n : round(n));
			}}
			onBlur={() => setText(String(value))}
			className={cn("h-10 min-w-14 rounded-md border bg-background px-2 text-right font-sans text-[15px] text-foreground", invalid ? "border-destructive" : "border-input", className)}
			cursorColorClassName="accent-primary"
		/>
	);
}

function PositionGrid({ label, values, onChange, quickFills = false, hideLabel = false }: { label: string; values: number[]; onChange(xs: number[]): void; quickFills?: boolean; hideLabel?: boolean }) {
	const setAt = (i: number, n: number) => onChange(values.map((x, j) => (j === i ? n : x)));
	return (
		<View className="gap-2 pt-2">
			{hideLabel ? null : <Text variant="label" className="px-4">{label}</Text>}
			<View className="flex-row flex-wrap px-3">
				{values.map((v, i) => (
					<View key={i} style={CELL}>
						<Text variant="caption" className="mb-0.5 pl-0.5 tabular-nums">{`P${i + 1}`}</Text>
						<NumberField label={`${label}: P${i + 1}`} value={v} onChange={(n) => setAt(i, n)} className="min-w-0" />
					</View>
				))}
			</View>
			<View className="flex-row gap-2 px-4">
				<Button label="Position" icon={Plus} variant="outline" size="sm" disabled={values.length >= MAX_POSITIONS} onPress={() => onChange([...values, 0])} accessibilityLabel={`Add a scoring position to ${label.toLowerCase()}`} />
				<Button label="Position" icon={Minus} variant="outline" size="sm" disabled={values.length <= 1} onPress={() => onChange(values.slice(0, -1))} accessibilityLabel={`Remove the last scoring position from ${label.toLowerCase()}`} />
			</View>
			{quickFills ? (
				<ChipRow>
					{QUICK_FILLS.map((q) => (
						<Chip key={q.label} label={q.label === "Linear" ? `Linear ${values.length}→1` : q.label} onPress={() => onChange(q.apply(values))} />
					))}
				</ChipRow>
			) : null}
		</View>
	);
}
