// Every season, newest first: the champions (or the leaders, while one is running) and the rounds.

import { memo, useMemo, useState } from "react";
import { View } from "react-native";
import { seasonsView, type SeasonsView } from "@pitwall/core/f1/views";
import { DetailScreen, Flag, Page } from "@/components/f1";
import { Badge, Chip, ChipRow, EmptyState, Row, SearchField, Text } from "@/components/ui";
import { useUniverseBase, useView } from "@/data/dataset";
import { num } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { href, useOpen } from "@/lib/links";

type SeasonRow = SeasonsView["rows"][number];

const SeasonItem = memo(function SeasonItem({ r, open }: { r: SeasonRow; open(path: string): void }) {
	const champion = r.champion ? `${r.champion.name}${r.championPoints != null ? `, ${num(r.championPoints)} pts` : ""}` : "Not started";
	const constructors = r.constructorChampion ? `Constructors: ${r.constructorChampion.name}` : null;
	return (
		<Row
			title={String(r.year)}
			subtitle={[r.inProgress && r.champion ? `Leader: ${champion}` : champion, [constructors, r.realChampion ? `real champion ${r.realChampion.name}` : null].filter(Boolean).join(" · ")].filter(Boolean).join("\n")}
			leading={
				<View className="w-7 items-center">
					<Flag code={r.champion?.country} />
				</View>
			}
			trailing={
				<View className="items-end gap-1">
					{r.inProgress ? <Badge label="In progress" tone="primary" /> : null}
					{r.modified ? <Badge label={r.simulated ? "Simulated" : "Altered"} tone="neutral" /> : null}
					<Text variant="caption" className="tabular-nums">
						{`${r.races} ${r.races === 1 ? "round" : "rounds"}`}
					</Text>
				</View>
			}
			onPress={() => open(href.season(r.year))}
		/>
	);
});

export function SeasonsScreen() {
	const base = useUniverseBase();
	const view = useView((db) => seasonsView(db, base), [base]);
	const open = useOpen();
	const [query, setQuery] = useState("");
	const [decade, setDecade] = useState<number | null>(null);
	const decades = useMemo(() => [...new Set(view.rows.map((r) => Math.floor(r.year / 10) * 10))], [view]);
	const rows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return view.rows.filter((r) => {
			if (decade != null && Math.floor(r.year / 10) * 10 !== decade) return false;
			if (!q) return true;
			return [String(r.year), r.champion?.name, r.championTeam?.name, r.constructorChampion?.name].some((x) => x?.toLowerCase().includes(q));
		});
	}, [view, query, decade]);
	const pick = (d: number | null) => {
		haptic("selection");
		setDecade((x) => (x === d ? null : d));
	};
	return (
		<DetailScreen title="Seasons" subtitle={`Every championship since ${view.rows.at(-1)?.year ?? 1950}`}>
			<Page>
				<View className="gap-3 pb-2 pt-1">
					<View className="px-4">
						<SearchField value={query} onChangeText={setQuery} placeholder="Year, champion or team" />
					</View>
					<ChipRow>
						<Chip label="All" selected={decade == null} onPress={() => pick(null)} />
						{decades.map((d) => (
							<Chip key={d} label={`${d}s`} selected={decade === d} onPress={() => pick(d)} />
						))}
					</ChipRow>
				</View>
				{rows.length ? rows.map((r) => <SeasonItem key={r.year} r={r} open={open} />) : <EmptyState title="No seasons match" body="Try a year, a champion's name or a team." />}
			</Page>
		</DetailScreen>
	);
}
