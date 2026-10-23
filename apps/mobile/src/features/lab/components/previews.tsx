// What a candidate change does, shown under each editor: a race classification, a championship
// table, titles changing hands, a driver's or team's seasons. Rows rather than the website's tables.

import { ArrowDown, ArrowUp, CircleSlash } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import type { Db, Result } from "@pitwall/core/f1/dataset";
import { Pos } from "@/components/f1";
import { Icon, Row, Section, Spinner, Text, useToneColor } from "@/components/ui";
import { cn } from "@/lib/cn";
import { num } from "@/lib/format";
import type { ApplyProgress } from "../engine/apply";
import { driverName, mainTeam, range, shortName, standing, teamName, type Flip } from "../helpers";

/** Places gained (up, universe colour) or lost (down). */
export function Delta({ by }: { by: number }) {
	if (!by) return null;
	return (
		<View className="flex-row items-center" accessibilityLabel={by > 0 ? `Up ${by}` : `Down ${-by}`}>
			<Icon icon={by > 0 ? ArrowUp : ArrowDown} tone={by > 0 ? "universe" : "destructive"} size={13} />
			<Text variant="caption" className={cn("tabular-nums", by > 0 ? "text-universe" : "text-destructive")}>
				{Math.abs(by)}
			</Text>
		</View>
	);
}

/** "Updating preview" / "Simulating 1994 · 35%", while a preview is being worked out. */
export function Working({ pending, progress, label = "Updating preview" }: { pending: boolean; progress?: ApplyProgress | null; label?: string }) {
	const colour = useToneColor("muted");
	if (!pending) return null;
	const text = progress ? `${progress.label}${progress.fraction != null ? ` · ${Math.round(progress.fraction * 100)}%` : ""}` : label;
	return (
		<View className="flex-row items-center gap-2 px-4 py-3">
			<Spinner size="small" color={colour} />
			<Text variant="muted">{text}</Text>
		</View>
	);
}

/** A thin bar for long builds. */
export function ProgressBar({ fraction }: { fraction: number | null }) {
	return (
		<View className="mx-4 h-1 overflow-hidden rounded-full bg-muted">
			<View className="h-1 rounded-full bg-universe" style={{ width: `${Math.round((fraction ?? 0.08) * 100)}%` }} />
		</View>
	);
}

export function Preview({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
	return (
		<Section title={title} description={description}>
			{children}
		</Section>
	);
}

/** Race classification with movement against the universe so far. */
export function ResultPreview({ db, before, after }: { db: Db; before: Result[]; after: Result[] }) {
	const rows = Math.min(Math.max(after.filter((r) => r.position).length, 10), 20);
	const prev = new Map(before.map((r) => [r.driverId, r]));
	const shown = after.slice(0, rows);
	return (
		<>
			{shown.map((r, i) => {
				const was = prev.get(r.driverId);
				return (
					<Row
						key={r.driverId}
						leading={<Pos text={r.positionText} />}
						title={driverName(db, r.driverId)}
						subtitle={`${r.reasonRetired ?? teamName(db, r.constructorId)} · was ${was?.positionText ?? "–"}${r.points ? ` · ${num(r.points)} pts` : ""}`}
						trailing={<Delta by={was?.position && r.position ? was.position - r.position : 0} />}
						last={i === shown.length - 1}
					/>
				);
			})}
		</>
	);
}

/** Championship table with movement against the universe so far. */
export function StandingsPreview({ before, after, year }: { before: Db; after: Db; year: number }) {
	const prev = new Map((before.driverStandings.get(year) ?? []).map((s) => [s.id, s]));
	const rows = (after.driverStandings.get(year) ?? []).slice(0, 12);
	return (
		<>
			{rows.map((s, i) => {
				const p = prev.get(s.id);
				return (
					<Row
						key={s.id}
						leading={<Pos text={s.positionText} />}
						title={driverName(after, s.id)}
						subtitle={p ? `Before: P${p.positionText} · ${num(p.points)} pts` : "Not in the standings before"}
						value={`${num(s.points)} pts`}
						trailing={<Delta by={p?.position && s.position ? p.position - s.position : 0} />}
						last={i === rows.length - 1}
					/>
				);
			})}
		</>
	);
}

/** Drivers' titles that change hands. */
export function TitleFlips({ flips, before, after }: { flips: Flip[]; before: Db; after: Db }) {
	if (!flips.length)
		return (
			<View className="flex-row items-center gap-2 px-4 py-4">
				<Icon icon={CircleSlash} tone="muted" size={16} />
				<Text variant="muted">No drivers’ titles change hands.</Text>
			</View>
		);
	return (
		<Section title={`${flips.length} title${flips.length > 1 ? "s" : ""} change hands`}>
			{flips.map((f, i) => (
				<Row
					key={f.year}
					leading={<Text variant="label" className="w-11 tabular-nums">{f.year}</Text>}
					title={driverName(after, f.after)}
					subtitle={`In place of ${shortName(driverName(before, f.before))}`}
					last={i === flips.length - 1}
				/>
			))}
		</Section>
	);
}

/** A driver's (or team's) championship seasons, before and after. */
export function SeasonCompare({ title, before, after, id, from, to, constructors }: { title: string; before: Db; after: Db; id: string; from: number; to: number; constructors?: boolean }) {
	const years = range(from, to).filter((y) => after.racesByYear.has(y));
	return (
		<Section title={title} description="Championship position and points, before and after.">
			{years.map((y, i) => {
				const b = standing(before, y, id, constructors);
				const a = standing(after, y, id, constructors);
				const team = constructors ? null : mainTeam(after, id, y);
				return (
					<Row
						key={y}
						leading={<Text variant="label" className="w-11 tabular-nums">{y}</Text>}
						title={a ? `P${a.positionText} · ${num(a.points)} pts` : "–"}
						subtitle={[constructors ? null : team ? teamName(after, team) : "No seat", `Before: ${b ? `P${b.positionText} · ${num(b.points)}` : "–"}`].filter(Boolean).join(" · ")}
						trailing={<Delta by={a?.position && b?.position ? b.position - a.position : 0} />}
						last={i === years.length - 1}
					/>
				);
			})}
		</Section>
	);
}

/** A plain explanatory paragraph under a form; `universe` for a caveat that needs acting on. */
export function Note({ children, tone }: { children: ReactNode; tone?: "universe" }) {
	return (
		<View className="px-4 pt-3">
			{typeof children === "string" ? <Text variant={tone ? "small" : "muted"} className={cn(tone && "text-universe")}>{children}</Text> : children}
		</View>
	);
}
