// "All results" on a driver or constructor screen: every race entry, filterable to the wins,
// podiums, poles, fastest laps or retirements, and by season. Built on the device from the
// dataset (the website fetches the same list as a file).

import { memo, useMemo } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { entityResults, unpackResults, type EntityResult, type ResultsKind } from "@pitwall/core/f1/entity-results";
import { Pos } from "@/components/f1";
import { Row, Section } from "@/components/ui";
import { useView } from "@/data/dataset";
import { ChoiceChips, MoreButton, Note } from "@/features/browse/kit";
import { num } from "@/lib/format";
import { href, useOpen } from "@/lib/links";

export const RESULT_FILTERS = {
	all: { label: "All", test: () => true },
	wins: { label: "Wins", test: (r: EntityResult) => r.position === "1" },
	podiums: { label: "Podiums", test: (r: EntityResult) => r.position === "1" || r.position === "2" || r.position === "3" },
	poles: { label: "Poles", test: (r: EntityResult) => r.pole },
	"fastest-laps": { label: "Fastest laps", test: (r: EntityResult) => r.fastestLap },
	retirements: { label: "Retirements", test: (r: EntityResult) => r.position === "DNF" },
} as const;
export type ResultFilter = keyof typeof RESULT_FILTERS;

export type ResultsState = { filter: ResultFilter; season: string; shown: number };
export const RESULTS_PAGE = 25;
const STEP = 50;
export const initialResults: ResultsState = { filter: "all", season: "all", shown: RESULTS_PAGE };

const ResultRow = memo(function ResultRow({ r, last, onPress }: { r: EntityResult; last: boolean; onPress(): void }) {
	const grid = r.grid ? `Grid ${r.grid}` : r.grid === 0 ? "Pit lane" : null;
	const subtitle = [r.other.name, grid && (r.pole ? `${grid} (pole)` : grid), r.fastestLap ? "Fastest lap" : null].filter(Boolean).join(" · ");
	return (
		<Row
			leading={<View className="w-10 items-center"><Pos text={r.position} /></View>}
			title={`${r.race.year} ${r.race.name}`}
			subtitle={subtitle}
			value={r.points ? `${num(r.points)} pts` : null}
			onPress={onPress}
			last={last}
		/>
	);
});

/** `state` is lifted so the stat tiles above can open the list filtered. */
export function AllResults({ kind, id, state, onChange, onLayout }: { kind: ResultsKind; id: string; state: ResultsState; onChange(s: ResultsState): void; onLayout?(e: LayoutChangeEvent): void }) {
	const rows = useView((db) => unpackResults(entityResults(db, kind, id)), [kind, id]);
	const open = useOpen();
	const years = useMemo(() => [...new Set(rows.map((r) => r.race.year))].reverse(), [rows]);
	const counts = useMemo(() => Object.fromEntries(Object.entries(RESULT_FILTERS).map(([k, f]) => [k, rows.filter(f.test).length])) as Record<ResultFilter, number>, [rows]);
	const shown = useMemo(() => rows.filter((r) => RESULT_FILTERS[state.filter].test(r) && (state.season === "all" || String(r.race.year) === state.season)).reverse(), [rows, state.filter, state.season]);
	const visible = shown.slice(0, state.shown);
	return (
		<View onLayout={onLayout}>
			<Section title="All results" description={`${num(rows.length)} race entries, newest first`}>
				<View className="gap-2 pb-1 pt-2">
					<ChoiceChips<ResultFilter>
						value={state.filter}
						onChange={(filter) => onChange({ ...state, filter, shown: RESULTS_PAGE })}
						options={(Object.keys(RESULT_FILTERS) as ResultFilter[]).filter((k) => k === "all" || counts[k] > 0).map((k) => ({ value: k, label: k === "all" ? "All" : `${RESULT_FILTERS[k].label} ${counts[k]}` }))}
					/>
					{years.length > 1 ? (
						<ChoiceChips value={state.season} onChange={(season) => onChange({ ...state, season, shown: RESULTS_PAGE })} options={[{ value: "all", label: "Every season" }, ...years.map((y) => ({ value: String(y), label: String(y) }))]} />
					) : null}
				</View>
				{visible.length ? (
					visible.map((r, i) => <ResultRow key={`${r.race.year}-${r.race.round}-${r.other.id}-${i}`} r={r} last={i === visible.length - 1} onPress={() => open(href.race(r.race))} />)
				) : (
					<Note>Nothing to show for this filter.</Note>
				)}
				<MoreButton shown={visible.length} total={shown.length} step={STEP} onPress={() => onChange({ ...state, shown: state.shown + STEP })} />
			</Section>
		</View>
	);
}
